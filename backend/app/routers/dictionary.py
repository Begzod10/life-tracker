import logging
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional

from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dictionary", tags=["dictionary"])


# ─── AI auto-fill ────────────────────────────────────────────────────────────

class AiWordRequest(BaseModel):
    word: str = Field(..., min_length=1, max_length=200)


def _ai_word_prompt(word: str) -> str:
    return (
        f"You are an English-as-a-foreign-language dictionary helper.\n"
        f"For the word or phrase: \"{word.strip()}\"\n\n"
        f"Return ONLY a single JSON object with these keys (no markdown, no commentary):\n"
        f"{{\n"
        f"  \"definition\": string,           // a clear 1-2 sentence learner-friendly definition\n"
        f"  \"translation\": string,          // \"<Uzbek (Latin script)> / <Russian>\"  — example: \"Qat'iyat / Настойчивость\"\n"
        f"  \"phonetic\": string,             // IPA in slashes, e.g. \"/ˌpɜː.sɪˈvɪər.əns/\"\n"
        f"  \"part_of_speech\": string,       // one of: noun, verb, adjective, adverb, phrase, idiom\n"
        f"  \"difficulty\": string,           // one of: A1, A2, B1, B2, C1, C2\n"
        f"  \"examples\": [string, string]    // exactly 2 short, natural example sentences\n"
        f"}}\n\n"
        f"If the input isn't a real English word/phrase, still return your best guess; do not refuse."
    )


class AiGenerateModuleRequest(BaseModel):
    folder_id: int
    topic: str = Field(..., min_length=2, max_length=200)
    level: str = Field(default="B1", pattern="^(A1|A2|B1|B2|C1|C2)$")
    count: int = Field(default=15, ge=3, le=40)
    module_name: Optional[str] = None


class AiExtractRequest(BaseModel):
    text: str = Field(..., min_length=10, max_length=8000)
    level: str = Field(default="B1", pattern="^(A1|A2|B1|B2|C1|C2)$")
    max_words: int = Field(default=15, ge=1, le=40)


def _ai_module_prompt(topic: str, level: str, count: int) -> str:
    return (
        f"You are designing a vocabulary module for an English learner at CEFR level {level}.\n"
        f"Topic: \"{topic.strip()}\"\n"
        f"Pick exactly {count} useful, distinct words/phrases at or near level {level}.\n\n"
        f"Return ONLY a JSON array (no markdown, no commentary). Each item must be:\n"
        f"{{\n"
        f"  \"word\": string,\n"
        f"  \"definition\": string,\n"
        f"  \"translation\": string,            // \"<Uzbek (Latin)> / <Russian>\"\n"
        f"  \"phonetic\": string,               // IPA in slashes\n"
        f"  \"part_of_speech\": string,         // noun|verb|adjective|adverb|phrase|idiom\n"
        f"  \"difficulty\": string,             // A1|A2|B1|B2|C1|C2\n"
        f"  \"examples\": [string, string]\n"
        f"}}\n"
        f"Avoid duplicates. Keep entries concise."
    )


def _ai_extract_prompt(text: str, level: str, max_words: int) -> str:
    return (
        f"You help English learners mine vocabulary from real texts.\n"
        f"Reader level: CEFR {level}.\n"
        f"From the text below, pick up to {max_words} words or short phrases that are likely "
        f"useful and at or above the reader's level (don't pick basic words they already know).\n"
        f"Prefer words that recur in academic, IELTS, news, or work contexts.\n\n"
        f"Return ONLY a JSON array (no markdown). Each item:\n"
        f"{{\n"
        f"  \"word\": string,                   // exact form to study (lemma if obvious)\n"
        f"  \"definition\": string,\n"
        f"  \"translation\": string,            // \"<Uzbek (Latin)> / <Russian>\"\n"
        f"  \"phonetic\": string,\n"
        f"  \"part_of_speech\": string,\n"
        f"  \"difficulty\": string,             // A1..C2\n"
        f"  \"examples\": [string, string]      // first example MUST be the sentence the word appears in (or close)\n"
        f"}}\n\n"
        f"TEXT:\n\"\"\"\n{text.strip()}\n\"\"\""
    )


def _parse_ai_json(raw: str):
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if "\n" in cleaned:
            first_line, rest = cleaned.split("\n", 1)
            if first_line.strip().lower() in {"json", ""}:
                cleaned = rest
    return json.loads(cleaned)


def _normalize_ai_word(item: dict) -> Optional[dict]:
    if not isinstance(item, dict):
        return None
    word = str(item.get("word") or "").strip()
    definition = str(item.get("definition") or "").strip()
    if not word or not definition:
        return None

    pos = (item.get("part_of_speech") or "").strip().lower()
    if pos not in {"noun", "verb", "adjective", "adverb", "phrase", "idiom"}:
        pos = "noun"

    diff = (item.get("difficulty") or "").strip().upper()
    if diff not in {"A1", "A2", "B1", "B2", "C1", "C2"}:
        diff = "B1"

    examples = item.get("examples") or []
    if not isinstance(examples, list):
        examples = []
    examples = [str(e).strip() for e in examples if str(e).strip()][:5]

    return {
        "word": word,
        "definition": definition,
        "translation": str(item.get("translation") or "").strip(),
        "phonetic": str(item.get("phonetic") or "").strip(),
        "part_of_speech": pos,
        "difficulty": diff,
        "examples": examples,
    }


