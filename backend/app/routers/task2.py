"""IELTS Task 2 essay exercise router.

Parallel subsystem to exercises.py — own models (EssaySession, Task2Attempt),
own grader, no SRS scheduling.  Same Groq client pattern throughout.
"""
from __future__ import annotations

import json
import logging
import re
from collections import Counter
from datetime import datetime, timezone
from typing import List, Optional

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
from app.services.grammar_grading import (
    SYSTEM_PROMPT as GRAMMAR_SYSTEM_PROMPT,
    build_user_prompt as build_grammar_prompt,
    parse_grading_response,
)
from app.services.srs_update import (
    GrammarPointState,
    apply_error,
    build_drill_queue,
    priority_score,
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

async def _call_openai_json(system_prompt: str, user_prompt: str, max_tokens: int = 900) -> dict:
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
    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=max_tokens,
            temperature=0.2,
            response_format={"type": "json_object"},
        )
    except AuthenticationError as exc:
        logger.error("OpenAI auth failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"OpenAI auth failed: {exc}") from exc
    except RateLimitError as exc:
        logger.error("OpenAI rate-limited: %s", exc)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail=f"OpenAI rate-limited: {exc}") from exc
    except APIConnectionError as exc:
        logger.error("OpenAI unreachable: %s", exc)
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                            detail=f"OpenAI unreachable: {exc}") from exc
    except APIError as exc:
        logger.error("OpenAI API error: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"OpenAI API error: {exc}") from exc

    if not response.choices:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail="OpenAI returned no choices.")
    choice = response.choices[0]
    raw = choice.message.content
    if not raw:
        finish = getattr(choice, "finish_reason", "unknown")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"OpenAI returned empty content (finish_reason={finish}).")
    raw = raw.strip()
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        finish = getattr(choice, "finish_reason", "unknown")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"OpenAI invalid JSON (finish_reason={finish}): {raw[:200]}")

    if not isinstance(data, dict):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail="OpenAI response was not a JSON object.")
    return data


async def _grade_essay_via_openai(payload: dict) -> dict:
    return await _call_openai_json(
        system_prompt=_ESSAY_GRADER_SYSTEM,
        user_prompt=_essay_grader_prompt(payload),
        max_tokens=max(900, 250 + 250 * 1),
    )


# ─── Grammar SRS helpers ─────────────────────────────────────────────────────

def _db_to_state(row: models.UserGrammarPoint) -> GrammarPointState:
    return GrammarPointState(
        grammar_point_id=row.grammar_point_id,
        reps=row.reps,
        ease=row.ease,
        interval_days=row.interval_days,
        lapses=row.lapses,
        correct_count=row.correct_count,
        review_count=row.review_count,
        last_seen_at=row.last_seen_at,
        next_review_at=row.next_review_at,
    )


def _state_to_db(row: models.UserGrammarPoint, state: GrammarPointState) -> None:
    row.reps = state.reps
    row.ease = state.ease
    row.interval_days = state.interval_days
    row.lapses = state.lapses
    row.correct_count = state.correct_count
    row.review_count = state.review_count
    row.last_seen_at = state.last_seen_at
    row.next_review_at = state.next_review_at


def _get_or_create_grammar_point(
    db: Session, person_id: int, grammar_point_id: str
) -> models.UserGrammarPoint:
    row = (
        db.query(models.UserGrammarPoint)
        .filter_by(person_id=person_id, grammar_point_id=grammar_point_id)
        .first()
    )
    if row is None:
        row = models.UserGrammarPoint(
            person_id=person_id,
            grammar_point_id=grammar_point_id,
        )
        db.add(row)
    return row


