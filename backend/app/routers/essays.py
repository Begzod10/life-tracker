import json
import logging
import re
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, desc
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/essays", tags=["essays"])

ALLOWED_LEVELS = {"A1", "A2", "B1", "B2", "C1", "C2"}
DEFAULT_WORD_COUNT_BY_LEVEL = {
    "A1": 80, "A2": 120, "B1": 180, "B2": 250, "C1": 320, "C2": 400,
}


# ─── Helpers ────────────────────────────────────────────────────────────────

def _count_words(body: str) -> int:
    if not body:
        return 0
    return len(re.findall(r"\b[\w'\-]+\b", body, flags=re.UNICODE))


def _parse_json_field(raw: Optional[str]):
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


def _strip_json_fence(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if "\n" in cleaned:
            first, rest = cleaned.split("\n", 1)
            if first.strip().lower() in {"json", ""}:
                cleaned = rest
    return cleaned


def _serialize(e: models.Essay) -> dict:
    return {
        "id": e.id,
        "title": e.title,
        "prompt": e.prompt,
        "body": e.body,
        "level": e.level,
        "target_word_count": e.target_word_count,
        "target_words": _parse_json_field(e.target_words) or [],
        "status": e.status,
        "word_count": e.word_count,
        "quick_score": e.quick_score,
        "quick_feedback": _parse_json_field(e.quick_feedback),
        "deep_score": e.deep_score,
        "deep_review": _parse_json_field(e.deep_review),
        "time_spent_seconds": e.time_spent_seconds,
        "created_at": e.created_at,
        "updated_at": e.updated_at,
        "submitted_at": e.submitted_at,
    }


def _own_essay_or_404(db: Session, user_id: int, essay_id: int) -> models.Essay:
    e = db.query(models.Essay).filter(
        models.Essay.id == essay_id,
        models.Essay.person_id == user_id,
        models.Essay.deleted == False,
    ).first()
    if not e:
        raise HTTPException(status_code=404, detail="Essay not found.")
    return e


def _require_ai_provider():
    from app.config import settings
    if not (settings.OPENAI_API_KEY or settings.GROQ_API_KEY):
        raise HTTPException(
            status_code=503,
            detail="AI provider not configured. Set OPENAI_API_KEY or GROQ_API_KEY.",
        )


def _pick_target_words(db: Session, user_id: int, level: str, limit: int = 6) -> List[str]:
    """Pull up to N due-for-review or weak words from the user's dictionary at-or-near the level."""
    rows = db.query(models.DictionaryWord).filter(
        models.DictionaryWord.person_id == user_id,
        models.DictionaryWord.deleted == False,
        or_(
            models.DictionaryWord.next_review_at.is_(None),
            models.DictionaryWord.next_review_at <= datetime.utcnow(),
        ),
    ).all()
    # Prefer words matching the level, then near-level
    level_order = ["A1", "A2", "B1", "B2", "C1", "C2"]
    try:
        target_idx = level_order.index(level)
    except ValueError:
        target_idx = 2

    def distance(w):
        try:
            return abs(level_order.index(w.difficulty) - target_idx)
        except ValueError:
            return 99

    def weakness(w):
        if w.review_count == 0:
            return 0
        return -(w.correct_count / w.review_count)  # lower accuracy first

    rows.sort(key=lambda w: (distance(w), weakness(w)))
    return [w.word for w in rows[:limit]]


# ─── AI prompts ──────────────────────────────────────────────────────────────

def _prompt_topic_prompt(level: str, hint: Optional[str], target_words: List[str], word_count: int) -> str:
    hint_clause = f"Topic hint: \"{hint}\".\n" if hint else ""
    words_clause = (
        f"If natural, the prompt should invite the learner to use words like: {', '.join(target_words)}.\n"
        if target_words else ""
    )
    return (
        f"You design English essay prompts for a learner at CEFR level {level}.\n"
        f"{hint_clause}{words_clause}"
        f"Write ONE essay prompt (1-3 sentences) appropriate for {level} that is interesting, "
        f"specific, and answerable in roughly {word_count} words. Avoid generic clichés.\n\n"
        f"Return ONLY a JSON object (no markdown):\n"
        f"{{ \"prompt\": string, \"title\": string }}"
    )


def _quick_check_prompt(level: str, prompt: str, body: str, target_words: List[str]) -> str:
    tw_clause = (
        f"Target vocabulary the learner aimed to use: {', '.join(target_words)}.\n"
        if target_words else ""
    )
    return (
        f"You are an encouraging English writing coach grading at CEFR level {level}.\n"
        f"Essay prompt:\n\"\"\"\n{prompt}\n\"\"\"\n\n"
        f"{tw_clause}"
        f"Student essay:\n\"\"\"\n{body}\n\"\"\"\n\n"
        f"Provide a fast assessment. Return ONLY this JSON object (no markdown):\n"
        f"{{\n"
        f"  \"score\": number,            // 0-100, holistic\n"
        f"  \"level_estimate\": string,    // CEFR estimate of the writing\n"
        f"  \"strengths\": [string, string, string],\n"
        f"  \"improvements\": [string, string, string],\n"
        f"  \"suggestions\": [string, string, string]   // concrete next-step advice\n"
        f"}}"
    )


def _deep_review_prompt(level: str, prompt: str, body: str, target_words: List[str]) -> str:
    tw_clause = (
        f"Target vocabulary the learner aimed to use: {', '.join(target_words)}.\n"
        if target_words else ""
    )
    return (
        f"You are a meticulous English writing teacher reviewing at CEFR level {level}.\n"
        f"Essay prompt:\n\"\"\"\n{prompt}\n\"\"\"\n\n"
        f"{tw_clause}"
        f"Student essay:\n\"\"\"\n{body}\n\"\"\"\n\n"
        f"Provide a detailed review. Return ONLY this JSON object (no markdown):\n"
        f"{{\n"
        f"  \"score\": number,                // 0-100\n"
        f"  \"level_estimate\": string,        // CEFR\n"
        f"  \"criteria\": {{\n"
        f"     \"task_response\": number,      // 0-25\n"
        f"     \"coherence_cohesion\": number, // 0-25\n"
        f"     \"vocabulary\": number,         // 0-25\n"
        f"     \"grammar\": number             // 0-25\n"
        f"  }},\n"
        f"  \"overall\": string,                // 2-4 sentence verdict\n"
        f"  \"sentences\": [                    // up to 8 of the most important fixes\n"
        f"     {{\n"
        f"        \"original\": string,\n"
        f"        \"issue\": string,            // 'grammar' | 'vocab' | 'style' | 'cohesion' | 'clarity'\n"
        f"        \"explanation\": string,\n"
        f"        \"suggestion\": string\n"
        f"     }}\n"
        f"  ],\n"
        f"  \"vocabulary_upgrades\": [           // up to 5 stronger word/phrase swaps\n"
        f"     {{ \"from\": string, \"to\": string, \"why\": string }}\n"
        f"  ]\n"
        f"}}"
    )


# ─── Endpoints ──────────────────────────────────────────────────────────────

@router.post("/prompt", response_model=schemas.EssayPromptResponse)
def generate_prompt(
    payload: schemas.EssayPromptRequest,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    from app.tasks import _generate_text

    _require_ai_provider()
    level = payload.level if payload.level in ALLOWED_LEVELS else "B1"
    word_count = payload.target_word_count or DEFAULT_WORD_COUNT_BY_LEVEL[level]

    target_words: List[str] = []
    if payload.use_weak_words:
        target_words = _pick_target_words(db, current_user.id, level, limit=6)

    prompt_text = _prompt_topic_prompt(level, payload.topic_hint, target_words, word_count)
    try:
        raw = _generate_text(prompt_text, max_tokens=400, temperature=0.7)
    except Exception as e:
        logger.exception("generate_prompt: AI failed")
        raise HTTPException(status_code=502, detail=f"AI request failed: {type(e).__name__}: {e}")

    if not raw:
        raise HTTPException(status_code=502, detail="AI provider returned no text.")

    try:
        data = json.loads(_strip_json_fence(raw))
    except json.JSONDecodeError:
        logger.warning("generate_prompt: non-JSON response: %r", raw[:200])
        raise HTTPException(status_code=502, detail="AI response was not valid JSON.")

    return {
        "prompt": str(data.get("prompt") or "").strip(),
        "suggested_word_count": word_count,
        "target_words": target_words,
        "level": level,
    }


@router.get("", response_model=List[schemas.EssayListItem])
def list_essays(
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    q = db.query(models.Essay).filter(
        models.Essay.person_id == current_user.id,
        models.Essay.deleted == False,
    )
    if status:
        q = q.filter(models.Essay.status == status)
    return q.order_by(desc(models.Essay.updated_at), desc(models.Essay.created_at)).all()


@router.get("/{essay_id}")
def get_essay(
    essay_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    e = _own_essay_or_404(db, current_user.id, essay_id)
    return _serialize(e)


@router.post("", status_code=201)
def create_essay(
    payload: schemas.EssayCreate,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    level = payload.level if payload.level in ALLOWED_LEVELS else "B1"
    body = payload.body or ""
    e = models.Essay(
        person_id=current_user.id,
        title=payload.title,
        prompt=payload.prompt.strip(),
        body=body,
        level=level,
        target_word_count=payload.target_word_count,
        target_words=json.dumps(payload.target_words) if payload.target_words else None,
        status="draft",
        word_count=_count_words(body),
    )
    db.add(e)
    db.commit()
    db.refresh(e)
    return _serialize(e)


@router.put("/{essay_id}")
def update_essay(
    essay_id: int,
    payload: schemas.EssayUpdate,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    e = _own_essay_or_404(db, current_user.id, essay_id)
    data = payload.model_dump(exclude_unset=True)

    if "title" in data:
        e.title = data["title"]
    if "level" in data and data["level"] in ALLOWED_LEVELS:
        e.level = data["level"]
    if "target_word_count" in data:
        e.target_word_count = data["target_word_count"]
    if "target_words" in data:
        e.target_words = json.dumps(data["target_words"]) if data["target_words"] else None
    if "time_spent_seconds" in data and data["time_spent_seconds"] is not None:
        e.time_spent_seconds = max(int(data["time_spent_seconds"]), 0)
    if "body" in data:
        e.body = data["body"] or ""
        e.word_count = _count_words(e.body)
    if "status" in data and data["status"] in {"draft", "submitted"}:
        e.status = data["status"]
        if data["status"] == "submitted" and not e.submitted_at:
            e.submitted_at = datetime.utcnow()

    db.commit()
    db.refresh(e)
    return _serialize(e)


@router.delete("/{essay_id}", status_code=204)
def delete_essay(
    essay_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    e = _own_essay_or_404(db, current_user.id, essay_id)
    e.deleted = True
    db.commit()
    return None


@router.post("/{essay_id}/quick-check")
def quick_check(
    essay_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    from app.tasks import _generate_text

    _require_ai_provider()
    e = _own_essay_or_404(db, current_user.id, essay_id)
    if not (e.body or "").strip():
        raise HTTPException(status_code=400, detail="Essay body is empty.")

    targets = _parse_json_field(e.target_words) or []
    prompt = _quick_check_prompt(e.level, e.prompt, e.body, targets)
    try:
        raw = _generate_text(prompt, max_tokens=700, temperature=0.3)
    except Exception as exc:
        logger.exception("quick_check: AI failed")
        raise HTTPException(status_code=502, detail=f"AI request failed: {type(exc).__name__}: {exc}")
    if not raw:
        raise HTTPException(status_code=502, detail="AI provider returned no text.")

    try:
        data = json.loads(_strip_json_fence(raw))
    except json.JSONDecodeError:
        logger.warning("quick_check: non-JSON: %r", raw[:200])
        raise HTTPException(status_code=502, detail="AI response was not valid JSON.")

    try:
        score = max(0, min(100, int(data.get("score") or 0)))
    except (TypeError, ValueError):
        score = 0

    feedback = {
        "level_estimate": str(data.get("level_estimate") or "").strip(),
        "strengths": [str(s).strip() for s in (data.get("strengths") or []) if str(s).strip()][:5],
        "improvements": [str(s).strip() for s in (data.get("improvements") or []) if str(s).strip()][:5],
        "suggestions": [str(s).strip() for s in (data.get("suggestions") or []) if str(s).strip()][:5],
    }

    e.quick_score = score
    e.quick_feedback = json.dumps(feedback)

    attempt = models.EssayAttempt(
        essay_id=e.id,
        person_id=current_user.id,
        kind="quick",
        score=score,
        level_estimate=feedback["level_estimate"] or None,
        word_count=e.word_count,
        payload=json.dumps(feedback),
    )
    db.add(attempt)

    db.commit()
    db.refresh(e)
    return _serialize(e)


@router.post("/{essay_id}/deep-review")
def deep_review(
    essay_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    from app.tasks import _generate_text

    _require_ai_provider()
    e = _own_essay_or_404(db, current_user.id, essay_id)
    if not (e.body or "").strip():
        raise HTTPException(status_code=400, detail="Essay body is empty.")

    targets = _parse_json_field(e.target_words) or []
    prompt = _deep_review_prompt(e.level, e.prompt, e.body, targets)
    try:
        raw = _generate_text(prompt, max_tokens=2200, temperature=0.3)
    except Exception as exc:
        logger.exception("deep_review: AI failed")
        raise HTTPException(status_code=502, detail=f"AI request failed: {type(exc).__name__}: {exc}")
    if not raw:
        raise HTTPException(status_code=502, detail="AI provider returned no text.")

    try:
        data = json.loads(_strip_json_fence(raw))
    except json.JSONDecodeError:
        logger.warning("deep_review: non-JSON: %r", raw[:300])
        raise HTTPException(status_code=502, detail="AI response was not valid JSON.")

    try:
        score = max(0, min(100, int(data.get("score") or 0)))
    except (TypeError, ValueError):
        score = 0

    criteria_raw = data.get("criteria") or {}
    criteria = {}
    for key, cap in [
        ("task_response", 25),
        ("coherence_cohesion", 25),
        ("vocabulary", 25),
        ("grammar", 25),
    ]:
        try:
            criteria[key] = max(0, min(cap, int(criteria_raw.get(key) or 0)))
        except (TypeError, ValueError):
            criteria[key] = 0

    sentences = []
    for item in (data.get("sentences") or [])[:10]:
        if not isinstance(item, dict):
            continue
        sentences.append({
            "original": str(item.get("original") or "").strip(),
            "issue": str(item.get("issue") or "").strip().lower(),
            "explanation": str(item.get("explanation") or "").strip(),
            "suggestion": str(item.get("suggestion") or "").strip(),
        })

    upgrades = []
    for item in (data.get("vocabulary_upgrades") or [])[:8]:
        if not isinstance(item, dict):
            continue
        upgrades.append({
            "from": str(item.get("from") or "").strip(),
            "to": str(item.get("to") or "").strip(),
            "why": str(item.get("why") or "").strip(),
        })

    review = {
        "level_estimate": str(data.get("level_estimate") or "").strip(),
        "overall": str(data.get("overall") or "").strip(),
        "criteria": criteria,
        "sentences": sentences,
        "vocabulary_upgrades": upgrades,
    }

    e.deep_score = score
    e.deep_review = json.dumps(review)

    attempt = models.EssayAttempt(
        essay_id=e.id,
        person_id=current_user.id,
        kind="deep",
        score=score,
        level_estimate=review["level_estimate"] or None,
        word_count=e.word_count,
        payload=json.dumps(review),
    )
    db.add(attempt)
    db.flush()  # attempt.id needed for error rows

    error_rows = []
    for s in sentences:
        kind = (s.get("issue") or "").strip().lower() or "clarity"
        kind = kind.replace(" ", "_")
        error_rows.append(models.EssayError(
            attempt_id=attempt.id,
            essay_id=e.id,
            person_id=current_user.id,
            kind=kind,
            original=s.get("original") or None,
            explanation=s.get("explanation") or None,
            suggestion=s.get("suggestion") or None,
            level=e.level,
        ))
    for u in upgrades:
        error_rows.append(models.EssayError(
            attempt_id=attempt.id,
            essay_id=e.id,
            person_id=current_user.id,
            kind="upgrade",
            original=u.get("from") or None,
            explanation=u.get("why") or None,
            suggestion=u.get("to") or None,
            level=e.level,
        ))
    if error_rows:
        db.add_all(error_rows)

    db.commit()
    db.refresh(e)
    return _serialize(e)


# ─── Attempts, errors, stats ─────────────────────────────────────────────────

def _serialize_attempt(a: models.EssayAttempt) -> dict:
    return {
        "id": a.id,
        "essay_id": a.essay_id,
        "kind": a.kind,
        "score": a.score,
        "level_estimate": a.level_estimate,
        "word_count": a.word_count,
        "payload": _parse_json_field(a.payload),
        "created_at": a.created_at,
    }


def _serialize_error(err: models.EssayError) -> dict:
    return {
        "id": err.id,
        "attempt_id": err.attempt_id,
        "essay_id": err.essay_id,
        "kind": err.kind,
        "original": err.original,
        "explanation": err.explanation,
        "suggestion": err.suggestion,
        "level": err.level,
        "created_at": err.created_at,
    }


@router.get("/{essay_id}/attempts")
def list_attempts(
    essay_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    _own_essay_or_404(db, current_user.id, essay_id)
    rows = (
        db.query(models.EssayAttempt)
        .filter(
            models.EssayAttempt.essay_id == essay_id,
            models.EssayAttempt.person_id == current_user.id,
        )
        .order_by(models.EssayAttempt.created_at.asc())
        .all()
    )
    return [_serialize_attempt(r) for r in rows]


@router.get("/errors/list")
def list_errors(
    kind: Optional[str] = Query(None),
    level: Optional[str] = Query(None),
    essay_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    q = db.query(models.EssayError).filter(models.EssayError.person_id == current_user.id)
    if kind:
        q = q.filter(models.EssayError.kind == kind)
    if level:
        q = q.filter(models.EssayError.level == level)
    if essay_id is not None:
        q = q.filter(models.EssayError.essay_id == essay_id)
    rows = q.order_by(desc(models.EssayError.created_at)).limit(limit).all()
    return [_serialize_error(r) for r in rows]


@router.get("/stats/overview")
def stats_overview(
    days: int = Query(60, ge=7, le=365),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    from sqlalchemy import func as sqlfunc
    from datetime import timedelta

    since = datetime.utcnow() - timedelta(days=days)
    user_id = current_user.id

    # Essay totals
    total_essays = db.query(sqlfunc.count(models.Essay.id)).filter(
        models.Essay.person_id == user_id,
        models.Essay.deleted == False,
    ).scalar() or 0

    total_attempts = db.query(sqlfunc.count(models.EssayAttempt.id)).filter(
        models.EssayAttempt.person_id == user_id,
    ).scalar() or 0

    # Score timeline (most recent essay's latest score per essay, plus all attempts)
    attempts = (
        db.query(models.EssayAttempt)
        .filter(
            models.EssayAttempt.person_id == user_id,
            models.EssayAttempt.created_at >= since,
        )
        .order_by(models.EssayAttempt.created_at.asc())
        .all()
    )
    timeline = [
        {
            "id": a.id,
            "essay_id": a.essay_id,
            "kind": a.kind,
            "score": a.score,
            "created_at": a.created_at,
        }
        for a in attempts
    ]

    # Averages
    quick_scores = [a.score for a in attempts if a.kind == "quick"]
    deep_scores = [a.score for a in attempts if a.kind == "deep"]
    avg_quick = round(sum(quick_scores) / len(quick_scores)) if quick_scores else None
    avg_deep = round(sum(deep_scores) / len(deep_scores)) if deep_scores else None

    # By-level averages (use deep when available, else quick — per essay)
    level_rows = (
        db.query(models.Essay.level, models.Essay.deep_score, models.Essay.quick_score)
        .filter(
            models.Essay.person_id == user_id,
            models.Essay.deleted == False,
        )
        .all()
    )
    by_level: dict[str, dict] = {}
    for level_val, deep, quick in level_rows:
        score = deep if deep is not None else quick
        if score is None:
            continue
        entry = by_level.setdefault(level_val or "B1", {"count": 0, "sum": 0})
        entry["count"] += 1
        entry["sum"] += score
    by_level_avg = {
        lvl: {"avg": round(v["sum"] / v["count"]), "count": v["count"]}
        for lvl, v in by_level.items()
    }

    # Error counts by kind
    error_counts_rows = (
        db.query(models.EssayError.kind, sqlfunc.count(models.EssayError.id))
        .filter(
            models.EssayError.person_id == user_id,
            models.EssayError.created_at >= since,
        )
        .group_by(models.EssayError.kind)
        .all()
    )
    error_counts = {kind: count for kind, count in error_counts_rows}

    # Recent essays (id + meta only)
    recent_essays = (
        db.query(models.Essay)
        .filter(
            models.Essay.person_id == user_id,
            models.Essay.deleted == False,
        )
        .order_by(desc(models.Essay.updated_at), desc(models.Essay.created_at))
        .limit(5)
        .all()
    )
    recent = [
        {
            "id": e.id,
            "title": e.title,
            "prompt": e.prompt[:120],
            "level": e.level,
            "status": e.status,
            "score": e.deep_score if e.deep_score is not None else e.quick_score,
            "updated_at": e.updated_at,
        }
        for e in recent_essays
    ]

    return {
        "days": days,
        "total_essays": total_essays,
        "total_attempts": total_attempts,
        "avg_quick": avg_quick,
        "avg_deep": avg_deep,
        "timeline": timeline,
        "by_level_avg": by_level_avg,
        "error_counts": error_counts,
        "recent_essays": recent,
    }
