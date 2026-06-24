"""IELTS gap-fill drill router.

Generates a word-form and/or preposition gap-fill exercise from the user's
dictionary words, then grades and records the attempt.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models
from app.database import get_db
from app.dependencies import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/essays/gap-fill", tags=["gap-fill"])


# ─── Pydantic schemas ──────────────────────────────────────────────────────────

class NextExerciseOut(BaseModel):
    word_id: int
    word: str
    gap_type: str
    sentence: str
    word_form_answer: Optional[str]
    word_form_distractor: Optional[str]
    preposition_answer: Optional[str]
    explanation: Optional[str]
    definition: str


class GradeIn(BaseModel):
    word_id: int
    gap_type: str
    sentence: str
    word_form_answer: Optional[str] = None
    word_form_distractor: Optional[str] = None
    preposition_answer: Optional[str] = None
    explanation: Optional[str] = None
    word_form_response: Optional[str] = None
    preposition_response: Optional[str] = None


class GradeOut(BaseModel):
    id: int
    word_form_correct: Optional[bool]
    preposition_correct: Optional[bool]
    word_form_answer: Optional[str]
    preposition_answer: Optional[str]
    explanation: Optional[str]


class HistoryItem(BaseModel):
    id: int
    word: str
    gap_type: str
    word_form_correct: Optional[bool]
    preposition_correct: Optional[bool]
    created_at: str

    class Config:
        from_attributes = True


class StatsOut(BaseModel):
    total: int
    word_form_correct: int
    preposition_correct: int
    both_correct: int
    word_form_accuracy: float
    preposition_accuracy: float


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _pick_word(db: Session, person_id: int) -> Optional[models.DictionaryWord]:
    """Pick the next word for gap-fill, avoiding the last 5 used."""
    now = datetime.now(timezone.utc)

    recent_word_ids = [
        r[0]
        for r in db.query(models.GapFillAttempt.word_id)
        .filter(
            models.GapFillAttempt.person_id == person_id,
            models.GapFillAttempt.word_id.isnot(None),
        )
        .order_by(models.GapFillAttempt.created_at.desc())
        .limit(5)
        .all()
    ]

    # Prefer SRS-due words
    query = db.query(models.DictionaryWord).filter(
        models.DictionaryWord.person_id == person_id,
        models.DictionaryWord.deleted == False,
        models.DictionaryWord.lexical_type == "word",
    )
    if recent_word_ids:
        query = query.filter(models.DictionaryWord.id.notin_(recent_word_ids))

    due = query.filter(models.DictionaryWord.next_review_at <= now).first()
    if due:
        return due

    # Fall back to oldest last_reviewed_at
    return query.order_by(
        models.DictionaryWord.last_reviewed_at.asc().nullsfirst()
    ).first()


def _parse_json(raw: str) -> Optional[dict]:
    """Strip code fences and parse JSON. Returns None on failure."""
    cleaned = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
    try:
        return json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        logger.warning("gap_fill: failed to parse AI JSON — raw=%r", raw[:300])
        return None


def _build_prompt(word: models.DictionaryWord) -> str:
    try:
        raw_meta = getattr(word, "word_meta", None)
        if isinstance(raw_meta, str):
            meta = json.loads(raw_meta)
        elif isinstance(raw_meta, dict):
            meta = raw_meta
        else:
            meta = {}
    except Exception:
        meta = {}

    forms = meta.get("forms", {})

    return (
        f'You are an IELTS academic writing exercise generator.\n\n'
        f'Word: "{word.word}"\n'
        f'Definition: {word.definition}\n'
        f'Part of speech: {word.part_of_speech or "unknown"}\n'
        f'Word forms available: {json.dumps(forms)}\n\n'
        f'Generate ONE IELTS-style academic sentence (20-30 words) that:\n'
        f'1. Uses one form of this word (noun, verb, adjective, or adverb)\n'
        f'2. If natural, follows the word with a preposition (e.g. "depend on", "impact on", "allocate to")\n'
        f'3. Sounds like a typical Task 2 essay sentence\n\n'
        f'Then create a gap-fill exercise:\n'
        f'- Replace the word form used with a blank showing TWO options in parentheses: (correct_form / wrong_form)\n'
        f'  - The wrong_form must be a DIFFERENT grammatical form of the same word (e.g. if correct is noun, wrong is adjective)\n'
        f'  - If no other forms exist, use a common wrong spelling or an unrelated similar word\n'
        f'- If a preposition follows the word in the sentence, replace ONLY that preposition with ___\n\n'
        f'Return ONLY valid JSON:\n'
        f'{{\n'
        f'  "sentence": "Her ___ (persistence / persistent) in learning new skills made her stand out.",\n'
        f'  "gap_type": "word_form_only",\n'
        f'  "word_form_answer": "persistence",\n'
        f'  "word_form_distractor": "persistent",\n'
        f'  "preposition_answer": null,\n'
        f'  "explanation": "We need a noun here as it acts as the subject. \'Persistence\' is the noun form; \'persistent\' is the adjective."\n'
        f'}}\n\n'
        f'gap_type must be one of: "word_form_only", "preposition_only", "both"\n'
        f'If there is no preposition gap: set preposition_answer to null.\n'
        f'If there is no word form gap: set word_form_answer and word_form_distractor to null.'
    )


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/next", response_model=NextExerciseOut)
def get_next_exercise(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
) -> NextExerciseOut:
    """Return the next gap-fill exercise for this user."""
    word = _pick_word(db, current_user.id)
    if word is None:
        raise HTTPException(status_code=404, detail="No eligible words found. Add words to your dictionary first.")

    prompt = _build_prompt(word)

    from app.tasks import _generate_text  # lazy import — avoids circular dependency
    raw = _generate_text(prompt, max_tokens=400, temperature=0.3)

    if not raw:
        raise HTTPException(status_code=503, detail="AI service unavailable. Try again later.")

    parsed = _parse_json(raw)
    if parsed is None:
        raise HTTPException(status_code=503, detail="AI returned invalid response. Try again.")

    return NextExerciseOut(
        word_id=word.id,
        word=word.word,
        gap_type=parsed.get("gap_type", "word_form_only"),
        sentence=parsed.get("sentence", ""),
        word_form_answer=parsed.get("word_form_answer"),
        word_form_distractor=parsed.get("word_form_distractor"),
        preposition_answer=parsed.get("preposition_answer"),
        explanation=parsed.get("explanation"),
        definition=word.definition,
    )


@router.post("/grade", response_model=GradeOut)
def grade_attempt(
    payload: GradeIn,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
) -> GradeOut:
    """Grade a gap-fill attempt and save the result."""
    word = db.query(models.DictionaryWord).filter(
        models.DictionaryWord.id == payload.word_id,
        models.DictionaryWord.person_id == current_user.id,
    ).first()
    if word is None:
        raise HTTPException(status_code=404, detail="Word not found.")

    word_form_correct: Optional[bool] = None
    preposition_correct: Optional[bool] = None

    if payload.gap_type in ("word_form_only", "both"):
        word_form_correct = (
            (payload.word_form_response or "").strip().lower()
            == (payload.word_form_answer or "").lower()
        )

    if payload.gap_type in ("preposition_only", "both"):
        preposition_correct = (
            (payload.preposition_response or "").strip().lower()
            == (payload.preposition_answer or "").lower()
        )

    attempt = models.GapFillAttempt(
        person_id=current_user.id,
        word_id=payload.word_id,
        word=word.word,
        gap_type=payload.gap_type,
        sentence=payload.sentence,
        word_form_answer=payload.word_form_answer,
        word_form_distractor=payload.word_form_distractor,
        word_form_response=payload.word_form_response,
        word_form_correct=word_form_correct,
        preposition_answer=payload.preposition_answer,
        preposition_response=payload.preposition_response,
        preposition_correct=preposition_correct,
        explanation=payload.explanation,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    return GradeOut(
        id=attempt.id,
        word_form_correct=word_form_correct,
        preposition_correct=preposition_correct,
        word_form_answer=payload.word_form_answer,
        preposition_answer=payload.preposition_answer,
        explanation=payload.explanation,
    )


@router.get("/history", response_model=List[HistoryItem])
def get_history(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
) -> List[HistoryItem]:
    """Return the last N gap-fill attempts for this user, newest first."""
    attempts = (
        db.query(models.GapFillAttempt)
        .filter(models.GapFillAttempt.person_id == current_user.id)
        .order_by(models.GapFillAttempt.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        HistoryItem(
            id=a.id,
            word=a.word,
            gap_type=a.gap_type,
            word_form_correct=a.word_form_correct,
            preposition_correct=a.preposition_correct,
            created_at=str(a.created_at),
        )
        for a in attempts
    ]


@router.get("/stats", response_model=StatsOut)
def get_stats(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
) -> StatsOut:
    """Return gap-fill accuracy stats for this user."""
    attempts = (
        db.query(models.GapFillAttempt)
        .filter(models.GapFillAttempt.person_id == current_user.id)
        .all()
    )

    total = len(attempts)
    wf_total = sum(1 for a in attempts if a.word_form_correct is not None)
    wf_correct = sum(1 for a in attempts if a.word_form_correct is True)
    prep_total = sum(1 for a in attempts if a.preposition_correct is not None)
    prep_correct = sum(1 for a in attempts if a.preposition_correct is True)
    both_correct = sum(
        1 for a in attempts
        if a.word_form_correct is True and a.preposition_correct is True
    )

    return StatsOut(
        total=total,
        word_form_correct=wf_correct,
        preposition_correct=prep_correct,
        both_correct=both_correct,
        word_form_accuracy=round(wf_correct / wf_total, 4) if wf_total > 0 else 0.0,
        preposition_accuracy=round(prep_correct / prep_total, 4) if prep_total > 0 else 0.0,
    )
