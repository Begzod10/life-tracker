from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
import json

from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(prefix="/dictionary", tags=["dictionary"])


def _serialize(word: models.DictionaryWord) -> dict:
    return {
        "id": word.id,
        "person_id": word.person_id,
        "word": word.word,
        "definition": word.definition,
        "translation": word.translation,
        "part_of_speech": word.part_of_speech,
        "examples": json.loads(word.examples) if word.examples else [],
        "phonetic": word.phonetic,
        "difficulty": word.difficulty,
        "tags": word.tags,
        "review_count": word.review_count,
        "correct_count": word.correct_count,
        "last_reviewed_at": word.last_reviewed_at,
        "created_at": word.created_at,
    }


@router.get("/stats")
def get_stats(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    words = db.query(models.DictionaryWord).filter(
        models.DictionaryWord.person_id == current_user.id,
        models.DictionaryWord.deleted == False,
    ).all()

    total = len(words)
    reviewed = sum(1 for w in words if w.review_count > 0)
    total_reviews = sum(w.review_count for w in words)
    total_correct = sum(w.correct_count for w in words)
    accuracy = round(total_correct / total_reviews * 100, 1) if total_reviews > 0 else 0.0

    by_difficulty: dict = {}
    by_pos: dict = {}
    for w in words:
        by_difficulty[w.difficulty] = by_difficulty.get(w.difficulty, 0) + 1
        pos = w.part_of_speech or "other"
        by_pos[pos] = by_pos.get(pos, 0) + 1

    return {
        "total": total,
        "reviewed": reviewed,
        "accuracy": accuracy,
        "by_difficulty": by_difficulty,
        "by_part_of_speech": by_pos,
    }


@router.get("/", response_model=List[dict])
def list_words(
    search: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
    part_of_speech: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    q = db.query(models.DictionaryWord).filter(
        models.DictionaryWord.person_id == current_user.id,
        models.DictionaryWord.deleted == False,
    )
    if search:
        q = q.filter(models.DictionaryWord.word.ilike(f"%{search}%"))
    if difficulty:
        q = q.filter(models.DictionaryWord.difficulty == difficulty)
    if part_of_speech:
        q = q.filter(models.DictionaryWord.part_of_speech == part_of_speech)

    words = q.order_by(models.DictionaryWord.created_at.desc()).all()
    return [_serialize(w) for w in words]


@router.post("/", status_code=201)
def create_word(
    data: schemas.DictionaryWordCreate,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    word = models.DictionaryWord(
        person_id=current_user.id,
        word=data.word,
        definition=data.definition,
        translation=data.translation,
        part_of_speech=data.part_of_speech,
        examples=json.dumps(data.examples) if data.examples else None,
        phonetic=data.phonetic,
        difficulty=data.difficulty,
        tags=data.tags,
    )
    db.add(word)
    db.commit()
    db.refresh(word)
    return _serialize(word)


@router.put("/{word_id}")
def update_word(
    word_id: int,
    data: schemas.DictionaryWordUpdate,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    word = db.query(models.DictionaryWord).filter(
        models.DictionaryWord.id == word_id,
        models.DictionaryWord.person_id == current_user.id,
        models.DictionaryWord.deleted == False,
    ).first()
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "examples":
            setattr(word, field, json.dumps(value) if value is not None else None)
        else:
            setattr(word, field, value)

    db.commit()
    db.refresh(word)
    return _serialize(word)


@router.delete("/{word_id}", status_code=204)
def delete_word(
    word_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    word = db.query(models.DictionaryWord).filter(
        models.DictionaryWord.id == word_id,
        models.DictionaryWord.person_id == current_user.id,
    ).first()
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")
    word.deleted = True
    db.commit()
