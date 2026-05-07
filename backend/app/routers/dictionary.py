from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import json

from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(prefix="/dictionary", tags=["dictionary"])


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _serialize_word(word: models.DictionaryWord) -> dict:
    return {
        "id": word.id,
        "person_id": word.person_id,
        "module_id": word.module_id,
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


def _own_module_or_404(db: Session, user_id: int, module_id: int) -> models.DictionaryModule:
    module = db.query(models.DictionaryModule).filter(
        models.DictionaryModule.id == module_id,
        models.DictionaryModule.person_id == user_id,
    ).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    return module


def _own_folder_or_404(db: Session, user_id: int, folder_id: int) -> models.DictionaryFolder:
    folder = db.query(models.DictionaryFolder).filter(
        models.DictionaryFolder.id == folder_id,
        models.DictionaryFolder.person_id == user_id,
    ).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    return folder


# ─── Stats ───────────────────────────────────────────────────────────────────

@router.get("/stats")
def get_stats(
    folder_id: Optional[int] = Query(None),
    module_id: Optional[int] = Query(None),
    needs_review_limit: int = Query(default=5, ge=0, le=50),
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

    words = q.all()

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

    # Needs review: prioritize never-reviewed first, then lowest accuracy.
    def review_priority(w: models.DictionaryWord) -> tuple:
        if w.review_count == 0:
            return (0, 0.0, w.created_at)
        acc = w.correct_count / w.review_count
        return (1, acc, w.last_reviewed_at or w.created_at)

    needs_review_words = sorted(words, key=review_priority)[:needs_review_limit]
    needs_review_total = sum(
        1 for w in words
        if w.review_count == 0 or (w.review_count > 0 and w.correct_count / w.review_count < 0.7)
    )

    needs_review = [
        {
            "id": w.id,
            "module_id": w.module_id,
            "word": w.word,
            "difficulty": w.difficulty,
            "review_count": w.review_count,
            "accuracy": (round(w.correct_count / w.review_count * 100, 1)
                         if w.review_count > 0 else None),
        }
        for w in needs_review_words
    ]

    return {
        "total": total,
        "reviewed": reviewed,
        "accuracy": accuracy,
        "by_difficulty": by_difficulty,
        "by_part_of_speech": by_pos,
        "needs_review_total": needs_review_total,
        "needs_review": needs_review,
    }


# ─── Folders ─────────────────────────────────────────────────────────────────

@router.get("/folders/")
def list_folders(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    folders = db.query(models.DictionaryFolder).filter(
        models.DictionaryFolder.person_id == current_user.id,
    ).order_by(models.DictionaryFolder.created_at.asc()).all()

    if not folders:
        return []

    folder_ids = [f.id for f in folders]
    module_counts = dict(
        db.query(models.DictionaryModule.folder_id, func.count(models.DictionaryModule.id))
        .filter(models.DictionaryModule.folder_id.in_(folder_ids))
        .group_by(models.DictionaryModule.folder_id)
        .all()
    )
    word_counts = dict(
        db.query(models.DictionaryModule.folder_id, func.count(models.DictionaryWord.id))
        .join(models.DictionaryWord, models.DictionaryWord.module_id == models.DictionaryModule.id)
        .filter(
            models.DictionaryModule.folder_id.in_(folder_ids),
            models.DictionaryWord.deleted == False,
        )
        .group_by(models.DictionaryModule.folder_id)
        .all()
    )

    return [
        {
            "id": f.id,
            "person_id": f.person_id,
            "name": f.name,
            "color": f.color,
            "module_count": module_counts.get(f.id, 0),
            "word_count": word_counts.get(f.id, 0),
            "created_at": f.created_at,
        }
        for f in folders
    ]


@router.post("/folders/", status_code=201)
def create_folder(
    data: schemas.DictionaryFolderCreate,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    folder = models.DictionaryFolder(
        person_id=current_user.id,
        name=data.name.strip(),
        color=data.color,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return {
        "id": folder.id,
        "person_id": folder.person_id,
        "name": folder.name,
        "color": folder.color,
        "module_count": 0,
        "word_count": 0,
        "created_at": folder.created_at,
    }


@router.put("/folders/{folder_id}")
def update_folder(
    folder_id: int,
    data: schemas.DictionaryFolderUpdate,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    folder = _own_folder_or_404(db, current_user.id, folder_id)
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(folder, field, value.strip() if isinstance(value, str) and field == "name" else value)
    db.commit()
    db.refresh(folder)
    return {
        "id": folder.id,
        "person_id": folder.person_id,
        "name": folder.name,
        "color": folder.color,
        "module_count": db.query(models.DictionaryModule).filter(models.DictionaryModule.folder_id == folder.id).count(),
        "word_count": db.query(models.DictionaryWord).join(
            models.DictionaryModule, models.DictionaryWord.module_id == models.DictionaryModule.id
        ).filter(
            models.DictionaryModule.folder_id == folder.id,
            models.DictionaryWord.deleted == False,
        ).count(),
        "created_at": folder.created_at,
    }


@router.delete("/folders/{folder_id}", status_code=204)
def delete_folder(
    folder_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    folder = _own_folder_or_404(db, current_user.id, folder_id)
    db.delete(folder)
    db.commit()


# ─── Modules ─────────────────────────────────────────────────────────────────

@router.get("/modules/")
def list_modules(
    folder_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    q = db.query(models.DictionaryModule).filter(
        models.DictionaryModule.person_id == current_user.id,
    )
    if folder_id is not None:
        q = q.filter(models.DictionaryModule.folder_id == folder_id)
    modules = q.order_by(models.DictionaryModule.created_at.asc()).all()

    if not modules:
        return []

    module_ids = [m.id for m in modules]
    word_counts = dict(
        db.query(models.DictionaryWord.module_id, func.count(models.DictionaryWord.id))
        .filter(
            models.DictionaryWord.module_id.in_(module_ids),
            models.DictionaryWord.deleted == False,
        )
        .group_by(models.DictionaryWord.module_id)
        .all()
    )

    return [
        {
            "id": m.id,
            "folder_id": m.folder_id,
            "person_id": m.person_id,
            "name": m.name,
            "description": m.description,
            "word_count": word_counts.get(m.id, 0),
            "created_at": m.created_at,
        }
        for m in modules
    ]


@router.post("/modules/", status_code=201)
def create_module(
    data: schemas.DictionaryModuleCreate,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    _own_folder_or_404(db, current_user.id, data.folder_id)
    module = models.DictionaryModule(
        person_id=current_user.id,
        folder_id=data.folder_id,
        name=data.name.strip(),
        description=data.description,
    )
    db.add(module)
    db.commit()
    db.refresh(module)
    return {
        "id": module.id,
        "folder_id": module.folder_id,
        "person_id": module.person_id,
        "name": module.name,
        "description": module.description,
        "word_count": 0,
        "created_at": module.created_at,
    }


@router.put("/modules/{module_id}")
def update_module(
    module_id: int,
    data: schemas.DictionaryModuleUpdate,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    module = _own_module_or_404(db, current_user.id, module_id)
    update_data = data.model_dump(exclude_unset=True)
    if "folder_id" in update_data and update_data["folder_id"] is not None:
        _own_folder_or_404(db, current_user.id, update_data["folder_id"])
    for field, value in update_data.items():
        setattr(module, field, value.strip() if isinstance(value, str) and field == "name" else value)
    db.commit()
    db.refresh(module)
    return {
        "id": module.id,
        "folder_id": module.folder_id,
        "person_id": module.person_id,
        "name": module.name,
        "description": module.description,
        "word_count": db.query(models.DictionaryWord).filter(
            models.DictionaryWord.module_id == module.id,
            models.DictionaryWord.deleted == False,
        ).count(),
        "created_at": module.created_at,
    }


@router.delete("/modules/{module_id}", status_code=204)
def delete_module(
    module_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    module = _own_module_or_404(db, current_user.id, module_id)
    db.delete(module)
    db.commit()


# ─── Words ───────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[dict])
def list_words(
    module_id: Optional[int] = Query(None),
    folder_id: Optional[int] = Query(None),
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
    if module_id is not None:
        q = q.filter(models.DictionaryWord.module_id == module_id)
    if folder_id is not None:
        q = q.join(
            models.DictionaryModule, models.DictionaryWord.module_id == models.DictionaryModule.id
        ).filter(models.DictionaryModule.folder_id == folder_id)
    if search:
        q = q.filter(models.DictionaryWord.word.ilike(f"%{search}%"))
    if difficulty:
        q = q.filter(models.DictionaryWord.difficulty == difficulty)
    if part_of_speech:
        q = q.filter(models.DictionaryWord.part_of_speech == part_of_speech)

    words = q.order_by(models.DictionaryWord.created_at.desc()).all()
    return [_serialize_word(w) for w in words]


@router.post("/", status_code=201)
def create_word(
    data: schemas.DictionaryWordCreate,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    _own_module_or_404(db, current_user.id, data.module_id)
    word = models.DictionaryWord(
        person_id=current_user.id,
        module_id=data.module_id,
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
    return _serialize_word(word)


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
    if "module_id" in update_data and update_data["module_id"] is not None:
        _own_module_or_404(db, current_user.id, update_data["module_id"])
    for field, value in update_data.items():
        if field == "examples":
            setattr(word, field, json.dumps(value) if value is not None else None)
        else:
            setattr(word, field, value)

    db.commit()
    db.refresh(word)
    return _serialize_word(word)


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
