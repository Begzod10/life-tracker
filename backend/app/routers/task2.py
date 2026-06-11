"""IELTS Task 2 essay exercise router.

Parallel subsystem to exercises.py — own models (EssaySession, Task2Attempt),
own grader, no SRS scheduling.  Same Groq client pattern throughout.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.services.essay_service import (
    VALID_ESSAY_ERRORS,
    compute_band_trends,
    derive_essay_focus,
    get_assigned_position,
    get_drill_instruction,
    pick_essay_type,
    pick_question,
    round_to_half_band,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/essays/task2",
    tags=["essays-task2"],
)

# ─── Guard ────────────────────────────────────────────────────────────────────

def _require_enabled() -> None:
    if not settings.IELTS_ESSAY_ENABLED:
        raise HTTPException(status_code=404, detail="Task 2 essay feature is disabled.")


# ─── IELTS grader prompt ─────────────────────────────────────────────────────

_ESSAY_GRADER_SYSTEM = """\
You are an expert IELTS Writing Task 2 examiner. Grade candidate essays strictly \
according to the four official IELTS criteria:

1. **Task Response (TR)** — Does the essay fully address all parts of the task? \
Is the position clear and supported?
2. **Coherence and Cohesion (CC)** — Is the essay logically organised? Is cohesive \
language used accurately and not mechanically?
3. **Lexical Resource (LR)** — Is the vocabulary range appropriate? Are words used \
with precision and natural collocation?
4. **Grammatical Range and Accuracy (GRA)** — Is sentence structure varied? \
Are grammatical errors infrequent?

Score each criterion on the IELTS 9-band scale in increments of 0.5 \
(e.g. 5.0, 5.5, 6.0, 6.5 … 9.0). \
Round the mean of the four criteria to the nearest 0.5 for overall_band.

Return ONLY valid JSON with this exact shape:
{
  "task_response": <float 1-9>,
  "coherence_cohesion": <float 1-9>,
  "lexical_resource": <float 1-9>,
  "grammatical_range_accuracy": <float 1-9>,
  "overall_band": <float 1-9>,
  "is_correct": <true if overall_band >= target_band else false>,
  "essay_errors": [<up to 5 error keys from the allowed set>],
  "feedback": "<2-3 sentences: one strength, one main weakness, one concrete suggestion>",
  "model_revision": "<revised version of the opening sentence ONLY, showing better range/accuracy. Omit if band 8+>"
}

