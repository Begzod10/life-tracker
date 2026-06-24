"""IELTS mini intro build drill router.

Presents an IELTS Task 2 question + 2 required vocabulary words,
then grades the student's two-sentence introduction for paraphrase quality,
vocabulary usage, and position clarity.
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
from app.services.essay_service import pick_question

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/essays/mini-build", tags=["mini-build"])


# ─── Pydantic schemas ──────────────────────────────────────────────────────────

class StartOut(BaseModel):
    question: str
    question_type: str
    required_words: List[dict]


class GradeIn(BaseModel):
    question: str
    question_type: str
    required_words: List[dict]
    response: str


class GradeOut(BaseModel):
    id: int
    paraphrase_score: Optional[int]
    vocab_score: Optional[int]
    position_score: Optional[int]
    total_score: Optional[int]
    feedback: Optional[str]
    model_answer: Optional[str]


class HistoryItem(BaseModel):
    id: int
    question: str
    required_words: Optional[List[dict]]
    total_score: Optional[int]
    paraphrase_score: Optional[int]
    vocab_score: Optional[int]
    position_score: Optional[int]
    feedback: Optional[str]
    created_at: str


class StatsOut(BaseModel):
    total: int
    avg_total: Optional[float]
    avg_paraphrase: Optional[float]
    avg_vocab: Optional[float]
    avg_position: Optional[float]
    score_distribution: dict


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _pick_vocab_words(db: Session, person_id: int) -> list[models.DictionaryWord]:
    """Pick 2 vocabulary words for the mini-build drill."""
    candidates = (
        db.query(models.DictionaryWord)
        .filter(
            models.DictionaryWord.person_id == person_id,
            models.DictionaryWord.deleted == False,
            models.DictionaryWord.lexical_type == "word",
        )
        .order_by(models.DictionaryWord.next_review_at.asc().nullsfirst())
        .limit(20)
        .all()
    )

    if not candidates:
        return []

    import random
    picked: list[models.DictionaryWord] = []
    seen_ids: set[int] = set()
    pool = list(candidates)
    random.shuffle(pool)

    for w in pool:
        if w.id not in seen_ids:
            picked.append(w)
            seen_ids.add(w.id)
        if len(picked) >= 2:
            break

    return picked


def _build_grade_prompt(
    question: str,
    question_type: str,
    required_words: list[dict],
    response: str,
) -> str:
    word1 = required_words[0] if required_words else {"word": "", "definition": ""}
    word2 = required_words[1] if len(required_words) > 1 else {"word": "", "definition": ""}

    return (
        f"You are an IELTS Task 2 intro coach.\n\n"
        f"QUESTION: {question}\n"
        f"REQUIRED VOCABULARY: {word1['word']} ({word1['definition']}), {word2['word']} ({word2['definition']})\n\n"
        f"STUDENT'S TWO-SENTENCE INTRO:\n{response}\n\n"
        f"Grade on three criteria:\n\n"
        f"1. PARAPHRASE (0-3): Did they rephrase the question without copying key words?\n"
        f"   0 = copied the question almost word-for-word\n"
        f"   1 = changed only 1-2 words\n"
        f"   2 = reasonable paraphrase with some synonyms/structure change\n"
        f"   3 = strong paraphrase: different vocabulary AND structure\n\n"
        f"2. VOCABULARY USAGE (0-2): Did they use both required words naturally?\n"
        f"   0 = neither word used\n"
        f"   1 = only one word used, or used awkwardly\n"
        f"   2 = both words used naturally in context\n\n"
        f"3. POSITION CLARITY (0-2): Is their stance/position clear in sentence 2?\n"
        f"   0 = no position stated\n"
        f"   1 = vague or implied position\n"
        f"   2 = clear, direct position statement\n\n"
        f"Return ONLY valid JSON:\n"
        f'{{\n'
        f'  "paraphrase_score": 2,\n'
        f'  "vocab_score": 1,\n'
        f'  "position_score": 2,\n'
        f'  "total_score": 5,\n'
        f'  "feedback": "Good paraphrase and clear position. Try to use both vocabulary words more naturally.",\n'
        f'  "model_answer": "It is widely debated whether automation will ultimately benefit or harm society as a whole. While some worry about its disruptive effects, I believe it will facilitate economic growth and become ubiquitous in ways that improve everyday life."\n'
        f'}}'
    )


def _parse_json(raw: str) -> Optional[dict]:
    """Strip code fences and parse JSON. Returns None on failure."""
    cleaned = re.sub(r"```(?:json)?", "", raw).strip().rstrip("`").strip()
    try:
        return json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        logger.warning("mini_build: failed to parse AI JSON — raw=%r", raw[:300])
        return None


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/start", response_model=StartOut)
def start_drill(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
) -> StartOut:
    """Pick a question and 2 vocabulary words for a mini-build intro drill."""
    # pick_question expects a list of recently-used seq_ids.
    # Pass empty list — it will avoid recently used internally if seq_ids provided.
    question_entry = pick_question([])

    vocab_words = _pick_vocab_words(db, current_user.id)
    if len(vocab_words) < 2:
        raise HTTPException(
            status_code=404,
            detail="Not enough vocabulary words found. Add at least 2 words to your dictionary.",
        )

    required_words = [
        {"word": w.word, "definition": w.definition}
        for w in vocab_words
    ]

    return StartOut(
        question=question_entry["question"],
        question_type=question_entry["question_type"],
        required_words=required_words,
    )


@router.post("/grade", response_model=GradeOut)
def grade_drill(
    payload: GradeIn,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
) -> GradeOut:
    """Grade a mini-build intro and save the result."""
    if not payload.response.strip():
        raise HTTPException(status_code=400, detail="Response cannot be empty.")

    prompt = _build_grade_prompt(
        question=payload.question,
        question_type=payload.question_type,
        required_words=payload.required_words,
        response=payload.response.strip(),
    )

    from app.tasks import _generate_text  # lazy import — avoids circular dependency
    raw = _generate_text(prompt, max_tokens=350, temperature=0.3)

    parsed: dict = {}
    if raw:
        result = _parse_json(raw)
        if result:
            parsed = result
        else:
            logger.warning("mini_build grade: AI returned unparseable JSON")
    else:
        logger.warning("mini_build grade: AI service returned empty response")

    paraphrase_score = parsed.get("paraphrase_score")
    vocab_score = parsed.get("vocab_score")
    position_score = parsed.get("position_score")
    total_score = parsed.get("total_score")

    # Recompute total if missing or wrong
    if paraphrase_score is not None and vocab_score is not None and position_score is not None:
        total_score = paraphrase_score + vocab_score + position_score

    attempt = models.MiniBuildAttempt(
        person_id=current_user.id,
        question=payload.question,
        question_type=payload.question_type,
        required_words=payload.required_words,
        response=payload.response.strip(),
        paraphrase_score=paraphrase_score,
        vocab_score=vocab_score,
        position_score=position_score,
        total_score=total_score,
        feedback=parsed.get("feedback"),
        model_answer=parsed.get("model_answer"),
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    return GradeOut(
        id=attempt.id,
        paraphrase_score=attempt.paraphrase_score,
        vocab_score=attempt.vocab_score,
        position_score=attempt.position_score,
        total_score=attempt.total_score,
        feedback=attempt.feedback,
        model_answer=attempt.model_answer,
    )


@router.get("/history", response_model=List[HistoryItem])
def get_history(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
) -> List[HistoryItem]:
    """Return the last N mini-build attempts for this user, newest first."""
    attempts = (
        db.query(models.MiniBuildAttempt)
        .filter(models.MiniBuildAttempt.person_id == current_user.id)
        .order_by(models.MiniBuildAttempt.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        HistoryItem(
            id=a.id,
            question=(a.question[:80] + "…" if len(a.question) > 80 else a.question),
            required_words=a.required_words,
            total_score=a.total_score,
            paraphrase_score=a.paraphrase_score,
            vocab_score=a.vocab_score,
            position_score=a.position_score,
            feedback=a.feedback,
            created_at=str(a.created_at),
        )
        for a in attempts
    ]


@router.get("/stats", response_model=StatsOut)
def get_stats(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
) -> StatsOut:
    """Return mini-build accuracy stats for this user."""
    attempts = (
        db.query(models.MiniBuildAttempt)
        .filter(models.MiniBuildAttempt.person_id == current_user.id)
        .all()
    )

    total = len(attempts)
    totals_list = [a.total_score for a in attempts if a.total_score is not None]
    para_list = [a.paraphrase_score for a in attempts if a.paraphrase_score is not None]
    vocab_list = [a.vocab_score for a in attempts if a.vocab_score is not None]
    pos_list = [a.position_score for a in attempts if a.position_score is not None]

    def _avg(lst: list) -> Optional[float]:
        return round(sum(lst) / len(lst), 2) if lst else None

    dist: dict[str, int] = {}
    for a in attempts:
        if a.total_score is not None:
            key = str(a.total_score)
            dist[key] = dist.get(key, 0) + 1

    return StatsOut(
        total=total,
        avg_total=_avg(totals_list),
        avg_paraphrase=_avg(para_list),
        avg_vocab=_avg(vocab_list),
        avg_position=_avg(pos_list),
        score_distribution=dist,
    )
