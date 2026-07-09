import json
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, desc, func as sqlfunc
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user
from app.services.essays_helpers import (
    ALLOWED_LEVELS,
    DEFAULT_WORD_COUNT_BY_LEVEL,
    DRILL_SR_LADDER_DAYS,
    _count_words,
    _find_duplicate_essay,
    _format_plan_for_ai,
    _load_plan,
    _next_drill_interval_days,
    _own_essay_or_404,
    _parse_json_field,
    _pick_target_words,
    _prompt_topic_prompt,
    _quick_check_prompt,
    _deep_review_prompt,
    _require_ai_provider,
    _serialize,
    _serialize_attempt,
    _serialize_error,
    _serialize_plan,
    _strip_json_fence,
    _summarize_existing_essays,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/essays", tags=["essays"])


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

    existing_topics = _summarize_existing_essays(db, current_user.id, limit=25)

    generated_prompt = ""
    generated_title: Optional[str] = None
    duplicate: Optional[models.Essay] = None
    attempts = 0
    max_attempts = 3
    last_error: Optional[str] = None

    while attempts < max_attempts:
        attempts += 1
        prompt_text = _prompt_topic_prompt(
            level,
            payload.topic_hint,
            target_words,
            word_count,
            existing_topics=existing_topics,
        )
        try:
            raw = _generate_text(prompt_text, max_tokens=400, temperature=0.7 + 0.1 * (attempts - 1))
        except Exception as e:
            logger.exception("generate_prompt: AI failed")
            raise HTTPException(status_code=502, detail=f"AI request failed: {type(e).__name__}: {e}")

        if not raw:
            last_error = "AI provider returned no text."
            continue

        try:
            data = json.loads(_strip_json_fence(raw))
        except json.JSONDecodeError:
            logger.warning("generate_prompt: non-JSON response: %r", raw[:200])
            last_error = "AI response was not valid JSON."
            continue

        candidate_prompt = str(data.get("prompt") or "").strip()
        candidate_title = (str(data.get("title") or "").strip() or None)
        if not candidate_prompt:
            last_error = "AI returned an empty prompt."
            continue

        duplicate = _find_duplicate_essay(db, current_user.id, candidate_prompt, candidate_title)
        generated_prompt = candidate_prompt
        generated_title = candidate_title

        if duplicate is None:
            break

        dup_label = (duplicate.title or "").strip() or duplicate.prompt[:120]
        if dup_label and dup_label not in existing_topics:
            existing_topics.append(dup_label)

    if not generated_prompt:
        raise HTTPException(
            status_code=502,
            detail=last_error or "AI provider failed to produce a usable prompt.",
        )

    response: dict = {
        "prompt": generated_prompt,
        "title": generated_title,
        "suggested_word_count": word_count,
        "target_words": target_words,
        "level": level,
        "existing_essay": None,
    }
    if duplicate is not None:
        response["existing_essay"] = {
            "id": duplicate.id,
            "title": duplicate.title,
            "prompt": duplicate.prompt,
            "level": duplicate.level,
            "status": duplicate.status,
        }
    return response


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
    prompt = payload.prompt.strip()

    duplicate = _find_duplicate_essay(db, current_user.id, prompt, payload.title)
    if duplicate is not None:
        return _serialize(duplicate)

    e = models.Essay(
        person_id=current_user.id,
        title=payload.title,
        prompt=prompt,
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
    plan = _load_plan(db, current_user.id, e.id)
    plan_text = _format_plan_for_ai(plan)
    prompt = _deep_review_prompt(e.level, e.prompt, e.body, targets, plan_text=plan_text)
    try:
        raw = _generate_text(prompt, max_tokens=2400, temperature=0.3)
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

    structure_coverage = None
    if plan_text:
        sc_raw = data.get("structure_coverage") or {}
        if isinstance(sc_raw, dict):
            bodies_raw = sc_raw.get("bodies") or []
            bodies: list[dict] = []
            if isinstance(bodies_raw, list):
                for item in bodies_raw[:10]:
                    if not isinstance(item, dict):
                        continue
                    bodies.append({
                        "label": str(item.get("label") or "").strip() or None,
                        "claim_covered": bool(item.get("claim_covered")),
                        "what_kind_covered": bool(item.get("what_kind_covered")),
                        "so_what_covered": bool(item.get("so_what_covered")),
                        "what_if_covered": bool(item.get("what_if_covered")),
                        "notes": str(item.get("notes") or "").strip(),
                    })
            try:
                overall_score = max(0, min(25, int(sc_raw.get("overall_score") or 0)))
            except (TypeError, ValueError):
                overall_score = 0
            structure_coverage = {
                "overall_score": overall_score,
                "thesis_present": bool(sc_raw.get("thesis_present")),
                "conclusion_present": bool(sc_raw.get("conclusion_present")),
                "bodies": bodies,
                "summary": str(sc_raw.get("summary") or "").strip(),
            }

    review = {
        "level_estimate": str(data.get("level_estimate") or "").strip(),
        "overall": str(data.get("overall") or "").strip(),
        "criteria": criteria,
        "sentences": sentences,
        "vocabulary_upgrades": upgrades,
        "structure_coverage": structure_coverage,
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
    db.flush()

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


# ─── Plan (outline) ──────────────────────────────────────────────────────────

@router.get("/{essay_id}/plan")
def get_plan(
    essay_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    _own_essay_or_404(db, current_user.id, essay_id)
    plan = _load_plan(db, current_user.id, essay_id)
    return _serialize_plan(plan, essay_id)


@router.put("/{essay_id}/plan")
def upsert_plan(
    essay_id: int,
    payload: schemas.EssayPlanWrite,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    _own_essay_or_404(db, current_user.id, essay_id)
    plan = _load_plan(db, current_user.id, essay_id)

    body_plans_raw = [b.model_dump() for b in payload.body_plans]
    body_plans_clean = [
        b for b in body_plans_raw
        if any((b.get(k) or "").strip() for k in ("claim", "what_kind", "so_what", "what_if", "label"))
    ]

    thesis = (payload.thesis or "").strip() or None
    conclusion = (payload.conclusion_plan or "").strip() or None

    if plan is None:
        plan = models.EssayPlan(
            essay_id=essay_id,
            person_id=current_user.id,
            thesis=thesis,
            body_plans=json.dumps(body_plans_clean) if body_plans_clean else None,
            conclusion_plan=conclusion,
        )
        db.add(plan)
    else:
        plan.thesis = thesis
        plan.body_plans = json.dumps(body_plans_clean) if body_plans_clean else None
        plan.conclusion_plan = conclusion

    db.commit()
    db.refresh(plan)
    return _serialize_plan(plan, essay_id)


# ─── Attempts, errors, stats ─────────────────────────────────────────────────

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


@router.get("/errors/drills/due")
def list_drill_due(
    kind: Optional[str] = Query(None),
    level: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    now = datetime.utcnow()
    q = db.query(models.EssayError).filter(
        models.EssayError.person_id == current_user.id,
        models.EssayError.archived == False,
        or_(
            models.EssayError.next_review_at.is_(None),
            models.EssayError.next_review_at <= now,
        ),
    )
    if kind:
        q = q.filter(models.EssayError.kind == kind)
    if level:
        q = q.filter(models.EssayError.level == level)
    rows = q.order_by(
        models.EssayError.next_review_at.is_(None).desc(),
        models.EssayError.next_review_at.asc().nulls_first(),
        models.EssayError.created_at.asc(),
    ).limit(limit).all()
    return [_serialize_error(r) for r in rows]


@router.get("/errors/drills/summary")
def drill_summary(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    now = datetime.utcnow()
    user_id = current_user.id

    base = db.query(models.EssayError).filter(
        models.EssayError.person_id == user_id,
        models.EssayError.archived == False,
    )

    total = base.with_entities(sqlfunc.count(models.EssayError.id)).scalar() or 0
    due = base.filter(
        or_(
            models.EssayError.next_review_at.is_(None),
            models.EssayError.next_review_at <= now,
        ),
    ).with_entities(sqlfunc.count(models.EssayError.id)).scalar() or 0
    learned = base.filter(
        models.EssayError.review_count > 0,
        models.EssayError.interval_days >= 7,
    ).with_entities(sqlfunc.count(models.EssayError.id)).scalar() or 0

    by_kind_rows = (
        base.with_entities(models.EssayError.kind, sqlfunc.count(models.EssayError.id))
        .group_by(models.EssayError.kind)
        .all()
    )
    by_kind = {k: c for k, c in by_kind_rows}

    return {"total": total, "due": due, "learned": learned, "by_kind": by_kind}


@router.post("/errors/{error_id}/review")
def review_drill(
    error_id: int,
    payload: schemas.EssayErrorReview,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    from datetime import timedelta

    err = (
        db.query(models.EssayError)
        .filter(
            models.EssayError.id == error_id,
            models.EssayError.person_id == current_user.id,
        )
        .first()
    )
    if err is None:
        raise HTTPException(status_code=404, detail="Drill card not found.")

    was_correct = bool(payload.correct)
    now = datetime.utcnow()
    next_days = _next_drill_interval_days(err.interval_days or 0, was_correct)
    err.interval_days = next_days
    err.last_reviewed_at = now
    err.next_review_at = now + timedelta(days=next_days)
    err.review_count = (err.review_count or 0) + 1
    if was_correct:
        err.correct_count = (err.correct_count or 0) + 1

    db.commit()
    db.refresh(err)
    return _serialize_error(err)


@router.post("/errors/{error_id}/archive")
def archive_drill(
    error_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    err = (
        db.query(models.EssayError)
        .filter(
            models.EssayError.id == error_id,
            models.EssayError.person_id == current_user.id,
        )
        .first()
    )
    if err is None:
        raise HTTPException(status_code=404, detail="Drill card not found.")
    err.archived = True
    db.commit()
    return {"ok": True, "id": err.id}


@router.get("/stats/overview")
def stats_overview(
    days: int = Query(60, ge=7, le=365),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    from datetime import timedelta

    since = datetime.utcnow() - timedelta(days=days)
    user_id = current_user.id

    total_essays = db.query(sqlfunc.count(models.Essay.id)).filter(
        models.Essay.person_id == user_id,
        models.Essay.deleted == False,
    ).scalar() or 0

    total_attempts = db.query(sqlfunc.count(models.EssayAttempt.id)).filter(
        models.EssayAttempt.person_id == user_id,
    ).scalar() or 0

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

    quick_scores = [a.score for a in attempts if a.kind == "quick"]
    deep_scores = [a.score for a in attempts if a.kind == "deep"]
    avg_quick = round(sum(quick_scores) / len(quick_scores)) if quick_scores else None
    avg_deep = round(sum(deep_scores) / len(deep_scores)) if deep_scores else None

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
