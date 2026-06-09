"""Exercises — multi-type vocabulary practice with SRS.

Workflow:
    1. Client calls GET /exercises/words to browse words (legacy / setup preview).
    2. Client calls POST /exercises/start with {source, count, mode, ...}.
       Server selects words, assigns exercise types (SRS-driven), persists
       items_plan on the session, and returns rendered questions (no answers).
    3. User answers; client calls POST /exercises/grade with responses.
       Deterministic types (MC, cloze, spelling, anagram) are graded locally.
       Production types (sentence variants) go to Groq.
       SRS is updated, attempts are persisted, session is closed — all in one
       atomic transaction.
"""
from datetime import datetime, timedelta
from typing import List, Optional
import json
import re

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.services import srs
from app.services.exercise_types import (
    DETERMINISTIC_TYPES,
    GRAMMAR_ERROR_LABELS,
    PRODUCTION_TYPES,
    VALID_MODES,
    assign_groups,
    build_question,
    grade_deterministic,
    pick_exercise_type,
)


router = APIRouter(prefix="/exercises", tags=["exercises"])

_VALID_SOURCES = {"smart", "due", "weak", "all"}
_MAX_ITEMS = 10


# ─── Word selection helper (shared by GET /words and POST /start) ────────────

def _select_words(
    db: Session,
    current_user: models.Person,
    count: int,
    source: str,
    module_id: Optional[int] = None,
    folder_id: Optional[int] = None,
    difficulty: Optional[str] = None,
) -> list[models.DictionaryWord]:
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

    if source == "due":
        q = q.filter(or_(
            models.DictionaryWord.next_review_at.is_(None),
            models.DictionaryWord.next_review_at <= datetime.utcnow(),
        ))

    all_words = q.all()

    if source == "weak":
        def is_weak(w: models.DictionaryWord) -> bool:
            if w.review_count == 0:
                return True
            return (w.correct_count / w.review_count) < 0.7
        all_words = [w for w in all_words if is_weak(w)]

    if not all_words:
        raise HTTPException(
            status_code=400,
            detail="No words available. Add some words or relax the filters.",
        )

    now = datetime.utcnow()

    def priority_bucket(w: models.DictionaryWord) -> int:
        if w.next_review_at is not None and w.next_review_at <= now:
            return 0
        if w.review_count == 0:
            return 1
        return 2

    all_words.sort(key=lambda w: (
        priority_bucket(w),
        w.review_count,
        w.last_reviewed_at or w.created_at,
    ))
    return all_words[:count]


# ─── Word browse (legacy / setup preview) ────────────────────────────────────

@router.get("/words")
def get_exercise_words(
    count: int = Query(default=5, ge=1, le=_MAX_ITEMS),
    difficulty: Optional[str] = Query(None),
    module_id: Optional[int] = Query(None),
    folder_id: Optional[int] = Query(None),
    source: str = Query(default="smart"),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    if source not in _VALID_SOURCES:
        raise HTTPException(
            status_code=400,
            detail=f"source must be one of: {', '.join(sorted(_VALID_SOURCES))}",
        )
    words = _select_words(db, current_user, count, source, module_id, folder_id, difficulty)
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
        for w in words
    ]


# ─── Session start (word selection + type assignment) ────────────────────────

class StartRequest(BaseModel):
    source: str = "smart"
    count: int = Field(default=5, ge=1, le=10)
    mode: str = "auto"
    folder_id: Optional[int] = None
    module_id: Optional[int] = None


def _serialize_item_for_client(plan_item: dict, word: models.DictionaryWord) -> dict:
    """Strip correct_answer; return only what the client needs to render the question."""
    out = {k: v for k, v in plan_item.items() if k != "correct_answer"}
    return out


