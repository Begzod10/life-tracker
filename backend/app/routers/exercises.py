"""Exercises — write a sentence using a dictionary word.

Workflow:
    1. Client calls GET /exercises/words to fetch N target words (SRS-aware by
       default; filterable by folder/module/difficulty).
    2. Client calls POST /exercises/start to open a PracticeSession with
       mode='exercise' (so the existing streak/history surfaces include it).
    3. User writes one sentence per word; client calls POST /exercises/grade
       with the full payload. Groq evaluates each sentence, the SRS is
       updated per word, individual ExerciseAttempt rows are persisted, and
       the session row is closed.

Falls back gracefully when GROQ_API_KEY is not configured by returning a clear
503 — the front-end surfaces that as a non-blocking error.
"""
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import List, Optional
import json
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.services import srs


router = APIRouter(prefix="/exercises", tags=["exercises"])


# ─── Word selection (mirrors practice.py with examples preserved) ───────────

@router.get("/words")
def get_exercise_words(
    count: int = Query(default=5, ge=1, le=30),
    difficulty: Optional[str] = Query(None),
    module_id: Optional[int] = Query(None),
    folder_id: Optional[int] = Query(None),
    due_only: bool = Query(default=False),
    weak_only: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    q = db.query(models.DictionaryWord).filter(
        models.DictionaryWord.person_id == current_user.id,
        models.DictionaryWord.deleted == False,
    )
    if module_id is not None:
        q = q.filter(models.DictionaryWord.module_id == module_id)
    if folder_id is not None:
        q = q.join(
            models.DictionaryModule,
            models.DictionaryWord.module_id == models.DictionaryModule.id,
        ).filter(models.DictionaryModule.folder_id == folder_id)
    if difficulty:
        q = q.filter(models.DictionaryWord.difficulty == difficulty)
    if due_only:
        q = q.filter(or_(
            models.DictionaryWord.next_review_at.is_(None),
            models.DictionaryWord.next_review_at <= datetime.utcnow(),
        ))

    all_words = q.all()

    if weak_only:
        def is_weak(w: models.DictionaryWord) -> bool:
            if w.review_count == 0:
                return True
            return (w.correct_count / w.review_count) < 0.7
        all_words = [w for w in all_words if is_weak(w)]

    if not all_words:
        raise HTTPException(
            status_code=400,
            detail="No words available for exercises. Add some words or relax the filters.",
        )

    now = datetime.utcnow()

    def priority_bucket(w: models.DictionaryWord) -> int:
        if w.next_review_at is not None and w.next_review_at <= now:
            return 0  # due (includes just-missed)
        if w.review_count == 0:
            return 1  # never seen
        return 2

    all_words.sort(key=lambda w: (
        priority_bucket(w),
        w.review_count,
        w.last_reviewed_at or w.created_at,
    ))
    selected = all_words[:count]

    return [
        {
            "id": w.id,
            "word": w.word,
            "definition": w.definition,
            "translation": w.translation,
            "part_of_speech": w.part_of_speech,
            "phonetic": w.phonetic,
            "examples": json.loads(w.examples) if w.examples else [],
            "difficulty": w.difficulty,
        }
        for w in selected
    ]


# ─── Session bookkeeping ────────────────────────────────────────────────────

@router.post("/start")
def start_exercise_session(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Open a PracticeSession row with mode='exercise' for this run."""
    session = models.PracticeSession(
        person_id=current_user.id,
        mode="exercise",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"id": session.id, "started_at": session.started_at.isoformat()}


# ─── Grading via Groq ───────────────────────────────────────────────────────

class GradeItem(BaseModel):
    word_id: int
    sentence: str = Field(..., min_length=1, max_length=400)


class GradeRequest(BaseModel):
    session_id: Optional[int] = None
    items: List[GradeItem]


_GRADER_SYSTEM = """You are a meticulous English-as-a-second-language teacher grading short sentences.

For each (word, sentence) pair, judge whether the learner has used the target word correctly. Be strict about MEANING and PART OF SPEECH, lenient about minor punctuation or capitalisation.

A sentence is correct (is_correct=true) only when ALL hold:
- The target word (or an obvious inflection: -s, -ed, -ing, comparative/superlative) appears.
- It's used with the intended meaning from the provided definition.
- The grammar is acceptable for an English learner — no broken syntax.
- The sentence is a real sentence, not a 1-2 word fragment.

usage_score is 0–100. A score of 80+ implies is_correct=true.

Return ONLY a JSON object — no markdown, no prose:
{
  "items": [
    {
      "word_id": <int>,
      "is_correct": <bool>,
      "usage_score": <0..100 int>,
      "feedback": "<one short sentence — what's right or wrong>",
      "suggested_revision": "<a natural rewrite, or null if already good>"
    }
  ]
}

Feedback rules:
- Be specific. Cite the actual word from the sentence.
- One sentence, max ~25 words.
- If correct: confirm what made it work (collocation, register, structure).
- If wrong: name the issue (wrong sense, wrong part of speech, ungrammatical, missing word) and how to fix it."""


def _grader_user_prompt(items: list[dict]) -> str:
    lines = ["Grade the following:\n"]
    for it in items:
        lines.append(f"- word_id: {it['word_id']}")
        lines.append(f"  word: {it['word']}")
        if it.get("part_of_speech"):
            lines.append(f"  part_of_speech: {it['part_of_speech']}")
        lines.append(f"  definition: {it['definition']}")
        lines.append(f"  sentence: {it['sentence']}")
        lines.append("")
    return "\n".join(lines)


def _coerce_grade(raw: dict, fallback_id: int) -> dict:
    """Normalise a single grader item, tolerating missing keys."""
    word_id = int(raw.get("word_id") or fallback_id)
    is_correct = bool(raw.get("is_correct"))
    score = raw.get("usage_score")
    try:
        score_int = max(0, min(100, int(score))) if score is not None else None
    except (TypeError, ValueError):
        score_int = None
    feedback = (raw.get("feedback") or "").strip() or None
    revision = raw.get("suggested_revision")
    if isinstance(revision, str):
        revision = revision.strip() or None
    else:
        revision = None
    return {
        "word_id": word_id,
        "is_correct": is_correct,
        "usage_score": score_int,
        "feedback": feedback,
        "suggested_revision": revision,
    }


async def _grade_via_groq(grader_items: list[dict]) -> list[dict]:
    from groq import (
        AsyncGroq,
        APIConnectionError,
        APIError,
        AuthenticationError,
        RateLimitError,
    )

    client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    # Budget ~150 output tokens per item for feedback + suggested_revision,
    # plus ~150 for the JSON envelope. A 10-item batch needs ~1.6k; the prior
    # 900-cap silently truncated and made `message.content` None, which then
    # crashed `.strip()` as an unhandled AttributeError → generic 500.
    max_tokens = max(700, 200 + 150 * len(grader_items))
    try:
        response = await client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": _GRADER_SYSTEM},
                {"role": "user", "content": _grader_user_prompt(grader_items)},
            ],
            max_tokens=max_tokens,
            temperature=0.2,
            stream=False,
            # Force a valid JSON object — eliminates the markdown-fence /
            # prose-leak class of parse failures entirely.
            response_format={"type": "json_object"},
        )
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Grader auth failed: {exc}",
        ) from exc
    except RateLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Grader rate-limited: {exc}",
        ) from exc
    except APIConnectionError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"Grader unreachable: {exc}",
        ) from exc
    except APIError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Grader API error: {exc}",
        ) from exc

    if not response.choices:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Grader returned no choices.",
        )

    choice = response.choices[0]
    raw = choice.message.content
    if not raw:
        finish = getattr(choice, "finish_reason", "unknown")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                f"Grader returned empty content (finish_reason={finish}). "
                "Try fewer items or shorter sentences."
            ),
        )
    raw = raw.strip()
    # Defensive: even with response_format set, strip any stray fences.
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        finish = getattr(choice, "finish_reason", "unknown")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                f"Grader returned invalid JSON (finish_reason={finish}): "
                f"{raw[:200]}"
            ),
        )
    items = data.get("items") or []
    if not isinstance(items, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Grader payload missing 'items' list",
        )

    grades_by_id: dict[int, dict] = {}
    for i, raw_item in enumerate(items):
        if not isinstance(raw_item, dict):
            continue
        coerced = _coerce_grade(raw_item, grader_items[i]["word_id"] if i < len(grader_items) else 0)
        grades_by_id[coerced["word_id"]] = coerced

    # Fill missing word_ids with a defensive default so we never lose attempts.
    result = []
    for src in grader_items:
        g = grades_by_id.get(src["word_id"])
        if g is None:
            g = {
                "word_id": src["word_id"],
                "is_correct": False,
                "usage_score": None,
                "feedback": "Grader did not return a verdict for this item.",
                "suggested_revision": None,
            }
        result.append(g)
    return result


@router.post("/grade")
async def grade_exercises(
    request: GradeRequest,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    if not settings.GROQ_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Exercises grader is not configured. Set GROQ_API_KEY.",
        )
    if not request.items:
        raise HTTPException(status_code=400, detail="No sentences submitted.")

    # Load words and verify ownership.
    word_ids = [it.word_id for it in request.items]
    words = db.query(models.DictionaryWord).filter(
        models.DictionaryWord.id.in_(word_ids),
        models.DictionaryWord.person_id == current_user.id,
    ).all()
    word_by_id = {w.id: w for w in words}
    missing = [wid for wid in word_ids if wid not in word_by_id]
    if missing:
        raise HTTPException(
            status_code=404,
            detail=f"Words not found or not yours: {missing}",
        )

    # Build grader input.
    grader_items = [
        {
            "word_id": it.word_id,
            "word": word_by_id[it.word_id].word,
            "definition": word_by_id[it.word_id].definition,
            "part_of_speech": word_by_id[it.word_id].part_of_speech,
            "sentence": it.sentence.strip(),
        }
        for it in request.items
    ]

    grades = await _grade_via_groq(grader_items)
    grade_by_word: dict[int, dict] = {g["word_id"]: g for g in grades}

    # Verify session if supplied.
    session: Optional[models.PracticeSession] = None
    if request.session_id is not None:
        session = db.query(models.PracticeSession).filter(
            models.PracticeSession.id == request.session_id,
            models.PracticeSession.person_id == current_user.id,
            models.PracticeSession.mode == "exercise",
        ).first()
        if not session:
            raise HTTPException(status_code=404, detail="Exercise session not found")

    now = datetime.utcnow()
    results: list[dict] = []
    correct_count = 0

    for it in request.items:
        word = word_by_id[it.word_id]
        grade = grade_by_word[it.word_id]
        was_correct = bool(grade["is_correct"])
        if was_correct:
            correct_count += 1

        # Persist the attempt.
        attempt = models.ExerciseAttempt(
            person_id=current_user.id,
            session_id=session.id if session else None,
            word_id=word.id,
            sentence=it.sentence.strip(),
            is_correct=was_correct,
            usage_score=grade["usage_score"],
            feedback=grade["feedback"],
            suggested_revision=grade["suggested_revision"],
            created_at=now,
        )
        db.add(attempt)

        # Update SRS on the word. apply_result handles review_count,
        # correct_count, last_reviewed_at, interval_days, next_review_at,
        # and the per-card ease_factor/reps/lapses.
        srs.apply_result(word, was_correct=was_correct, now=now)

        results.append({
            "word_id": word.id,
            "word": word.word,
            "sentence": it.sentence.strip(),
            "is_correct": was_correct,
            "usage_score": grade["usage_score"],
            "feedback": grade["feedback"],
            "suggested_revision": grade["suggested_revision"],
            "next_review_at": word.next_review_at.isoformat(),
        })

    # Close session.
    if session is not None:
        session.total_questions = len(request.items)
        session.correct_answers = correct_count
        session.completed_at = now

    db.commit()

    return {
        "session_id": session.id if session else None,
        "total": len(request.items),
        "correct": correct_count,
        "accuracy": round(correct_count / len(request.items) * 100) if request.items else 0,
        "results": results,
    }


# ─── History ────────────────────────────────────────────────────────────────

@router.get("/history")
def get_exercise_history(
    limit: int = Query(default=20, ge=1, le=100),
    word_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    q = db.query(models.ExerciseAttempt).filter(
        models.ExerciseAttempt.person_id == current_user.id,
    )
    if word_id is not None:
        q = q.filter(models.ExerciseAttempt.word_id == word_id)
    attempts = q.order_by(models.ExerciseAttempt.created_at.desc()).limit(limit).all()

    word_ids = list({a.word_id for a in attempts})
    word_map: dict[int, models.DictionaryWord] = {
        w.id: w
        for w in db.query(models.DictionaryWord).filter(
            models.DictionaryWord.id.in_(word_ids),
        ).all()
    } if word_ids else {}

    return [
        {
            "id": a.id,
            "session_id": a.session_id,
            "word_id": a.word_id,
            "word": word_map[a.word_id].word if a.word_id in word_map else None,
            "sentence": a.sentence,
            "is_correct": a.is_correct,
            "usage_score": a.usage_score,
            "feedback": a.feedback,
            "suggested_revision": a.suggested_revision,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in attempts
    ]


# ─── Stats — used by the learning-landing card ───────────────────────────────

@router.get("/stats")
def get_exercise_stats(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Aggregate exercise activity for the learning landing card."""
    total = db.query(models.ExerciseAttempt).filter(
        models.ExerciseAttempt.person_id == current_user.id,
    ).count()
    if total == 0:
        return {"total": 0, "correct": 0, "accuracy": 0, "last_7d_total": 0, "last_7d_correct": 0}

    correct = db.query(models.ExerciseAttempt).filter(
        models.ExerciseAttempt.person_id == current_user.id,
        models.ExerciseAttempt.is_correct == True,
    ).count()

    week_ago = datetime.utcnow() - timedelta(days=7)
    recent = db.query(models.ExerciseAttempt).filter(
        models.ExerciseAttempt.person_id == current_user.id,
        models.ExerciseAttempt.created_at >= week_ago,
    ).all()
    last_7d_total = len(recent)
    last_7d_correct = sum(1 for a in recent if a.is_correct)

    return {
        "total": total,
        "correct": correct,
        "accuracy": round(correct / total * 100) if total else 0,
        "last_7d_total": last_7d_total,
        "last_7d_correct": last_7d_correct,
    }
