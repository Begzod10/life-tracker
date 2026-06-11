"""Dashboard summary endpoint.

Returns a single aggregated snapshot used by the /platform/[id] dashboard page.
One request instead of 6+ separate calls.
"""
from datetime import datetime, timedelta, date as date_type
from sqlalchemy import func

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_user
from app import models

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    now = datetime.utcnow()
    today = date_type.today()
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    current_month = today.strftime("%Y-%m")

    person_id = current_user.id

    # ── Exercises ─────────────────────────────────────────────────────────────
    ex_week = (
        db.query(models.ExerciseAttempt)
        .filter(
            models.ExerciseAttempt.person_id == person_id,
            models.ExerciseAttempt.created_at >= week_ago,
        )
        .all()
    )
    ex_total_7d = len(ex_week)
    ex_correct_7d = sum(1 for a in ex_week if a.is_correct)
    ex_accuracy_7d = round(ex_correct_7d / ex_total_7d * 100) if ex_total_7d else 0

    words_due = (
        db.query(models.DictionaryWord)
        .filter(
            models.DictionaryWord.person_id == person_id,
            models.DictionaryWord.next_review_at <= now,
        )
        .count()
    )

    # ── Goals ─────────────────────────────────────────────────────────────────
    all_goals = (
        db.query(models.Goal)
        .filter(
            models.Goal.person_id == person_id,
            models.Goal.deleted == False,
        )
        .all()
    )
    active_goals = [g for g in all_goals if g.status == "active"]
    avg_completion = (
        round(sum(g._stored_percentage or 0 for g in active_goals) / len(active_goals))
        if active_goals else 0
    )
    top_goals = sorted(active_goals, key=lambda g: -(g._stored_percentage or 0))[:3]

    # ── Books ─────────────────────────────────────────────────────────────────
    reading_books = (
        db.query(models.Book)
        .filter(
            models.Book.person_id == person_id,
            models.Book.status == "reading",
            models.Book.deleted == False,
        )
        .order_by(models.Book.last_opened_at.desc().nullslast())
        .all()
    )
    current_book = reading_books[0] if reading_books else None

    pages_30d = (
        db.query(models.ReadingSession)
        .filter(
            models.ReadingSession.person_id == person_id,
            models.ReadingSession.started_at >= month_ago,
        )
        .all()
    )
    pages_30d_sum = sum(s.pages_read or 0 for s in pages_30d)

    # ── Today's timetable ─────────────────────────────────────────────────────
    today_blocks = (
        db.query(models.TimeBlock)
        .filter(
            models.TimeBlock.person_id == person_id,
            models.TimeBlock.date == today,
            models.TimeBlock.deleted == False,
        )
        .order_by(models.TimeBlock.start_time)
        .all()
    )
    blocks_done = sum(1 for b in today_blocks if b.is_completed)

    # ── Finance ───────────────────────────────────────────────────────────────
    month_start = date_type(today.year, today.month, 1)
    expenses_this_month = (
        db.query(func.coalesce(func.sum(models.Expense.amount), 0.0))
        .filter(
            models.Expense.person_id == person_id,
            models.Expense.date >= month_start,
        )
        .scalar()
    ) or 0.0

    budgets_this_month = (
        db.query(models.Budget)
        .filter(
            models.Budget.person_id == person_id,
            models.Budget.period == current_month,
            models.Budget.deleted == False,
        )
        .all()
    )
    budget_allocated = sum(b.allocated_amount or 0 for b in budgets_this_month)
    budget_remaining = budget_allocated - expenses_this_month

    # ── News ──────────────────────────────────────────────────────────────────
    today_iso = today.isoformat()
    news_today_count = (
        db.query(models.NewsItem)
        .filter(models.NewsItem.date == today_iso)
        .count()
    )
    latest_news = (
        db.query(models.NewsItem)
        .order_by(models.NewsItem.id.desc())
        .limit(3)
        .all()
    )

    return {
        "user": {
            "name": current_user.name or "there",
        },
        "exercises": {
            "last_7d_total": ex_total_7d,
            "last_7d_correct": ex_correct_7d,
            "accuracy_7d": ex_accuracy_7d,
            "words_due_today": words_due,
        },
        "goals": {
            "total": len(all_goals),
            "active": len(active_goals),
            "average_completion": avg_completion,
            "top_active": [
                {
                    "id": g.id,
                    "title": g.name,
                    "percentage": round(g._stored_percentage or 0),
                    "category": g.category or "Other",
                    "priority": g.priority or "medium",
                }
                for g in top_goals
            ],
        },
        "books": {
            "currently_reading": len(reading_books),
            "pages_last_30d": pages_30d_sum,
            "current_book": {
                "id": current_book.id,
                "title": current_book.title,
                "author": current_book.author,
                "current_page": current_book.current_page,
                "total_pages": current_book.total_pages or 0,
                "progress_pct": (
                    round(current_book.current_page / current_book.total_pages * 100)
                    if current_book.total_pages else 0
                ),
            } if current_book else None,
        },
        "today": {
            "date": today_iso,
            "timeblocks": [
                {
                    "id": b.id,
                    "title": b.title,
                    "start_time": b.start_time,
                    "end_time": b.end_time,
                    "category": b.category,
                    "color": b.color,
                    "is_completed": b.is_completed,
                    "is_missed": b.is_missed,
                }
                for b in today_blocks
            ],
            "timeblocks_total": len(today_blocks),
            "timeblocks_done": blocks_done,
        },
        "news": {
            "today_count": news_today_count,
            "latest": [
                {
                    "id": n.id,
                    "headline": n.headline,
                    "category_label": n.category.label if n.category else "",
                    "provider": n.provider,
                }
                for n in latest_news
            ],
        },
        "finance": {
            "month": current_month,
            "spent": round(expenses_this_month, 2),
            "budget_allocated": round(budget_allocated, 2),
            "budget_remaining": round(budget_remaining, 2),
        },
    }
