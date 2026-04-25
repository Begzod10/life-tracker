from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, timedelta
from collections import defaultdict

from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(prefix="/timetable", tags=["timetable"])


@router.get("/", response_model=List[schemas.TimeBlock])
def get_time_blocks(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Get time blocks for current user, optionally filtered by date range."""
    q = db.query(models.TimeBlock).filter(
        models.TimeBlock.person_id == current_user.id,
        models.TimeBlock.deleted == False,
    )
    if date_from:
        q = q.filter(models.TimeBlock.date >= date_from)
    if date_to:
        q = q.filter(models.TimeBlock.date <= date_to)
    return q.order_by(models.TimeBlock.date, models.TimeBlock.start_time).all()


@router.get("/stats")
def get_timetable_stats(
    weeks: int = Query(default=4, ge=1, le=52),
    from_date: Optional[str] = Query(default=None),
    to_date: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Aggregated timetable statistics. Use from_date/to_date for a custom range,
    or weeks to get a symmetric window around today."""
    today = date.today()
    if from_date and to_date:
        try:
            date_from = date.fromisoformat(from_date)
            date_to = date.fromisoformat(to_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
    else:
        date_from = today - timedelta(weeks=weeks)
        date_to = today + timedelta(weeks=weeks)

    blocks = db.query(models.TimeBlock).filter(
        models.TimeBlock.person_id == current_user.id,
        models.TimeBlock.deleted == False,
        models.TimeBlock.date >= date_from,
        models.TimeBlock.date <= date_to,
    ).all()

    def duration_hours(b) -> float:
        def to_min(t) -> int:
            h, m = str(t).split(":")[:2]
            return int(h) * 60 + int(m)
        return max(0, to_min(b.end_time) - to_min(b.start_time)) / 60

    def is_not_finished(b) -> bool:
        """A block is 'not finished' if it's in the past and not completed."""
        return b.date < today and not b.is_completed

    total_blocks = len(blocks)
    completed_blocks = sum(1 for b in blocks if b.is_completed)
    not_finished_blocks = sum(1 for b in blocks if is_not_finished(b))
    total_hours = sum(duration_hours(b) for b in blocks)
    completed_hours = sum(duration_hours(b) for b in blocks if b.is_completed)
    not_finished_hours = sum(duration_hours(b) for b in blocks if is_not_finished(b))

    # By category
    cat_data = defaultdict(lambda: {"count": 0, "hours": 0.0, "completed": 0, "missed": 0})
    for b in blocks:
        cat = b.category or "other"
        cat_data[cat]["count"] += 1
        cat_data[cat]["hours"] += duration_hours(b)
        if b.is_completed:
            cat_data[cat]["completed"] += 1
        if is_not_finished(b):
            cat_data[cat]["missed"] += 1
    by_category = [{"category": k, **v} for k, v in sorted(cat_data.items(), key=lambda x: -x[1]["hours"])]

    # By weekday (0=Mon … 6=Sun)
    DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    wd_data = defaultdict(lambda: {"count": 0, "hours": 0.0, "completed": 0, "missed": 0})
    for b in blocks:
        wd = b.date.weekday()
        wd_data[wd]["count"] += 1
        wd_data[wd]["hours"] += duration_hours(b)
        if b.is_completed:
            wd_data[wd]["completed"] += 1
        if is_not_finished(b):
            wd_data[wd]["missed"] += 1
    by_weekday = [{"weekday": i, "name": DAYS[i], **wd_data[i]} for i in range(7)]

    # By hour (start hour distribution)
    hour_data = defaultdict(int)
    for b in blocks:
        h = int(str(b.start_time).split(":")[0])
        hour_data[h] += 1
    by_hour = [{"hour": h, "count": hour_data[h]} for h in range(6, 24)]

    # Daily summary (all days in range)
    day_data = defaultdict(lambda: {"total": 0, "completed": 0, "missed": 0, "hours": 0.0})
    for b in blocks:
        ds = str(b.date)
        day_data[ds]["total"] += 1
        day_data[ds]["hours"] += duration_hours(b)
        if b.is_completed:
            day_data[ds]["completed"] += 1
        if is_not_finished(b):
            day_data[ds]["missed"] += 1
    daily_summary = [{"date": d, **v} for d, v in sorted(day_data.items())]

    # Streak: consecutive days with at least 1 block up to today
    streak = 0
    check = today
    while True:
        if str(check) in day_data:
            streak += 1
            check -= timedelta(days=1)
        else:
            break

    return {
        "period": {"from": str(date_from), "to": str(date_to)},
        "weeks": weeks,
        "total_blocks": total_blocks,
        "completed_blocks": completed_blocks,
        "missed_blocks": not_finished_blocks,
        "completion_rate": round(completed_blocks / total_blocks * 100, 1) if total_blocks else 0,
        "missed_rate": round(not_finished_blocks / total_blocks * 100, 1) if total_blocks else 0,
        "total_hours": round(total_hours, 1),
        "completed_hours": round(completed_hours, 1),
        "missed_hours": round(not_finished_hours, 1),
        "recurring_count": sum(1 for b in blocks if b.is_recurring),
        "streak_days": streak,
        "by_category": by_category,
        "by_weekday": by_weekday,
        "by_hour": by_hour,
        "daily_summary": daily_summary,
    }


@router.get("/day/{day}", response_model=List[schemas.TimeBlock])
def get_time_blocks_by_day(
    day: date,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Get all time blocks for a specific day."""
    return (
        db.query(models.TimeBlock)
        .filter(
            models.TimeBlock.person_id == current_user.id,
            models.TimeBlock.date == day,
            models.TimeBlock.deleted == False,
        )
        .order_by(models.TimeBlock.start_time)
        .all()
    )


@router.post("/", response_model=schemas.TimeBlock, status_code=status.HTTP_201_CREATED)
def create_time_block(
    block: schemas.TimeBlockCreate,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Create a new time block."""
    if block.start_time >= block.end_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_time must be before end_time",
        )
    new_block = models.TimeBlock(**block.model_dump(by_alias=True), person_id=current_user.id)
    db.add(new_block)
    db.commit()
    db.refresh(new_block)
    return new_block


@router.put("/{block_id}", response_model=schemas.TimeBlock)
def update_time_block(
    block_id: int,
    block: schemas.TimeBlockUpdate,
    propagate: bool = Query(False, description="Propagate category change to all future recurring blocks"),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Update a time block. Pass ?propagate=true to apply category change to all future recurring siblings."""
    db_block = db.query(models.TimeBlock).filter(
        models.TimeBlock.id == block_id,
        models.TimeBlock.person_id == current_user.id,
        models.TimeBlock.deleted == False,
    ).first()
    if not db_block:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time block not found")

    update_data = block.model_dump(exclude_unset=True, by_alias=True)
    start = update_data.get("start_time", db_block.start_time)
    end = update_data.get("end_time", db_block.end_time)
    if start >= end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_time must be before end_time",
        )

    old_category = db_block.category
    for key, value in update_data.items():
        setattr(db_block, key, value)
    db.commit()
    db.refresh(db_block)

    new_category = update_data.get("category")
    if propagate and new_category and new_category != old_category and db_block.is_recurring:
        from app.tasks import propagate_recurring_category
        propagate_recurring_category.delay(block_id, new_category, current_user.id)

    return db_block


@router.delete("/{block_id}", status_code=status.HTTP_200_OK)
def delete_time_block(
    block_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Soft-delete a time block."""
    db_block = db.query(models.TimeBlock).filter(
        models.TimeBlock.id == block_id,
        models.TimeBlock.person_id == current_user.id,
        models.TimeBlock.deleted == False,
    ).first()
    if not db_block:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time block not found")
    db_block.deleted = True
    db.commit()
    return {"message": "Time block deleted"}


@router.patch("/{block_id}/toggle", response_model=schemas.TimeBlock)
def toggle_time_block(
    block_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Toggle completion status of a time block."""
    db_block = db.query(models.TimeBlock).filter(
        models.TimeBlock.id == block_id,
        models.TimeBlock.person_id == current_user.id,
        models.TimeBlock.deleted == False,
    ).first()
    if not db_block:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time block not found")
    db_block.is_completed = not db_block.is_completed
    db.commit()

    # Sync ProgressLogTask for linked recurring tasks so streak counts the block completion
    if db_block.task_id:
        task = db.query(models.Task).filter(models.Task.id == db_block.task_id).first()
        if task and task.is_recurring:
            log_date = db_block.date
            existing_log = db.query(models.ProgressLogTask).filter(
                models.ProgressLogTask.task_id == db_block.task_id,
                models.ProgressLogTask.log_date == log_date,
            ).first()

            if db_block.is_completed and not existing_log:
                db.add(models.ProgressLogTask(task_id=db_block.task_id, log_date=log_date))
                db.commit()
            elif not db_block.is_completed and existing_log:
                db.delete(existing_log)
                db.commit()

    db.refresh(db_block)
    return db_block


# ── Daily AI Conclusions ──────────────────────────────────────────────────────

@router.get("/conclusions")
def get_conclusions(
    limit: int = Query(default=30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Return the most recent AI daily conclusions for the current user."""
    rows = (
        db.query(models.DailyConclusion)
        .filter(models.DailyConclusion.person_id == current_user.id)
        .order_by(models.DailyConclusion.date.desc())
        .limit(limit)
        .all()
    )
    return [{"date": str(r.date), "conclusion": r.conclusion, "created_at": str(r.created_at)} for r in rows]


@router.post("/conclusions/generate")
def trigger_conclusion(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Manually trigger AI conclusion generation for today."""
    from app.tasks import generate_daily_conclusion
    task = generate_daily_conclusion.delay()
    return {"message": "Conclusion generation queued", "task_id": task.id}



# ── Auto-schedule goal tasks this week ───────────────────────────────────────

@router.post("/auto-schedule/{goal_id}")
def auto_schedule_goal(
    goal_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """
    Find free slots this week and insert timetable blocks for unscheduled
    tasks belonging to goal_id. Respects existing blocks (no overlaps).
    Returns list of created blocks.
    """
    from datetime import datetime as dt

    goal = db.query(models.Goal).filter(
        models.Goal.id == goal_id,
        models.Goal.person_id == current_user.id,
        models.Goal.deleted == False,
    ).first()
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")

    today = date.today()
    week_end = today + timedelta(days=6)

    # Tasks not yet linked to a block this week
    tasks = [t for t in goal.tasks if not t.deleted and not t.completed]
    if not tasks:
        return {"created": [], "message": "No pending tasks for this goal"}

    # Existing blocks this week (for overlap checking)
    existing = db.query(models.TimeBlock).filter(
        models.TimeBlock.person_id == current_user.id,
        models.TimeBlock.date >= today,
        models.TimeBlock.date <= week_end,
        models.TimeBlock.deleted == False,
    ).all()

    def to_min(t: str) -> int:
        h, m = t.split(":")
        return int(h) * 60 + int(m)

    def is_free(day: date, start: int, end: int) -> bool:
        for b in existing:
            if b.date != day:
                continue
            bs, be = to_min(b.start_time), to_min(b.end_time)
            if start < be and end > bs:
                return False
        return True

    # Try to slot each task into working hours 09:00–18:00
    created = []
    for task in tasks:
        dur = task.estimated_duration or 30
        scheduled = False
        for offset in range(7):
            day = today + timedelta(days=offset)
            for hour in range(9, 18):
                start_min = hour * 60
                end_min = start_min + dur
                if end_min > 18 * 60:
                    break
                if is_free(day, start_min, end_min):
                    start_str = f"{start_min // 60:02d}:{start_min % 60:02d}"
                    end_str   = f"{end_min   // 60:02d}:{end_min   % 60:02d}"
                    block = models.TimeBlock(
                        person_id=current_user.id,
                        title=task.name,
                        date=day,
                        start_time=start_str,
                        end_time=end_str,
                        category="work",
                        task_id=task.id,
                    )
                    db.add(block)
                    # Add to existing so next task doesn't overlap
                    existing.append(block)
                    created.append({
                        "task": task.name,
                        "date": str(day),
                        "start": start_str,
                        "end": end_str,
                    })
                    scheduled = True
                    break
            if scheduled:
                break

    db.commit()
    return {"created": created, "count": len(created)}


# ── Bulk reschedule ───────────────────────────────────────────────────────────

@router.post("/bulk-reschedule")
def bulk_reschedule(
    body: dict,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """
    Move all non-deleted blocks from `from_date` to `to_date`.
    Completed blocks are skipped. Returns count of moved blocks.
    """
    from_date_str = body.get("from_date")
    to_date_str = body.get("to_date")
    if not from_date_str or not to_date_str:
        raise HTTPException(status_code=400, detail="from_date and to_date are required")

    try:
        from_d = date.fromisoformat(from_date_str)
        to_d = date.fromisoformat(to_date_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    if from_d == to_d:
        raise HTTPException(status_code=400, detail="from_date and to_date must be different")

    blocks = db.query(models.TimeBlock).filter(
        models.TimeBlock.person_id == current_user.id,
        models.TimeBlock.date == from_d,
        models.TimeBlock.deleted == False,
        models.TimeBlock.is_completed == False,
    ).all()

    for block in blocks:
        block.date = to_d
        block.is_missed = False
        block.notified_at = None

    db.commit()
    return {"moved": len(blocks), "from_date": from_date_str, "to_date": to_date_str}
