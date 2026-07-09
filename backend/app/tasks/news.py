"""
News pipeline Celery task.
  - fetch_daily_news: runs at NEWS_FETCH_HOUR_UTC daily and on-demand via POST /news/fetch
"""
import logging

from app.celery_app import celery_app
from app.database import SessionLocal

logger = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.fetch_daily_news", bind=True, max_retries=2)
def fetch_daily_news(self, target_date_iso: str | None = None):
    """
    Run the news pipeline in the background.

    Called by the Celery beat schedule and by the manual POST /news/fetch
    endpoint (which fires this task and returns 202 immediately instead of
    blocking for the full scrape + summarise cycle).
    """
    from datetime import date as date_type
    from app.services.news import run_daily_fetch

    db = SessionLocal()
    try:
        target_date = (
            date_type.fromisoformat(target_date_iso)
            if target_date_iso
            else None
        )
        summary = run_daily_fetch(db, target_date=target_date)
        logger.info(
            "fetch_daily_news: date=%s inserted=%d",
            summary.target_date,
            summary.total_inserted,
        )
        return {
            "date": str(summary.target_date),
            "total_inserted": summary.total_inserted,
            "categories": [
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
        }
    except Exception as exc:
        db.rollback()
        logger.exception("fetch_daily_news failed: %s", exc)
        raise self.retry(exc=exc, countdown=60 * 2)
    finally:
        db.close()