@router.post("/start")
def start_exercise_session(
    request: StartRequest,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    if request.source not in _VALID_SOURCES:
        raise HTTPException(
            status_code=400,
            detail=f"source must be one of: {', '.join(sorted(_VALID_SOURCES))}",
        )
    if request.mode not in VALID_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown mode '{request.mode}'.",
        )

    words = _select_words(
        db, current_user,
        request.count, request.source,
        request.module_id, request.folder_id,
    )

    # Distractor pool: all non-deleted words for this user
    pool = db.query(models.DictionaryWord).filter(
        models.DictionaryWord.person_id == current_user.id,
        models.DictionaryWord.deleted == False,
    ).all()

    # Fetch top grammar weaknesses from recent attempts to target constrained exercises.
    recent_attempts = (
        db.query(models.ExerciseAttempt)
        .filter(
            models.ExerciseAttempt.person_id == current_user.id,
            models.ExerciseAttempt.grammar_errors.isnot(None),
        )
        .order_by(models.ExerciseAttempt.created_at.desc())
        .limit(30)
        .all()
    )
    error_counts: dict[str, int] = {}
    for attempt in recent_attempts:
        for err in (attempt.grammar_errors or []):
            error_counts[err] = error_counts.get(err, 0) + 1
    grammar_focus = sorted(error_counts, key=lambda k: -error_counts[k])[:3] or None

    items_plan: list[dict] = []
    for position, word in enumerate(words):
        exercise_type = pick_exercise_type(word, request.mode, position)
        question = build_question(exercise_type, word, pool, position, grammar_focus)
        items_plan.append(question)

    # Assign group_ids and enrich payloads for match/cloze_bank grouped types.
    assign_groups(items_plan)

    session = models.PracticeSession(
        person_id=current_user.id,
        mode="exercise",
        items_plan=items_plan,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    word_by_id = {w.id: w for w in words}
    client_items = [
        _serialize_item_for_client(plan, word_by_id[plan["word_id"]])
        for plan in items_plan
        if plan.get("word_id") in word_by_id
    ]

    return {
        "session_id": session.id,
        "started_at": session.started_at.isoformat(),
        "items": client_items,
    }


# ─── Grading ─────────────────────────────────────────────────────────────────

class GradeItem(BaseModel):
    word_id: int
    response: str = Field(..., min_length=1, max_length=400)


class GradeRequest(BaseModel):
    session_id: Optional[int] = None
    items: List[GradeItem]


_GRADER_SYSTEM = """You are an encouraging English teacher grading vocabulary exercises for ESL learners (B1–B2 level, mostly Uzbek speakers).

PRIMARY GOAL: Check whether the learner used the TARGET WORD correctly. Grammar quality is secondary.

You will receive items with: exercise_type, target word, definition, and the learner's response.

## Exercise types

- sentence: Learner wrote a sentence using the target word. Focus: word used with correct meaning in a sensible context.
- constrained_sentence: Same as sentence PLUS a structural constraint (e.g., "as a question", "using passive voice", "as a conditional", "using a relative clause"). Check BOTH word usage AND that the constraint is followed.
- paraphrase: Learner rewrote a sentence using the target word. Check: original meaning preserved AND word used correctly.
- prompt_response: Learner answered an open question using the target word. Check: response is on-topic AND word is used correctly.
- error_correction: A sentence with ONE deliberate grammar mistake was shown (source_sentence). The learner rewrote it correctly. The correct_version field shows the original correct sentence. is_correct=true if the grammar error was fixed AND the rewrite is grammatically sound (exact wording not required). grammar_errors should name the type of error that was in the original errored sentence.

## Scoring rubric (usage_score 0–100)

90–100  Perfect: word used correctly, constraint met (if any), natural grammar.
75–89   Good: word used correctly, minor grammar slips (articles, prepositions, tense), constraint met.
60–74   Partial: word appears with roughly correct meaning BUT one of: constraint not met, significant grammar error, word form wrong (e.g. "parent" instead of "parents"), or meaning slightly off.
40–59   Weak: word present but meaning is wrong or sentence is too broken to evaluate.
0–39    Wrong: word missing, completely wrong meaning, or response is not a sentence.

## is_correct rules

Set is_correct=true when ALL of:
1. Target word (or a natural inflection: plural, -ed, -ing, comparative) is present.
2. Word is used with the correct meaning from the definition.
3. The sentence is understandable (minor grammar errors are OK).
4. For constrained_sentence: the constraint is followed.
5. For paraphrase: the core meaning of the source sentence is preserved.
6. usage_score >= 65.

Set is_correct=false when:
- Word is missing or used with wrong meaning.
- Sentence is incomprehensible.
- For constrained_sentence: constraint is completely ignored.
- usage_score < 65.

## Feedback rules

- ONE sentence, max 20 words.
- ALWAYS start by naming what the learner did right, then what to fix.
- Focus on the single most important issue, not every grammar mistake.
- If is_correct=true: briefly confirm the good usage.
- If is_correct=false: name the specific problem and how to fix it.
- Never be discouraging. Assume the learner tried their best.

## suggested_revision

- Provide a natural, corrected version of the learner's own sentence (preserve their idea).
- null only if usage_score >= 90.

Return ONLY valid JSON — no markdown, no prose:
{
  "items": [
    {
      "word_id": <int>,
      "is_correct": <bool>,
      "usage_score": <0..100 int>,
      "feedback": "<one sentence>",
      "suggested_revision": "<corrected version of their sentence, or null>",
      "grammar_errors": ["<error_type>", ...]
    }
  ]
}

grammar_errors must be an array (can be empty []) containing only values from this list:
articles, plural_singular, verb_tense, subject_verb_agreement, prepositions, word_form, word_order, spelling, pronoun, constraint_not_met, passive_voice, relative_clause, conditional, cohesive_device, reported_speech

Rules for grammar_errors:
- Include grammar errors actually present in the learner's response — even if is_correct=false because the target word is missing.
- "constraint_not_met" only for constrained_sentence where the constraint was ignored.
- Empty array [] if grammar is fine.
- Max 3 errors per item — list only the most impactful ones.
- IMPORTANT: Never return null for grammar_errors — always return an array (empty if no errors)."""


def _grader_user_prompt(items: list[dict]) -> str:
    lines = ["Grade the following:\n"]
    for it in items:
        lines.append(f"- word_id: {it['word_id']}")
        lines.append(f"  exercise_type: {it['exercise_type']}")
        lines.append(f"  word: {it['word']}")
        if it.get("part_of_speech"):
            lines.append(f"  part_of_speech: {it['part_of_speech']}")
        lines.append(f"  definition: {it['definition']}")
        if it.get("constraint"):
            lines.append(f"  constraint: {it['constraint']}")
        if it.get("source_sentence"):
            lines.append(f"  source_sentence: {it['source_sentence']}")
        if it.get("correct_version"):
            lines.append(f"  correct_version: {it['correct_version']}")
        lines.append(f"  response: {it['response']}")
        lines.append("")
    return "\n".join(lines)


def _coerce_grade(raw: dict, fallback_id: int) -> dict:
    _VALID_GRAMMAR_ERRORS = frozenset(GRAMMAR_ERROR_LABELS.keys())

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
    raw_errors = raw.get("grammar_errors")
    if isinstance(raw_errors, list):
        grammar_errors = [e for e in raw_errors if isinstance(e, str) and e in _VALID_GRAMMAR_ERRORS] or None
    else:
        grammar_errors = None
    return {
        "word_id": word_id,
        "is_correct": is_correct,
        "usage_score": score_int,
        "feedback": feedback,
        "suggested_revision": revision,
        "grammar_errors": grammar_errors,
    }


async def _grade_via_openai(grader_items: list[dict]) -> list[dict]:
    from openai import (
        AsyncOpenAI,
        APIConnectionError,
        APIError,
        AuthenticationError,
        RateLimitError,
    )
    import httpx

    http_client = None
    if settings.OPENAI_PROXY_URL:
        http_client = httpx.AsyncClient(proxy=settings.OPENAI_PROXY_URL)

    client = AsyncOpenAI(
        api_key=settings.OPENAI_API_KEY,
        base_url=settings.OPENAI_BASE_URL or None,
        http_client=http_client,
    )
    max_tokens = max(900, 250 + 250 * len(grader_items))
    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": _GRADER_SYSTEM},
                {"role": "user", "content": _grader_user_prompt(grader_items)},
            ],
            max_tokens=max_tokens,
            temperature=0.2,
            response_format={"type": "json_object"},
        )
    except AuthenticationError as exc:
        logger.error("OpenAI auth failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Grader auth failed: {exc}",
        ) from exc
    except RateLimitError as exc:
        logger.error("OpenAI rate-limited: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Grader rate-limited: {exc}",
        ) from exc
    except APIConnectionError as exc:
        logger.error("OpenAI unreachable: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"Grader unreachable: {exc}",
        ) from exc
    except APIError as exc:
        logger.error("OpenAI API error: %s", exc)
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
            detail=f"Grader returned empty content (finish_reason={finish}).",
        )
    raw = raw.strip()
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        finish = getattr(choice, "finish_reason", "unknown")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Grader returned invalid JSON (finish_reason={finish}): {raw[:200]}",
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
    if not request.items:
        raise HTTPException(status_code=400, detail="No responses submitted.")
    if len(request.items) > _MAX_ITEMS:
        raise HTTPException(
            status_code=400,
            detail=f"Too many items. Maximum {_MAX_ITEMS} per grading request.",
        )

    # ── Session ownership + idempotency (before any expensive work) ──────────
    session: Optional[models.PracticeSession] = None
    plan_by_word: dict[int, dict] = {}
    if request.session_id is not None:
        session = db.query(models.PracticeSession).filter(
            models.PracticeSession.id == request.session_id,
            models.PracticeSession.person_id == current_user.id,
            models.PracticeSession.mode == "exercise",
        ).first()
        if session is None:
            raise HTTPException(
                status_code=404,
                detail="Exercise session not found or does not belong to you.",
            )
        if session.completed_at is not None:
            raise HTTPException(
                status_code=409,
                detail="This session has already been graded.",
            )
        if session.items_plan:
            for plan in session.items_plan:
                wid = plan.get("word_id")
                if wid is not None:
                    plan_by_word[wid] = plan

        # Validate all submitted word_ids are in the plan
        if plan_by_word:
            invalid = [it.word_id for it in request.items if it.word_id not in plan_by_word]
            if invalid:
                raise HTTPException(
                    status_code=400,
                    detail=f"Word IDs not in this session's plan: {invalid}",
                )

    # ── Word ownership check ─────────────────────────────────────────────────
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
            detail=f"Words not found or do not belong to you: {missing}",
        )

    # ── Separate deterministic vs production items ───────────────────────────
    deterministic_items: list[GradeItem] = []
    production_items: list[GradeItem] = []

    for it in request.items:
        plan = plan_by_word.get(it.word_id, {})
        etype = plan.get("exercise_type", "sentence")
        if etype in DETERMINISTIC_TYPES:
            deterministic_items.append(it)
        else:
            production_items.append(it)

    # ── Grade deterministic items ────────────────────────────────────────────
    det_grades: dict[int, dict] = {}
    for it in deterministic_items:
        plan = plan_by_word.get(it.word_id, {})
        etype = plan.get("exercise_type", "spelling")
        result = grade_deterministic(etype, word_by_id[it.word_id], it.response.strip(), plan)
        det_grades[it.word_id] = {**result, "word_id": it.word_id}

    # ── Grade production items via Groq ──────────────────────────────────────
    prod_grades: dict[int, dict] = {}
    if production_items:
        if not settings.OPENAI_API_KEY:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Grader not configured. Set OPENAI_API_KEY.",
            )
        grader_items = []
        for it in production_items:
            w = word_by_id[it.word_id]
            plan = plan_by_word.get(it.word_id, {})
            grader_items.append({
                "word_id": it.word_id,
                "exercise_type": plan.get("exercise_type", "sentence"),
                "word": w.word,
                "definition": w.definition,
                "part_of_speech": w.part_of_speech,
                "constraint": plan.get("constraint"),
                "source_sentence": plan.get("source_sentence"),
                "correct_version": plan.get("correct_answer") if plan.get("exercise_type") == "error_correction" else None,
                "response": it.response.strip(),
            })
        groq_results = await _grade_via_openai(grader_items)
        for g in groq_results:
            wid = g["word_id"]
            plan = plan_by_word.get(wid, {})
            # For error_correction, surface the original correct sentence as correct_answer.
            ec_answer = plan.get("correct_answer") if plan.get("exercise_type") == "error_correction" else None
            prod_grades[wid] = {
                **g,
                "correct_answer": ec_answer,
                "srs_grade": 2 if g.get("is_correct") else 0,
            }

    # ── Single atomic transaction: SRS + attempts + close session ────────────
    now = datetime.utcnow()
    results: list[dict] = []
    correct_count = 0

    try:
        for it in request.items:
            word = word_by_id[it.word_id]
            plan = plan_by_word.get(it.word_id, {})
            etype = plan.get("exercise_type", "sentence")

            if it.word_id in det_grades:
                grade = det_grades[it.word_id]
            else:
                grade = prod_grades[it.word_id]

            was_correct = bool(grade.get("is_correct"))
            srs_grade = grade.get("srs_grade", 2 if was_correct else 0)
            if was_correct:
                correct_count += 1

            attempt = models.ExerciseAttempt(
                person_id=current_user.id,
                session_id=session.id if session else None,
                word_id=word.id,
                sentence=None,
                exercise_type=etype,
                response=it.response.strip(),
                question_payload=plan if plan else None,
                grammar_errors=grade.get("grammar_errors"),
                is_correct=was_correct,
                usage_score=grade.get("usage_score"),
                feedback=grade.get("feedback"),
                suggested_revision=grade.get("suggested_revision"),
                created_at=now,
            )
            db.add(attempt)
            srs.apply_result(word, grade=srs_grade, now=now)

            results.append({
                "word_id": word.id,
                "word": word.word,
                "exercise_type": etype,
                "response": it.response.strip(),
                "is_correct": was_correct,
                "usage_score": grade.get("usage_score"),
                "feedback": grade.get("feedback"),
                "suggested_revision": grade.get("suggested_revision"),
                "correct_answer": grade.get("correct_answer"),
                "grammar_errors": grade.get("grammar_errors"),
                "next_review_at": word.next_review_at.isoformat() if word.next_review_at else None,
            })

        if session is not None:
            session.total_questions = len(request.items)
            session.correct_answers = correct_count
            session.completed_at = now

        db.commit()
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        logger.exception("grade_exercises DB error: %s", exc)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save grading results: {exc}",
        )

    return {
        "session_id": session.id if session else None,
        "total": len(request.items),
        "correct": correct_count,
        "accuracy": round(correct_count / len(request.items) * 100) if request.items else 0,
        "results": results,
    }


