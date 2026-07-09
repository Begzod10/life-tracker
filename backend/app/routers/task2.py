"""IELTS Task 2 essay exercise router.

Parallel subsystem to exercises.py — own models (EssaySession, Task2Attempt),
own grader, no SRS scheduling.  Same Groq client pattern throughout.
"""
from __future__ import annotations

import json
import logging
import os
import random as _random
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
    compute_band_trends,
    derive_essay_focus,
    get_assigned_position,
    get_drill_instruction,
    pick_essay_type,
    pick_question,
    round_to_half_band,
)
from app.services.grammar_grading import parse_grading_response
from app.services.srs_update import (
    apply_error,
    apply_drill_result,
    build_drill_queue,
    priority_score,
)
from app.services.task2_helpers import (
    _GP_CATALOG,
    _ERROR_HUNT_SENTENCES,
    _coerce_essay_grade,
    _db_to_state,
    _get_or_create_grammar_point,
    _grade_essay_via_openai,
    _run_grammar_extraction,
    _state_to_db,
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



# ─── GET /grammar/error-hunt ─────────────────────────────────────────────────

@router.get("/grammar/error-hunt")
def get_error_hunt(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Return a sentence with an injected grammar error for the user to find and correct."""
    _require_enabled()

    from app.services.exercise_types import _inject_error  # lazy-safe re-import

    now = datetime.now(timezone.utc)

    # Pick grammar point by SRS priority
    rows = (
        db.query(models.UserGrammarPoint)
        .filter(models.UserGrammarPoint.person_id == current_user.id)
        .all()
    )

    category_id: Optional[str] = None
    if rows:
        states = [_db_to_state(r) for r in rows]
        queue = build_drill_queue(states, limit=1, now=now)
        if queue:
            category_id = queue[0].grammar_point_id

    # Fall back to a random category from the sentence bank
    if category_id is None or category_id not in _ERROR_HUNT_SENTENCES:
        category_id = _random.choice(list(_ERROR_HUNT_SENTENCES.keys()))

    sentences = _ERROR_HUNT_SENTENCES[category_id]
    correct_sentence = _random.choice(sentences)

    # Try to inject an error; if it fails, try another sentence
    errored_sentence: Optional[str] = None
    for _ in range(len(sentences)):
        candidate = _random.choice(sentences)
        result = _inject_error(candidate, position=_random.randint(0, 4), category=category_id)
        if result and result != candidate:
            correct_sentence = candidate
            errored_sentence = result
            break

    if errored_sentence is None:
        raise HTTPException(status_code=503, detail="Could not generate error for this grammar point. Try again.")

    gp = _GP_CATALOG.get(category_id, {})

    return {
        "grammar_point_id": category_id,
        "grammar_point_name": gp.get("name", category_id.replace("_", " ").title()),
        "rule": gp.get("rule", ""),
        "errored_sentence": errored_sentence,
        "correct_sentence": correct_sentence,
    }


# ─── POST /grammar/error-hunt/grade ─────────────────────────────────────────

class ErrorHuntGradeIn(BaseModel):
    grammar_point_id: str
    correct_sentence: str
    student_response: str


@router.post("/grammar/error-hunt/grade")
def grade_error_hunt(
    body: ErrorHuntGradeIn,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Grade an error-hunt response and update grammar SRS."""
    _require_enabled()

    correct_normalized = body.correct_sentence.strip().lower()
    student_normalized = body.student_response.strip().lower()
    is_correct = correct_normalized == student_normalized

    now = datetime.now(timezone.utc)

    row = _get_or_create_grammar_point(db, current_user.id, body.grammar_point_id)
    state = _db_to_state(row)

    if is_correct:
        apply_drill_result(state, correct=True, now=now)
    else:
        apply_error(state, severity="major", count=1, now=now)

    _state_to_db(row, state)
    try:
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("Error-hunt SRS update failed (non-fatal): %s", exc)

    gp = _GP_CATALOG.get(body.grammar_point_id, {})

    return {
        "is_correct": is_correct,
        "correct_sentence": body.correct_sentence,
        "grammar_point_id": body.grammar_point_id,
        "grammar_point_name": gp.get("name", body.grammar_point_id.replace("_", " ").title()),
        "rule": gp.get("rule", ""),
    }
