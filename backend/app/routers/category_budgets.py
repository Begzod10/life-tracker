from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import date, timedelta
from collections import defaultdict

from app import models
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(prefix="/category-budgets", tags=["category-budgets"])


@router.get("/")
def get_budgets(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Return all category budgets with this week's actual hours."""
    today = date.today()
    week_start = today - timedelta(days=today.weekday())  # Monday

    budgets = db.query(models.CategoryBudget).filter(
        models.CategoryBudget.person_id == current_user.id,
    ).all()

    # Compute actual hours this week per category
    blocks = db.query(models.TimeBlock).filter(
        models.TimeBlock.person_id == current_user.id,
        models.TimeBlock.date >= week_start,
        models.TimeBlock.date <= today,
        models.TimeBlock.deleted == False,
    ).all()

    actual: dict[str, float] = defaultdict(float)
    for b in blocks:
        def to_min(t: str) -> int:
            h, m = t.split(":")
            return int(h) * 60 + int(m)
        actual[b.category or "other"] += max(0, to_min(b.end_time) - to_min(b.start_time)) / 60

    return [
        {
            "id": b.id,
            "category": b.category,
            "weekly_hours_target": b.weekly_hours_target,
            "actual_hours": round(actual.get(b.category, 0.0), 1),
        }
        for b in budgets
    ]


@router.put("/{category}")
def upsert_budget(
    category: str,
    body: dict,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Create or update a weekly hour target for a category."""
    hours = float(body.get("weekly_hours_target", 0))
    if hours < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Hours must be >= 0")

    existing = db.query(models.CategoryBudget).filter(
        models.CategoryBudget.person_id == current_user.id,
        models.CategoryBudget.category == category,
    ).first()

    if existing:
        existing.weekly_hours_target = hours
    else:
        db.add(models.CategoryBudget(
            person_id=current_user.id,
            category=category,
            weekly_hours_target=hours,
        ))

    db.commit()
    return {"category": category, "weekly_hours_target": hours}


@router.delete("/{category}", status_code=status.HTTP_204_NO_CONTENT)
def delete_budget(
    category: str,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    db.query(models.CategoryBudget).filter(
        models.CategoryBudget.person_id == current_user.id,
        models.CategoryBudget.category == category,
    ).delete()
    db.commit()
