"""Daily news pipeline.

Flow per category:
  1. Ask GNews (primary) for up to N articles.
  2. If GNews returned 0 (empty or error) AND NewsAPI is configured, fall
     back to NewsAPI.
  3. Drop articles whose URL is already stored for this (category, date).
  4. Summarize each survivor via the AI fallback chain (or raw description
     if AI is unavailable).
  5. Persist as NewsItem rows.

The pipeline is idempotent: re-running on the same day for the same
category is a no-op for articles already stored. That's important for
manual `POST /news/fetch` retries and for Celery's at-least-once delivery
semantics (a worker that gets SIGTERMed mid-run resumes cleanly on the
next tick).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.services.news.base import NewsProvider, NewsProviderError, RawArticle
from app.services.news.gnews import GNewsProvider
from app.services.news.newsapi import NewsAPIProvider
from app.services.news.summarizer import summarize_article, fallback_summary


def _scrape_content(url: str) -> Optional[str]:
    """Attempt to extract full article text from the URL using trafilatura.
    Returns None on any error so callers can fall back gracefully."""
    try:
        import trafilatura  # lazy import — not critical path
        downloaded = trafilatura.fetch_url(url)
        if not downloaded:
            return None
        text = trafilatura.extract(
            downloaded,
            include_comments=False,
            include_tables=False,
            no_fallback=False,
            favor_precision=True,
        )
        return text or None
    except Exception as exc:  # network error, blocked, etc.
        logger.debug("content scrape failed for %s: %s", url, exc)
        return None


logger = logging.getLogger(__name__)


TASHKENT_OFFSET = timedelta(hours=5)


def tashkent_today() -> date:
    return (datetime.utcnow() + TASHKENT_OFFSET).date()


@dataclass
class CategoryResult:
    category_slug: str
    fetched: int = 0          # articles returned by provider(s)
    inserted: int = 0         # new NewsItem rows created
    skipped_dup: int = 0      # already in DB for (category, date, url)
    provider_used: Optional[str] = None
    error: Optional[str] = None


@dataclass
class FetchSummary:
    target_date: date
    categories: list[CategoryResult] = field(default_factory=list)

    @property
    def total_inserted(self) -> int:
        return sum(c.inserted for c in self.categories)


def _default_providers() -> list[NewsProvider]:
    """GNews first, NewsAPI as fallback. Both are tolerant of missing keys —
    a provider that isn't configured returns [] without error."""
    return [GNewsProvider(), NewsAPIProvider()]


def _existing_urls_for(
    db: Session, category_id: int, target_date: date
) -> set[str]:
    """The dedup set. One query per category — cheaper than N existence
    checks during insert."""
    rows = (
        db.query(models.NewsItem.url)
        .filter(
            models.NewsItem.category_id == category_id,
            models.NewsItem.date == target_date,
        )
        .all()
    )
    return {r[0] for r in rows}


def _fetch_with_fallback(
    providers: Iterable[NewsProvider],
    category: models.NewsCategory,
    *,
    limit: int,
) -> tuple[list[RawArticle], Optional[str], Optional[str]]:
    """
    Walk providers in order. First one that returns ≥1 article wins.
    Provider errors are logged and skipped — we never blow up a daily run
    because one vendor's API hiccuped.

    Returns (articles, provider_used, error_message).
    """
    last_error: Optional[str] = None
    for provider in providers:
        try:
            articles = provider.fetch(category, limit=limit)
        except NewsProviderError as exc:
            last_error = f"{provider.name}: {exc}"
            logger.info("provider %s failed for %s: %s", provider.name, category.slug, exc)
            continue
        if articles:
            return articles, provider.name, None
    return [], None, last_error


def _persist(
    db: Session,
    category: models.NewsCategory,
    target_date: date,
    articles: Iterable[RawArticle],
    seen_urls: set[str],
) -> CategoryResult:
    result = CategoryResult(category_slug=category.slug)
    for raw in articles:
        result.fetched += 1
        if not raw.url:
            continue
        if raw.url in seen_urls:
            result.skipped_dup += 1
            continue

        # Try to scrape full article body. Falls back gracefully when blocked.
        content = _scrape_content(raw.url)

        # AI summary uses full content when available, otherwise the snippet.
        source_text = content or raw.description
        summary = summarize_article(raw.headline, source_text)
        if not summary:
            summary = fallback_summary(source_text)

        item = models.NewsItem(
            category_id=category.id,
            date=target_date,
            headline=raw.headline[:500],
            summary=summary,
            description=raw.description,
            content=content,
            url=raw.url,
            image_url=raw.image_url,
            source_name=(raw.source_name or "")[:200] or None,
            provider=raw.provider,
            published_at=raw.published_at,
        )
        db.add(item)
        seen_urls.add(raw.url)
        result.inserted += 1

    if result.inserted:
        db.commit()
    return result


def run_daily_fetch(
    db: Session,
    *,
    target_date: Optional[date] = None,
    providers: Optional[list[NewsProvider]] = None,
    limit_per_category: Optional[int] = None,
) -> FetchSummary:
    """
    Entry point used by the Celery task and the manual `/news/fetch` endpoint.

    `target_date` defaults to Tashkent-local today. `providers` is overridable
    for tests; production callers pass nothing.
    """
    target_date = target_date or tashkent_today()
    providers = providers if providers is not None else _default_providers()
    limit = limit_per_category or settings.NEWS_ITEMS_PER_CATEGORY

    summary = FetchSummary(target_date=target_date)

    categories = (
        db.query(models.NewsCategory)
        .filter(models.NewsCategory.is_active == True)
        .order_by(models.NewsCategory.sort_order.asc())
        .all()
    )

    for category in categories:
        articles, provider_used, error = _fetch_with_fallback(
            providers, category, limit=limit,
        )
        if error and not articles:
            cat_result = CategoryResult(
                category_slug=category.slug, error=error,
            )
            summary.categories.append(cat_result)
            continue

        seen = _existing_urls_for(db, category.id, target_date)
        cat_result = _persist(db, category, target_date, articles, seen)
        cat_result.provider_used = provider_used
        summary.categories.append(cat_result)

    logger.info(
        "news pipeline: date=%s total_inserted=%d categories=%d",
        target_date, summary.total_inserted, len(summary.categories),
    )
    return summary