@router.post("/ai/generate-module", status_code=201)
def ai_generate_module(
    payload: AiGenerateModuleRequest,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Generate a complete module with vocabulary from a topic + level."""
    from app.config import settings
    from app.tasks import _generate_text

    if not (settings.OPENAI_API_KEY or settings.GROQ_API_KEY):
        raise HTTPException(status_code=503, detail="AI provider not configured.")

    folder = _own_folder_or_404(db, current_user.id, payload.folder_id)

    prompt = _ai_module_prompt(payload.topic, payload.level, payload.count)
    try:
        raw = _generate_text(prompt, max_tokens=2400, temperature=0.5)
    except Exception as e:
        logger.exception("ai_generate_module: generation failed")
        raise HTTPException(status_code=502, detail=f"AI request failed: {type(e).__name__}: {e}")

    if not raw:
        raise HTTPException(status_code=502, detail="AI provider returned no text.")

    try:
        items = _parse_ai_json(raw)
    except json.JSONDecodeError:
        logger.warning("ai_generate_module: non-JSON response: %r", raw[:300])
        raise HTTPException(status_code=502, detail="AI response was not valid JSON.")

    if not isinstance(items, list) or not items:
        raise HTTPException(status_code=502, detail="AI response did not contain a word list.")

    module_name = (payload.module_name or payload.topic).strip()[:120]
    module = models.DictionaryModule(
        person_id=current_user.id,
        folder_id=folder.id,
        name=module_name,
        description=f"Auto-generated · {payload.level} · {payload.topic}",
    )
    db.add(module)
    db.flush()

    created = 0
    for item in items:
        norm = _normalize_ai_word(item)
        if not norm:
            continue
        word = models.DictionaryWord(
            person_id=current_user.id,
            module_id=module.id,
            word=norm["word"],
            definition=norm["definition"],
            translation=norm["translation"] or None,
            phonetic=norm["phonetic"] or None,
            part_of_speech=norm["part_of_speech"],
            difficulty=norm["difficulty"],
            examples=json.dumps(norm["examples"]) if norm["examples"] else None,
        )
        db.add(word)
        created += 1

    if created == 0:
        db.rollback()
        raise HTTPException(status_code=502, detail="AI returned no usable words.")

    db.commit()
    db.refresh(module)
    return {
        "id": module.id,
        "folder_id": module.folder_id,
        "name": module.name,
        "description": module.description,
        "word_count": created,
        "created_at": module.created_at,
    }


@router.post("/ai/extract-vocab")
def ai_extract_vocab(
    payload: AiExtractRequest,
    current_user: models.Person = Depends(get_current_user),
):
    """Extract candidate vocabulary words from a passage. No DB writes — caller
    decides which to save."""
    from app.config import settings
    from app.tasks import _generate_text

    if not (settings.OPENAI_API_KEY or settings.GROQ_API_KEY):
        raise HTTPException(status_code=503, detail="AI provider not configured.")

    prompt = _ai_extract_prompt(payload.text, payload.level, payload.max_words)
    try:
        raw = _generate_text(prompt, max_tokens=2400, temperature=0.4)
    except Exception as e:
        logger.exception("ai_extract_vocab: generation failed")
        raise HTTPException(status_code=502, detail=f"AI request failed: {type(e).__name__}: {e}")

    if not raw:
        raise HTTPException(status_code=502, detail="AI provider returned no text.")

    try:
        items = _parse_ai_json(raw)
    except json.JSONDecodeError:
        logger.warning("ai_extract_vocab: non-JSON response: %r", raw[:300])
        raise HTTPException(status_code=502, detail="AI response was not valid JSON.")

    if not isinstance(items, list):
        raise HTTPException(status_code=502, detail="AI response did not contain a list.")

    candidates = [n for n in (_normalize_ai_word(it) for it in items) if n]
    return {"candidates": candidates}


@router.post("/ai/word-details")
def ai_word_details(
    payload: AiWordRequest,
    current_user: models.Person = Depends(get_current_user),
):
    """Generate dictionary fields for a word using the configured LLM."""
    from app.config import settings
    from app.tasks import _generate_text

    if not (settings.OPENAI_API_KEY or settings.GROQ_API_KEY):
        raise HTTPException(
            status_code=503,
            detail="AI provider not configured. Set OPENAI_API_KEY or GROQ_API_KEY.",
        )

    prompt = _ai_word_prompt(payload.word)

    try:
        raw = _generate_text(prompt, max_tokens=400, temperature=0.4)
    except Exception as e:
        logger.exception("ai_word_details: generation failed")
        raise HTTPException(
            status_code=502,
            detail=f"AI request failed: {type(e).__name__}: {e}",
        )

    if not raw:
        raise HTTPException(status_code=502, detail="AI provider returned no text.")

    # Strip markdown code fences if the model added them despite instructions.
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        # Remove an optional language tag on the first line ("json\n...")
        if "\n" in cleaned:
            first_line, rest = cleaned.split("\n", 1)
            if first_line.strip().lower() in {"json", ""}:
                cleaned = rest

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning("ai_word_details: non-JSON response: %r", raw[:300])
        raise HTTPException(
            status_code=502,
            detail="AI response was not valid JSON. Try again or fill manually.",
        )

    allowed_pos = {"noun", "verb", "adjective", "adverb", "phrase", "idiom"}
    allowed_diff = {"A1", "A2", "B1", "B2", "C1", "C2"}

    pos = (data.get("part_of_speech") or "").strip().lower()
    if pos not in allowed_pos:
        pos = "noun"

    diff = (data.get("difficulty") or "").strip().upper()
    if diff not in allowed_diff:
        diff = "B1"

    examples = data.get("examples") or []
    if not isinstance(examples, list):
        examples = []
    examples = [str(e).strip() for e in examples if str(e).strip()][:5]

    return {
        "word": payload.word.strip(),
        "definition": str(data.get("definition") or "").strip(),
        "translation": str(data.get("translation") or "").strip(),
        "phonetic": str(data.get("phonetic") or "").strip(),
        "part_of_speech": pos,
        "difficulty": diff,
        "examples": examples,
    }


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