async def _run_grammar_extraction(essay_text: str, essay_type: str) -> dict:
    """Call OpenAI to extract grammar errors from an essay. Returns raw parsed dict."""
    prompt = build_grammar_prompt(student_answer=essay_text, exercise_type=essay_type)
    return await _call_openai_json(
        system_prompt=GRAMMAR_SYSTEM_PROMPT,
        user_prompt=prompt,
        max_tokens=700,
    )


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

    import asyncio
    raw_grade, raw_grammar = await asyncio.gather(
        _grade_essay_via_openai(payload),
        _run_grammar_extraction(response_text, session.essay_type),
    )
    grade = _coerce_essay_grade(raw_grade, session.target_band)

    # Parse grammar errors (silently ignore failures — grading is primary)
    grammar_errors_found: List[dict] = []
    try:
        grammar_result = parse_grading_response(json.dumps(raw_grammar))
        grammar_errors_found = [e.model_dump() for e in grammar_result.errors]
    except Exception as exc:
        logger.warning("Grammar extraction failed (non-fatal): %s", exc)

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

    # Update grammar point SRS states (best-effort; don't fail the response)
    if grammar_errors_found:
        try:
            counts: Counter = Counter(e["category"] for e in grammar_errors_found)
            severity_by_cat: dict = {}
            for e in grammar_errors_found:
                if e["severity"] == "major":
                    severity_by_cat[e["category"]] = "major"
                else:
                    severity_by_cat.setdefault(e["category"], "minor")

            for category, count in counts.items():
                row = _get_or_create_grammar_point(db, current_user.id, category)
                state = _db_to_state(row)
                apply_error(state, severity=severity_by_cat.get(category, "major"), count=count, now=now)
                _state_to_db(row, state)

            db.commit()
        except Exception as exc:
            db.rollback()
            logger.warning("Grammar SRS update failed (non-fatal): %s", exc)

    return {
        "attempt_id": attempt.id,
        "criteria_scores": grade["criteria_scores"],
        "overall_band": grade["overall_band"],
        "is_correct": grade["is_correct"],
        "essay_errors": grade["essay_errors"],
        "feedback": grade["feedback"],
        "model_revision": grade["model_revision"],
        "word_count": word_count,
        "grammar_errors": grammar_errors_found,
    }


# ─── GET /grammar/drill-queue ────────────────────────────────────────────────

@router.get("/grammar/drill-queue")
def get_grammar_drill_queue(
    limit: int = Query(10, ge=1, le=20),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Return the top grammar points to drill next, ordered by SRS priority."""
    _require_enabled()

    rows = (
        db.query(models.UserGrammarPoint)
        .filter(models.UserGrammarPoint.person_id == current_user.id)
        .all()
    )
    if not rows:
        return {"drill_queue": []}

    states = [_db_to_state(r) for r in rows]
    now = datetime.now(timezone.utc)
    queue = build_drill_queue(states, limit=limit, now=now)

    return {
        "drill_queue": [
            {
                "grammar_point_id": s.grammar_point_id,
                "priority": priority_score(s, now),
                "mastery": s.mastery,
                "lapses": s.lapses,
                "next_review_at": s.next_review_at.isoformat() if s.next_review_at else None,
            }
            for s in queue
        ]
    }


# ─── GET /grammar/points ─────────────────────────────────────────────────────

@router.get("/grammar/points")
def get_grammar_points(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Return all grammar points enriched with the user's current SRS state."""
    import json as _json
    import os

    _require_enabled()

    catalog_path = os.path.join(os.path.dirname(__file__), "..", "assets", "grammar_points.json")
    with open(catalog_path, encoding="utf-8") as f:
        catalog = _json.load(f)

    rows = (
        db.query(models.UserGrammarPoint)
        .filter(models.UserGrammarPoint.person_id == current_user.id)
        .all()
    )
    state_map = {r.grammar_point_id: _db_to_state(r) for r in rows}
    now = datetime.now(timezone.utc)

    result = []
    for point in catalog:
        state = state_map.get(point["id"])
        result.append({
            **point,
            "mastery": state.mastery if state else 0.0,
            "lapses": state.lapses if state else 0,
            "priority": priority_score(state, now) if state else 0.0,
            "next_review_at": (
                state.next_review_at.isoformat() if state and state.next_review_at else None
            ),
        })

    return {"points": result}


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
