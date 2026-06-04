"""News section endpoints.

Five routes:
  * GET  /news/categories         — catalog + `is_selected` per row
  * PUT  /news/categories         — replace user's full subscription set
  * GET  /news/?date=YYYY-MM-DD   — items for that date (user's picks only)
  * GET  /news/dates?from=&to=    — days that have content (drives log calendar)
  * POST /news/fetch?date=        — manual trigger (synchronous, gated)

The fetch route runs the pipeline inline rather than enqueuing the Celery
task so the caller (admin/dev) gets a real summary back instead of an async
task ID. Production runs through the daily beat.
"""
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user


router = APIRouter(prefix="/news", tags=["news"])


# ─── Helpers ────────────────────────────────────────────────────────────────

def _user_category_ids(db: Session, person_id: int) -> set[int]:
    return {
        row.category_id
        for row in db.query(models.UserNewsCategory.category_id)
        .filter(models.UserNewsCategory.person_id == person_id)
        .all()
    }


def _serialize_item(item: models.NewsItem, cat: models.NewsCategory) -> dict:
    return {
        "id": item.id,
        "category_id": cat.id,
        "category_slug": cat.slug,
        "category_label": cat.label,
        "category_color": cat.color,
        "date": item.date,
        "headline": item.headline,
        "summary": item.summary,
        "description": item.description,
        "content": item.content,
        "url": item.url,
        "image_url": item.image_url,
        "source_name": item.source_name,
        "provider": item.provider,
        "published_at": item.published_at,
    }


# ─── Categories ─────────────────────────────────────────────────────────────

@router.get("/categories", response_model=List[schemas.NewsCategoryRead])
def list_categories(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Full catalog plus `is_selected` for the current user."""
    selected = _user_category_ids(db, current_user.id)
    categories = (
        db.query(models.NewsCategory)
        .filter(models.NewsCategory.is_active == True)
        .order_by(models.NewsCategory.sort_order.asc())
        .all()
    )
    return [
        schemas.NewsCategoryRead(
            id=c.id,
            slug=c.slug,
            label=c.label,
            color=c.color,
            sort_order=c.sort_order,
            mode=c.mode,
            is_selected=c.id in selected,
        )
        for c in categories
    ]


@router.put("/categories", response_model=List[schemas.NewsCategoryRead])
def set_categories(
    body: schemas.NewsCategoryPickWrite,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """
    Replace the user's full category selection. Idempotent — sending the same
    list twice is a no-op.

    Validates every id belongs to an active catalog row so a stale frontend
    can't silently subscribe the user to a deleted category.
    """
    desired = set(body.category_ids)
    if desired:
        valid = {
            row.id
            for row in db.query(models.NewsCategory.id)
            .filter(
                models.NewsCategory.id.in_(desired),
                models.NewsCategory.is_active == True,
            )
            .all()
        }
        unknown = desired - valid
        if unknown:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unknown or inactive categories: {sorted(unknown)}",
            )

    current = _user_category_ids(db, current_user.id)
    to_add = desired - current
    to_remove = current - desired

    if to_remove:
        db.query(models.UserNewsCategory).filter(
            models.UserNewsCategory.person_id == current_user.id,
            models.UserNewsCategory.category_id.in_(to_remove),
        ).delete(synchronize_session=False)
    for cat_id in to_add:
        db.add(models.UserNewsCategory(
            person_id=current_user.id, category_id=cat_id,
        ))

    if to_add or to_remove:
        db.commit()

    return list_categories(db=db, current_user=current_user)


# ─── Items ──────────────────────────────────────────────────────────────────

@router.get("/", response_model=List[schemas.NewsItemRead])
def list_items(
    target_date: Optional[date] = Query(None, alias="date"),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """
    Items for `date`, restricted to the user's subscribed categories.
    Defaults to today (server-local — the cron stamps `date` as Tashkent-local,
    so the user's "today" matches what's in the DB).
    """
    if target_date is None:
        # Tashkent-local — match the pipeline's date stamping.
        target_date = (datetime.utcnow() + timedelta(hours=5)).date()

    selected = _user_category_ids(db, current_user.id)
    if not selected:
        return []

    rows = (
        db.query(models.NewsItem, models.NewsCategory)
        .join(models.NewsCategory, models.NewsItem.category_id == models.NewsCategory.id)
        .filter(
            models.NewsItem.date == target_date,
            models.NewsItem.category_id.in_(selected),
        )
        .order_by(
            models.NewsCategory.sort_order.asc(),
            models.NewsItem.published_at.desc().nulls_last(),
            models.NewsItem.id.desc(),
        )
        .all()
    )
    return [_serialize_item(item, cat) for item, cat in rows]


@router.get("/dates")
def list_dates_with_items(
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """
    Distinct dates in [from, to] that have ≥1 item for the user's selected
    categories. Drives the log-view calendar so we don't render days the
    user can't read.

    Default window: the past 30 days through today.
    """
    selected = _user_category_ids(db, current_user.id)
    if not selected:
        return {"dates": []}

    today_tashkent = (datetime.utcnow() + timedelta(hours=5)).date()
    if to_date is None:
        to_date = today_tashkent
    if from_date is None:
        from_date = to_date - timedelta(days=30)

    rows = (
        db.query(models.NewsItem.date)
        .filter(
            models.NewsItem.date >= from_date,
            models.NewsItem.date <= to_date,
            models.NewsItem.category_id.in_(selected),
        )
        .group_by(models.NewsItem.date)
        .order_by(models.NewsItem.date.desc())
        .all()
    )
    return {"dates": [str(r[0]) for r in rows]}


# ─── Single article ─────────────────────────────────────────────────────────

@router.get("/{item_id}")
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Return one news article by id."""
    item = db.query(models.NewsItem).filter(models.NewsItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Article not found")
    cat = db.query(models.NewsCategory).filter(models.NewsCategory.id == item.category_id).first()
    return _serialize_item(item, cat)


# ─── Manual fetch trigger ───────────────────────────────────────────────────

@router.post("/fetch", response_model=schemas.NewsFetchSummary)
def trigger_fetch(
    target_date: Optional[date] = Query(None, alias="date"),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """
    Run the pipeline synchronously for `date` (default: Tashkent today).
    Idempotent — re-running for the same day inserts only articles not
    already stored.
    """
    from app.services.news import run_daily_fetch

    try:
        summary = run_daily_fetch(db, target_date=target_date)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"News fetch failed: {type(exc).__name__}: {exc}",
        )

    return schemas.NewsFetchSummary(
        date=summary.target_date,
        total_inserted=summary.total_inserted,
        categories=[
            {
                "slug": c.category_slug,
                "fetched": c.fetched,
                "inserted": c.inserted,
                "skipped_dup": c.skipped_dup,
                "provider": c.provider_used,
                "error": c.error,
            }
            for c in summary.categories
        ],
    )
