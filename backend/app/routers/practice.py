from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
import json
import random

from app import models
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(prefix="/practice", tags=["practice"])


@router.get("/words")
def get_practice_words(
    count: int = Query(default=10, ge=1, le=50),
    difficulty: Optional[str] = Query(None),
    module_id: Optional[int] = Query(None),
    folder_id: Optional[int] = Query(None),
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

    all_words = q.all()
    if len(all_words) < 2:
        raise HTTPException(status_code=400, detail="Add at least 2 words to start practicing")

    selected = random.sample(all_words, min(count, len(all_words)))

    result = []
    for word in selected:
        distractors = [w for w in all_words if w.id != word.id]
        distractor_sample = random.sample(distractors, min(3, len(distractors)))
        options = [word.word] + [d.word for d in distractor_sample]
        random.shuffle(options)

        result.append({
            "id": word.id,
            "word": word.word,
            "definition": word.definition,
            "translation": word.translation,
            "phonetic": word.phonetic,
            "examples": json.loads(word.examples) if word.examples else [],
            "difficulty": word.difficulty,
            "options": options,
        })

    return result


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
    word.last_reviewed_at = datetime.utcnow()
    db.commit()
    return {"ok": True}


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
