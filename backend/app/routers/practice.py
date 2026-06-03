from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session
from typing import Any, List, Optional
from datetime import datetime, timedelta
import json
import random

from app import models
from app.database import get_db
from app.dependencies import get_current_user
from app.services import srs

router = APIRouter(prefix="/practice", tags=["practice"])


def _serialize_practice_word(word: models.DictionaryWord, all_words: list) -> dict:
    distractors = [w for w in all_words if w.id != word.id]
    distractor_sample = random.sample(distractors, min(3, len(distractors)))
    options = [word.word] + [d.word for d in distractor_sample]
    random.shuffle(options)
    return {
        "id": word.id,
        "word": word.word,
        "definition": word.definition,
        "translation": word.translation,
        "phonetic": word.phonetic,
        "examples": json.loads(word.examples) if word.examples else [],
        "difficulty": word.difficulty,
        "options": options,
        # Cloze mode prefers the original sentence over an AI-generated
        # example — strongest possible recall cue.
        "source_sentence": word.source_sentence,
        "source_book_id": word.source_book_id,
        "source_page": word.source_page,
    }


# ─── Word selection ──────────────────────────────────────────────────────────

@router.get("/words")
def get_practice_words(
    count: int = Query(default=10, ge=1, le=1000),
    difficulty: Optional[str] = Query(None),
    module_id: Optional[int] = Query(None),
    folder_id: Optional[int] = Query(None),
    due_only: bool = Query(default=False),
    weak_only: bool = Query(default=False),
    ids: Optional[str] = Query(
        default=None,
        description=(
            "Comma-separated word IDs. When set, returns exactly those "
            "words (still scoped to the current user, still skipping "
            "soft-deleted rows) in the same order they were passed. "
            "Used by Resume to rehydrate a paused drill without "
            "re-selecting from the SRS pool."
        ),
    ),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    if ids:
        # Resume path. Skip all the priority sorting and the >=2 sanity
        # check — the caller already knows which words it wants and we
        # do not want to silently drop a drill mid-flight just because
        # other rows were edited.
        try:
            id_list = [int(x) for x in ids.split(",") if x.strip()]
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid ids list")
        if not id_list:
            return []
        rows = db.query(models.DictionaryWord).filter(
            models.DictionaryWord.id.in_(id_list),
            models.DictionaryWord.person_id == current_user.id,
            models.DictionaryWord.deleted == False,
        ).all()
        by_id = {w.id: w for w in rows}
        ordered = [by_id[i] for i in id_list if i in by_id]
        # Distractors come from this set plus a small refresh pool so a
        # short ids= list still gets sensible multiple-choice options.
        pool = list(ordered)
        if len(pool) < 4:
            extra = db.query(models.DictionaryWord).filter(
                models.DictionaryWord.person_id == current_user.id,
                models.DictionaryWord.deleted == False,
                models.DictionaryWord.id.notin_([w.id for w in pool]),
            ).limit(20).all()
            pool += extra
        return [_serialize_practice_word(w, pool) for w in ordered]

    Word = models.DictionaryWord
    now = datetime.utcnow()

    q = db.query(Word).filter(
        Word.person_id == current_user.id,
        Word.deleted == False,
    )
    if module_id is not None:
        q = q.filter(Word.module_id == module_id)
    if folder_id is not None:
        q = q.join(
            models.DictionaryModule, Word.module_id == models.DictionaryModule.id
        ).filter(models.DictionaryModule.folder_id == folder_id)
    if difficulty:
        q = q.filter(Word.difficulty == difficulty)
    if due_only:
        q = q.filter(or_(
            Word.next_review_at.is_(None),
            Word.next_review_at <= now,
        ))
    if weak_only:
        # Fragile-current-retention, not low lifetime accuracy.
        q = q.filter(srs.weak_condition(Word))

    if due_only or weak_only:
        # Narrowed pool: hardest first (low ease, short interval, oldest).
        # Since weak_only now excludes never-reviewed (review_count >= 2),
        # the prior "never-reviewed first" tiebreak no longer applies.
        ordered = (
            q.order_by(
                Word.ease_factor.asc(),
                Word.interval_days.asc(),
                Word.created_at.asc(),
            )
            .all()
        )
        if len(ordered) < 2:
            raise HTTPException(
                status_code=400,
                detail="Not enough words available for practice (need at least 2).",
            )
        selected = ordered[:count]
        # Wider distractor pool so options aren't too repetitive.
        pool = list({w.id: w for w in ordered}.values())
        if len(pool) < 4:
            extra = db.query(Word).filter(
                Word.person_id == current_user.id,
                Word.deleted == False,
                Word.id.notin_([w.id for w in pool]),
            ).limit(20).all()
            pool += extra
        return [_serialize_practice_word(w, pool) for w in selected]

    # Default "all words" walk: coverage-aware priority sorted DB-side.
    #
    #   1. Words due now (next_review_at <= now or NULL) — includes
    #      just-missed because apply_result stamps next_review_at = now
    #      on a lapse.
    #   2. Never-reviewed words, oldest first by created_at.
    #   3. Everything else hardest-first (low ease, short interval).
    all_words = q.order_by(*srs.pool_priority_order(Word, now)).all()
    if len(all_words) < 2:
        raise HTTPException(
            status_code=400,
            detail="Not enough words available for practice (need at least 2).",
        )
    selected = all_words[:count]
    return [_serialize_practice_word(w, all_words) for w in selected]


# ─── Result submission with SM-2 scheduling ──────────────────────────────────

@router.post("/result")
def submit_result(
    word_id: int,
    was_correct: bool,
    grade: Optional[int] = Query(
        default=None,
        ge=0,
        le=2,
        description=(
            "3-level grade: 0 = wrong/forgot, 1 = hard (close), "
            "2 = good (exact/correct). When provided, supersedes "
            "was_correct. Typed-answer modes (spelling, listening, "
            "cloze) send this so 'close' answers get a smaller "
            "interval bump + ease penalty instead of being marked "
            "wholly correct. Flashcard swipe + quiz MCQ stay binary "
            "via was_correct."
        ),
    ),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    word = db.query(models.DictionaryWord).filter(
        models.DictionaryWord.id == word_id,
        models.DictionaryWord.person_id == current_user.id,
    ).first()
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")

    sched = srs.apply_result(word, grade=grade, was_correct=was_correct)
    db.commit()
    return {
        "ok": True,
        "interval_days": word.interval_days,
        "next_review_at": word.next_review_at.isoformat(),
        "ease_factor": word.ease_factor,
        "reps": word.reps,
        "lapses": word.lapses,
        "is_leech": sched["is_leech"],
    }


# ─── Due-counts helper for UI badges ─────────────────────────────────────────

@router.get("/due-counts")
def get_due_counts(
    folder_id: Optional[int] = Query(None),
    module_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    q = db.query(models.DictionaryWord).filter(
        models.DictionaryWord.person_id == current_user.id,
        models.DictionaryWord.deleted == False,
    )
    if module_id is not None:
        q = q.filter(models.DictionaryWord.module_id == module_id)
    elif folder_id is not None:
        q = q.join(
            models.DictionaryModule, models.DictionaryWord.module_id == models.DictionaryModule.id
        ).filter(models.DictionaryModule.folder_id == folder_id)

    due = q.filter(or_(
        models.DictionaryWord.next_review_at.is_(None),
        models.DictionaryWord.next_review_at <= datetime.utcnow(),
    )).count()

    return {"due": due}


# ─── Session bookkeeping (unchanged) ─────────────────────────────────────────

@router.post("/session")
def create_session(
    mode: str,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    session = models.PracticeSession(
        person_id=current_user.id,
        mode=mode,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return {
        "id": session.id,
        "mode": session.mode,
        "total_questions": session.total_questions,
        "correct_answers": session.correct_answers,
        "started_at": session.started_at,
        "completed_at": session.completed_at,
    }


@router.put("/session/{session_id}/complete")
def complete_session(
    session_id: int,
    total_questions: int,
    correct_answers: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    session = db.query(models.PracticeSession).filter(
        models.PracticeSession.id == session_id,
        models.PracticeSession.person_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.total_questions = total_questions
    session.correct_answers = correct_answers
    session.completed_at = datetime.utcnow()
    # A completed session can't be resumed — drop the snapshot so the
    # "active session" lookup never picks it back up if the client
    # racing the complete request also fired a progress update.
    session.progress = None
    db.commit()
    return {
        "id": session.id,
        "mode": session.mode,
        "total_questions": session.total_questions,
        "correct_answers": session.correct_answers,
        "started_at": session.started_at,
        "completed_at": session.completed_at,
    }


# ─── Resume support ──────────────────────────────────────────────────────────

class ProgressUpdate(BaseModel):
    progress: Any  # Opaque snapshot — frontend owns the shape.


@router.get("/session/active")
def get_active_session(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Return the most recent uncompleted session that has a progress
    snapshot, or None. A session with no snapshot yet (just created,
    no chunk finished) is intentionally NOT returned — we have nothing
    useful to resume from."""
    session = (
        db.query(models.PracticeSession)
        .filter(
            models.PracticeSession.person_id == current_user.id,
            models.PracticeSession.completed_at.is_(None),
            models.PracticeSession.progress.isnot(None),
        )
        .order_by(models.PracticeSession.started_at.desc())
        .first()
    )
    if not session:
        return None
    return {
        "id": session.id,
        "mode": session.mode,
        "started_at": session.started_at,
        "progress": session.progress,
    }


@router.put("/session/{session_id}/progress")
def update_session_progress(
    session_id: int,
    payload: ProgressUpdate,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    session = db.query(models.PracticeSession).filter(
        models.PracticeSession.id == session_id,
        models.PracticeSession.person_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.completed_at is not None:
        # Stale progress write racing the complete request. Drop it
        # silently — a completed session can't be resumed and we don't
        # want to bring it back to life by re-populating the snapshot.
        return {"ok": True, "ignored": True}
    session.progress = payload.progress
    db.commit()
    return {"ok": True}


@router.delete("/session/{session_id}", status_code=204)
def discard_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Discard an uncompleted session — used by the Resume card's
    "start over" button. We refuse to delete completed sessions so
    history stays append-only."""
    session = db.query(models.PracticeSession).filter(
        models.PracticeSession.id == session_id,
        models.PracticeSession.person_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.completed_at is not None:
        raise HTTPException(status_code=400, detail="Cannot discard a completed session")
    db.delete(session)
    db.commit()


@router.get("/history")
def get_history(
    limit: int = Query(default=10),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    sessions = db.query(models.PracticeSession).filter(
        models.PracticeSession.person_id == current_user.id,
        models.PracticeSession.completed_at.isnot(None),
    ).order_by(models.PracticeSession.started_at.desc()).limit(limit).all()

    return [
        {
            "id": s.id,
            "mode": s.mode,
            "total_questions": s.total_questions,
            "correct_answers": s.correct_answers,
            "started_at": s.started_at,
            "completed_at": s.completed_at,
        }
        for s in sessions
    ]


# ─── AI judge for typed answers ──────────────────────────────────────────────


class JudgeAnswerRequest(BaseModel):
    user_input: str
    target: str
    definition: Optional[str] = None


@router.post("/judge-answer")
def judge_typed_answer(
    body: JudgeAnswerRequest,
    current_user: models.Person = Depends(get_current_user),
):
    """
    Last-resort AI judge for typed spelling answers when the local matcher
    rejects them. Designed for cases like target="it is argued that" /
    typed="it is argued" — same meaning, missing a function word.

    Returns {"ok": bool, "verdict": "yes"|"close"|"no", "reason": str}.
    Falls back to {"ok": false, "verdict": "no", "reason": "..."} when no AI
    provider is configured or the call fails — caller keeps the local
    rejection in that case.
    """
    user_input = (body.user_input or "").strip()
    target = (body.target or "").strip()
    if not user_input or not target:
        raise HTTPException(status_code=400, detail="user_input and target are required")

    # Hard length caps — defensive against prompt-injection ballooning. The
    # judge is for short answers, never paragraphs.
    if len(user_input) > 200 or len(target) > 200:
        raise HTTPException(status_code=400, detail="inputs too long")

    from app.config import settings
    from app.tasks import _generate_text

    if not (settings.GEMINI_API_KEY or settings.OPENAI_API_KEY or settings.GROQ_API_KEY):
        return {"ok": False, "verdict": "no", "reason": "AI not configured"}

    definition = (body.definition or "").strip()[:400]
    prompt = (
        "You judge English vocabulary answers. The student was asked to "
        "produce a target word or phrase. Decide whether their typed answer "
        "is essentially the same as the target — accept valid synonyms, "
        "one-letter typos on long words, and missing function words "
        "(articles, prepositions, conjunctions) at the start or end of "
        "multi-word phrases. Reject answers that change the meaning, "
        "misspell a short word, or pick a different content word.\n\n"
        f"Target: {target}\n"
        f"Definition / hint: {definition or '(none)'}\n"
        f"Student typed: {user_input}\n\n"
        "Reply with exactly ONE word, uppercase: YES (essentially correct), "
        "CLOSE (right idea but partial credit only), or NO."
    )

    try:
        raw = _generate_text(prompt, max_tokens=4, temperature=0.0)
    except Exception as e:
        return {"ok": False, "verdict": "no", "reason": f"ai_error: {type(e).__name__}"}

    token = (raw or "").strip().upper().split()[:1]
    verdict = token[0] if token else "NO"
    if verdict not in ("YES", "CLOSE", "NO"):
        verdict = "NO"
    return {
        "ok": verdict in ("YES", "CLOSE"),
        "verdict": verdict.lower(),
        "reason": raw[:200] if raw else "",
    }
