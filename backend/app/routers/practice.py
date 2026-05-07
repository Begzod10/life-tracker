from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
import json
import random

from app import models
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(prefix="/practice", tags=["practice"])


# ─── Spaced repetition (simplified SM-2) ─────────────────────────────────────

# Day intervals applied to a "streak" of consecutive correct answers.
# After a wrong answer the streak drops back to 0 (next review = 1 day).
# Beyond the table, the interval doubles each correct answer.
SR_LADDER_DAYS = [1, 2, 4, 7, 14, 30, 60]


def _next_interval_days(prev_interval: int, was_correct: bool) -> int:
    if not was_correct:
        return 1
    if prev_interval <= 0:
        return SR_LADDER_DAYS[0]
    if prev_interval in SR_LADDER_DAYS:
        i = SR_LADDER_DAYS.index(prev_interval)
        return SR_LADDER_DAYS[i + 1] if i + 1 < len(SR_LADDER_DAYS) else prev_interval * 2
    # Custom interval: keep doubling (Anki-style growth)
    return prev_interval * 2


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
    }


# ─── Word selection ──────────────────────────────────────────────────────────

@router.get("/words")
def get_practice_words(
    count: int = Query(default=10, ge=1, le=50),
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
            models.DictionaryModule, models.DictionaryWord.module_id == models.DictionaryModule.id
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
        def is_weak(w):
            if w.review_count == 0:
                return True
            return (w.correct_count / w.review_count) < 0.7
        all_words = [w for w in all_words if is_weak(w)]

    if len(all_words) < 2:
        raise HTTPException(status_code=400, detail="Not enough words available for practice (need at least 2).")

    if due_only or weak_only:
        # Pool was already narrowed; take up to count, prioritising oldest/never-reviewed first.
        all_words.sort(key=lambda w: (
            0 if w.review_count == 0 else 1,
            w.last_reviewed_at or w.created_at,
        ))
        selected = all_words[:count]
        # Need a wider pool for distractors so options aren't too repetitive.
        pool = list({w.id: w for w in all_words}.values())
        if len(pool) < 4:
            extra = db.query(models.DictionaryWord).filter(
                models.DictionaryWord.person_id == current_user.id,
                models.DictionaryWord.deleted == False,
                models.DictionaryWord.id.notin_([w.id for w in pool]),
            ).limit(20).all()
            pool += extra
        return [_serialize_practice_word(w, pool) for w in selected]

    selected = random.sample(all_words, min(count, len(all_words)))
    return [_serialize_practice_word(w, all_words) for w in selected]


# ─── Result submission with SM-2 scheduling ──────────────────────────────────

@router.post("/result")
def submit_result(
    word_id: int,
    was_correct: bool,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    word = db.query(models.DictionaryWord).filter(
        models.DictionaryWord.id == word_id,
        models.DictionaryWord.person_id == current_user.id,
    ).first()
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")

    word.review_count += 1
    if was_correct:
        word.correct_count += 1
    now = datetime.utcnow()
    word.last_reviewed_at = now

    next_days = _next_interval_days(word.interval_days or 0, was_correct)
    word.interval_days = next_days
    word.next_review_at = now + timedelta(days=next_days)

    db.commit()
    return {
        "ok": True,
        "interval_days": word.interval_days,
        "next_review_at": word.next_review_at.isoformat(),
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
    db.commit()
    return {
        "id": session.id,
        "mode": session.mode,
        "total_questions": session.total_questions,
        "correct_answers": session.correct_answers,
        "started_at": session.started_at,
        "completed_at": session.completed_at,
    }


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