# ─── History ─────────────────────────────────────────────────────────────────

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
            "exercise_type": a.exercise_type,
            "response": a.response or a.sentence,
            "is_correct": a.is_correct,
            "usage_score": a.usage_score,
            "feedback": a.feedback,
            "suggested_revision": a.suggested_revision,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in attempts
    ]


# ─── Stats ────────────────────────────────────────────────────────────────────

@router.get("/stats")
def get_exercise_stats(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
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


# ─── Analytics ────────────────────────────────────────────────────────────────

@router.get("/analytics")
def get_exercise_analytics(
    days: int = Query(default=30, ge=7, le=90),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    from collections import defaultdict

    since = datetime.utcnow() - timedelta(days=days)
    attempts = (
        db.query(models.ExerciseAttempt)
        .filter(
            models.ExerciseAttempt.person_id == current_user.id,
            models.ExerciseAttempt.created_at >= since,
        )
        .order_by(models.ExerciseAttempt.created_at)
        .all()
    )

    total = len(attempts)
    correct = sum(1 for a in attempts if a.is_correct)
    scored = [a.usage_score for a in attempts if a.usage_score is not None]
    avg_score = round(sum(scored) / len(scored)) if scored else None

    # Daily accuracy trend
    daily: dict[str, dict] = defaultdict(lambda: {"attempts": 0, "correct": 0})
    for a in attempts:
        if a.created_at:
            day = a.created_at.date().isoformat()
            daily[day]["attempts"] += 1
            if a.is_correct:
                daily[day]["correct"] += 1
    accuracy_trend = sorted(
        [
            {
                "date": d,
                "attempts": v["attempts"],
                "correct": v["correct"],
                "accuracy": round(v["correct"] / v["attempts"] * 100) if v["attempts"] else 0,
            }
            for d, v in daily.items()
        ],
        key=lambda x: x["date"],
    )

    # Grammar weak areas
    error_counts: dict[str, int] = defaultdict(int)
    for a in attempts:
        for err in (a.grammar_errors or []):
            error_counts[err] += 1
    grammar_weak_areas = sorted(
        [
            {"type": k, "label": GRAMMAR_ERROR_LABELS.get(k, k), "count": v}
            for k, v in error_counts.items()
        ],
        key=lambda x: -x["count"],
    )[:5]

    # Exercise type breakdown
    type_stats: dict[str, dict] = defaultdict(lambda: {"attempts": 0, "correct": 0})
    for a in attempts:
        t = a.exercise_type or "sentence"
        type_stats[t]["attempts"] += 1
        if a.is_correct:
            type_stats[t]["correct"] += 1
    exercise_type_stats = [
        {
            "type": t,
            "attempts": v["attempts"],
            "correct": v["correct"],
            "accuracy": round(v["correct"] / v["attempts"] * 100) if v["attempts"] else 0,
        }
        for t, v in type_stats.items()
    ]

    return {
        "period_days": days,
        "total_attempts": total,
        "total_correct": correct,
        "overall_accuracy": round(correct / total * 100) if total else 0,
        "avg_usage_score": avg_score,
        "accuracy_trend": accuracy_trend,
        "grammar_weak_areas": grammar_weak_areas,
        "exercise_type_stats": exercise_type_stats,
    }
