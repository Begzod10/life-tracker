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
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Aggregated timetable statistics for the selected N-week window (past + upcoming)."""
    today = date.today()
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

    total_blocks = len(blocks)
    completed_blocks = sum(1 for b in blocks if b.is_completed)
    total_hours = sum(duration_hours(b) for b in blocks)
    completed_hours = sum(duration_hours(b) for b in blocks if b.is_completed)

    # By category
    cat_data = defaultdict(lambda: {"count": 0, "hours": 0.0, "completed": 0})
    for b in blocks:
        cat = b.category or "other"
        cat_data[cat]["count"] += 1
        cat_data[cat]["hours"] += duration_hours(b)
        if b.is_completed:
            cat_data[cat]["completed"] += 1
    by_category = [{"category": k, **v} for k, v in sorted(cat_data.items(), key=lambda x: -x[1]["hours"])]

    # By weekday (0=Mon … 6=Sun)
    DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    wd_data = defaultdict(lambda: {"count": 0, "hours": 0.0, "completed": 0})
    for b in blocks:
        wd = b.date.weekday()
        wd_data[wd]["count"] += 1
        wd_data[wd]["hours"] += duration_hours(b)
        if b.is_completed:
            wd_data[wd]["completed"] += 1
    by_weekday = [{"weekday": i, "name": DAYS[i], **wd_data[i]} for i in range(7)]

    # By hour (start hour distribution)
    hour_data = defaultdict(int)
    for b in blocks:
        h = int(str(b.start_time).split(":")[0])
        hour_data[h] += 1
    by_hour = [{"hour": h, "count": hour_data[h]} for h in range(6, 24)]

    # Daily summary (all days in range)
    day_data = defaultdict(lambda: {"total": 0, "completed": 0, "hours": 0.0})
    for b in blocks:
        ds = str(b.date)
        day_data[ds]["total"] += 1
        day_data[ds]["hours"] += duration_hours(b)
        if b.is_completed:
            day_data[ds]["completed"] += 1
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
        "completion_rate": round(completed_blocks / total_blocks * 100, 1) if total_blocks else 0,
        "total_hours": round(total_hours, 1),
        "completed_hours": round(completed_hours, 1),
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
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Update a time block."""
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
    for key, value in update_data.items():
        setattr(db_block, key, value)
    db.commit()
    db.refresh(db_block)
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
    db.refresh(db_block)
    return db_block