Allowed essay_error keys (return ONLY keys from this list, or an empty array):
no_clear_position, doesnt_address_all_parts, underdeveloped_idea, missing_topic_sentence,
weak_cohesion, paragraphing_issue, no_referencing, overgeneralization, repetitive_vocabulary,
informal_register, template_overuse, weak_conclusion, irrelevant_content, off_topic
"""


def _essay_grader_prompt(payload: dict) -> str:
    question = payload["question"]
    question_type = payload["question_type"]
    essay_type = payload["essay_type"]
    assigned_position = payload.get("assigned_position")
    target_band = payload.get("target_band", 7.0)
    response = payload["response"]
    word_count = payload.get("word_count", 0)
    drill_instruction = payload.get("drill_instruction")

    lines = [
        f"QUESTION TYPE: {question_type}",
        f"ESSAY TYPE: {essay_type}",
        f"TARGET BAND: {target_band}",
        "",
        f"TASK QUESTION:\n{question}",
    ]
    if assigned_position:
        lines += ["", f"ASSIGNED POSITION: {assigned_position}"]
    if drill_instruction:
        lines += ["", f"DRILL FOCUS: {drill_instruction}"]
    lines += [
        "",
        f"CANDIDATE RESPONSE ({word_count} words):",
        response,
    ]
    return "\n".join(lines)


# ─── _coerce_essay_grade ─────────────────────────────────────────────────────

def _coerce_essay_grade(raw: dict, target_band: float) -> dict:
    def _clamp_band(val) -> Optional[float]:
        if val is None:
            return None
        try:
            f = float(val)
        except (TypeError, ValueError):
            return None
        # Snap to valid 0.5 increments in [1, 9]
        f = max(1.0, min(9.0, round(f * 2) / 2))
        return f

    tr  = _clamp_band(raw.get("task_response"))
    cc  = _clamp_band(raw.get("coherence_cohesion"))
    lr  = _clamp_band(raw.get("lexical_resource"))
    gra = _clamp_band(raw.get("grammatical_range_accuracy"))

    filled = [x for x in [tr, cc, lr, gra] if x is not None]
    if filled:
        computed = round_to_half_band(sum(filled) / len(filled))
    else:
        computed = None

    overall = _clamp_band(raw.get("overall_band")) or computed

    is_correct = bool(overall is not None and overall >= target_band)

    feedback = (raw.get("feedback") or "").strip() or None
    revision = raw.get("model_revision")
    revision = revision.strip() if isinstance(revision, str) and revision.strip() else None

    raw_errors = raw.get("essay_errors")
    essay_errors: Optional[list[str]] = None
    if isinstance(raw_errors, list):
        essay_errors = [e for e in raw_errors if isinstance(e, str) and e in VALID_ESSAY_ERRORS] or None

    criteria_scores = {
        "task_response": tr,
        "coherence_cohesion": cc,
        "lexical_resource": lr,
        "grammatical_range_accuracy": gra,
    }

    return {
        "criteria_scores": criteria_scores,
        "overall_band": overall,
        "is_correct": is_correct,
        "essay_errors": essay_errors,
        "feedback": feedback,
        "model_revision": revision,
    }


# ─── _grade_essay_via_openai ─────────────────────────────────────────────────

async def _grade_essay_via_openai(payload: dict) -> dict:
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
    max_tokens = max(900, 250 + 250 * 1)   # single essay; scale same as exercises.py
    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": _ESSAY_GRADER_SYSTEM},
                {"role": "user", "content": _essay_grader_prompt(payload)},
            ],
            max_tokens=max_tokens,
            temperature=0.2,
            response_format={"type": "json_object"},
        )
    except AuthenticationError as exc:
        logger.error("Essay grader auth failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"Essay grader auth failed: {exc}") from exc
    except RateLimitError as exc:
        logger.error("Essay grader rate-limited: %s", exc)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail=f"Essay grader rate-limited: {exc}") from exc
    except APIConnectionError as exc:
        logger.error("Essay grader unreachable: %s", exc)
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                            detail=f"Essay grader unreachable: {exc}") from exc
    except APIError as exc:
        logger.error("Essay grader API error: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"Essay grader API error: {exc}") from exc

    if not response.choices:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail="Essay grader returned no choices.")
    choice = response.choices[0]
    raw = choice.message.content
    if not raw:
        finish = getattr(choice, "finish_reason", "unknown")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"Essay grader returned empty content (finish_reason={finish}).")
    raw = raw.strip()
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        finish = getattr(choice, "finish_reason", "unknown")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"Essay grader invalid JSON (finish_reason={finish}): {raw[:200]}")

    if not isinstance(data, dict):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail="Essay grader response was not a JSON object.")
    return data


# ─── Request / Response schemas ──────────────────────────────────────────────

class StartRequest(BaseModel):
    target_band: float = 7.0


class GradeRequest(BaseModel):
    session_id: int
    response: str
    time_seconds: Optional[int] = None


# ─── POST /start ─────────────────────────────────────────────────────────────

@router.post("/start")
async def start_task2_session(
    body: StartRequest,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    _require_enabled()

    # Derive essay focus from last 30 Task2Attempts
    recent_attempts = (
        db.query(models.Task2Attempt)
        .filter(models.Task2Attempt.person_id == current_user.id)
        .order_by(models.Task2Attempt.created_at.desc())
        .limit(30)
        .all()
    )
    essay_focus = derive_essay_focus(recent_attempts)
    recent_bands: list[float] = [
        a.overall_band for a in recent_attempts if a.overall_band is not None
    ][:10]

    essay_type = pick_essay_type(essay_focus, recent_bands, body.target_band)

    # Avoid repeating questions recently used
    recent_sessions = (
        db.query(models.EssaySession)
        .filter(models.EssaySession.person_id == current_user.id)
        .order_by(models.EssaySession.started_at.desc())
        .limit(20)
        .all()
    )
    recent_seq_ids = [
        (s.question_payload or {}).get("question_seq_id")
        for s in recent_sessions
        if s.question_payload and s.question_payload.get("question_seq_id")
    ]
    question_entry = pick_question(recent_seq_ids)

    assigned_position: Optional[str] = None
    if essay_type == "essay_paragraph":
        assigned_position = get_assigned_position(question_entry["question_type"])
    drill_instruction = get_drill_instruction(essay_focus) if essay_type == "essay_paragraph" else None

    question_payload = {
        "question": question_entry["question"],
        "question_type": question_entry["question_type"],
        "topic_domain": question_entry.get("topic_domain"),
        "question_seq_id": question_entry["seq_id"],
        "assigned_position": assigned_position,
        "drill_instruction": drill_instruction,
        "essay_focus_snapshot": essay_focus,
    }

    session = models.EssaySession(
        person_id=current_user.id,
        mode="essay",
        essay_type=essay_type,
        target_band=body.target_band,
        question_payload=question_payload,
        started_at=datetime.now(timezone.utc),
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    word_limits = {
        "essay_intro": {"min": 40, "max": 60},
        "essay_paragraph": {"min": 80, "max": 120},
        "essay_full": {"min": 250, "max": None},
    }

    return {
        "session_id": session.id,
        "essay_type": essay_type,
        "target_band": body.target_band,
        "question": question_entry["question"],
        "question_type": question_entry["question_type"],
        "topic_domain": question_entry.get("topic_domain"),
        "assigned_position": assigned_position,
        "drill_instruction": drill_instruction,
        "essay_focus": essay_focus,
        "word_limits": word_limits[essay_type],
    }


# ─── POST /grade ─────────────────────────────────────────────────────────────

@router.post("/grade")
async def grade_task2_session(
    body: GradeRequest,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    _require_enabled()

    session = (
        db.query(models.EssaySession)
        .filter(
            models.EssaySession.id == body.session_id,
            models.EssaySession.person_id == current_user.id,
        )
        .first()
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Essay session not found.")
    if session.completed_at is not None:
        raise HTTPException(status_code=409, detail="Essay session already graded.")

    response_text = body.response.strip()
    if not response_text:
        raise HTTPException(status_code=400, detail="Response must not be empty.")

    word_count = len(response_text.split())

    payload = dict(session.question_payload)
    payload["essay_type"] = session.essay_type
    payload["target_band"] = session.target_band
    payload["response"] = response_text
    payload["word_count"] = word_count

    if not settings.OPENAI_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Essay grader not configured (missing API key).",
        )

    raw_grade = await _grade_essay_via_openai(payload)
    grade = _coerce_essay_grade(raw_grade, session.target_band)

    now = datetime.now(timezone.utc)
    attempt = models.Task2Attempt(
        person_id=current_user.id,
        session_id=session.id,
        essay_type=session.essay_type,
        question=payload["question"],
        question_type=payload["question_type"],
        assigned_position=payload.get("assigned_position"),
        target_band=session.target_band,
        response=response_text,
        word_count=word_count,
        time_seconds=body.time_seconds,
        criteria_scores=grade["criteria_scores"],
        overall_band=grade["overall_band"],
        is_correct=grade["is_correct"],
        essay_errors=grade["essay_errors"],
        essay_focus_snapshot=(session.question_payload or {}).get("essay_focus_snapshot"),
        feedback=grade["feedback"],
        model_revision=grade["model_revision"],
        created_at=now,
    )
    try:
        db.add(attempt)
        session.completed_at = now
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.error("Failed to save Task2 attempt: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save grading result.") from exc

    db.refresh(attempt)

    return {
        "attempt_id": attempt.id,
        "criteria_scores": grade["criteria_scores"],
        "overall_band": grade["overall_band"],
        "is_correct": grade["is_correct"],
        "essay_errors": grade["essay_errors"],
        "feedback": grade["feedback"],
        "model_revision": grade["model_revision"],
        "word_count": word_count,
    }


# ─── GET /history ─────────────────────────────────────────────────────────────

@router.get("/history")
def get_task2_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    _require_enabled()

    offset = (page - 1) * limit
    total = (
        db.query(models.Task2Attempt)
        .filter(models.Task2Attempt.person_id == current_user.id)
        .count()
    )
    attempts = (
        db.query(models.Task2Attempt)
        .filter(models.Task2Attempt.person_id == current_user.id)
        .order_by(models.Task2Attempt.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": [
            {
                "id": a.id,
                "essay_type": a.essay_type,
                "question": a.question[:120] + ("…" if len(a.question) > 120 else ""),
                "question_type": a.question_type,
                "overall_band": a.overall_band,
                "criteria_scores": a.criteria_scores,
                "is_correct": a.is_correct,
                "word_count": a.word_count,
                "feedback": a.feedback,
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in attempts
        ],
    }


# ─── GET /analytics ──────────────────────────────────────────────────────────

@router.get("/analytics")
def get_task2_analytics(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    _require_enabled()

    recent = (
        db.query(models.Task2Attempt)
        .filter(models.Task2Attempt.person_id == current_user.id)
        .order_by(models.Task2Attempt.created_at.desc())
        .limit(30)
        .all()
    )

    total_all = (
        db.query(models.Task2Attempt)
        .filter(models.Task2Attempt.person_id == current_user.id)
        .count()
    )

    essay_focus = derive_essay_focus(recent)
    band_trends = compute_band_trends(recent)

    bands = [a.overall_band for a in recent if a.overall_band is not None]
    avg_band = round_to_half_band(sum(bands) / len(bands)) if bands else None

    type_counts: dict[str, int] = {}
    for a in recent:
        type_counts[a.essay_type] = type_counts.get(a.essay_type, 0) + 1

    return {
        "total_attempts": total_all,
        "recent_30": len(recent),
        "avg_band_30": avg_band,
        "essay_focus": essay_focus,
        "band_trends": band_trends,
        "type_distribution": type_counts,
        "recent_bands": [
            {"overall_band": a.overall_band, "created_at": a.created_at.isoformat() if a.created_at else None}
            for a in reversed(recent[:10])
        ],
    }
