"""Pipeline tests with stub providers.

These tests cover:
  * dedup against rows already in the DB,
  * provider fallback (primary returns empty → secondary runs),
  * error tolerance (primary raises → secondary covers),
  * the user-subscribed-only filter on GET /news/,
  * the manual fetch endpoint,
  * PUT /news/categories validation + persistence.

Provider HTTP is never touched — we inject stub providers. AI summary is
also stubbed (otherwise tests would block on Gemini/OpenAI/Groq calls).
"""
from datetime import date, datetime
from unittest.mock import patch

import pytest

from app import models
from app.services.news.base import NewsProvider, NewsProviderError, RawArticle
from app.services.news.pipeline import run_daily_fetch


# ─── Stub providers ─────────────────────────────────────────────────────────

class StubProvider(NewsProvider):
    """Returns whatever it's given. Used by tests to control responses
    without ever hitting the network."""

    def __init__(self, name: str, articles_by_slug: dict[str, list[RawArticle]] | None = None,
                 raises_for: set[str] | None = None):
        self.name = name
        self._articles = articles_by_slug or {}
        self._raises = raises_for or set()
        self.calls: list[str] = []

    def fetch(self, category, *, limit: int) -> list[RawArticle]:
        self.calls.append(category.slug)
        if category.slug in self._raises:
            raise NewsProviderError(f"stub {self.name} failure")
        return self._articles.get(category.slug, [])[:limit]


def _article(url: str, *, headline: str = "Test", provider: str = "stub") -> RawArticle:
    return RawArticle(
        url=url,
        headline=headline,
        description="desc",
        image_url=None,
        source_name="Stub Source",
        published_at=datetime(2026, 6, 3, 12, 0),
        provider=provider,
    )


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture(autouse=True)
def _stub_summarizer():
    """Pin AI to a deterministic stub. Real calls would slow tests + need keys."""
    with patch("app.services.news.pipeline.summarize_article", return_value="Two-sentence stub."):
        yield


@pytest.fixture
def tech_cat(db_session):
    cat = models.NewsCategory(
        slug="technology", label="Technology", color="#7c3aed",
        sort_order=30, mode="native",
        gnews_topic="technology", newsapi_category="technology",
        is_active=True,
    )
    db_session.add(cat)
    db_session.commit()
    db_session.refresh(cat)
    return cat


@pytest.fixture
def world_cat(db_session):
    cat = models.NewsCategory(
        slug="world", label="World", color="#2563eb",
        sort_order=10, mode="native",
        gnews_topic="world", newsapi_category=None,
        is_active=True,
    )
    db_session.add(cat)
    db_session.commit()
    db_session.refresh(cat)
    return cat


# ─── Pipeline ───────────────────────────────────────────────────────────────

def test_pipeline_inserts_articles_for_active_categories(db_session, tech_cat):
    primary = StubProvider("primary", articles_by_slug={
        "technology": [_article("https://x.test/1"), _article("https://x.test/2")],
    })

    summary = run_daily_fetch(
        db_session, target_date=date(2026, 6, 3),
        providers=[primary], limit_per_category=10,
    )

    assert summary.total_inserted == 2
    assert len(summary.categories) == 1
    assert summary.categories[0].provider_used == "primary"
    rows = db_session.query(models.NewsItem).all()
    assert len(rows) == 2
    assert {r.url for r in rows} == {"https://x.test/1", "https://x.test/2"}


def test_pipeline_dedups_existing_urls(db_session, tech_cat):
    """Re-running the same day with one overlapping URL only inserts the new one."""
    db_session.add(models.NewsItem(
        category_id=tech_cat.id, date=date(2026, 6, 3),
        headline="Already there", url="https://x.test/1",
        provider="gnews",
    ))
    db_session.commit()

    primary = StubProvider("primary", articles_by_slug={
        "technology": [
            _article("https://x.test/1"),  # duplicate
            _article("https://x.test/2"),  # new
        ],
    })

    summary = run_daily_fetch(
        db_session, target_date=date(2026, 6, 3),
        providers=[primary], limit_per_category=10,
    )

    assert summary.categories[0].inserted == 1
    assert summary.categories[0].skipped_dup == 1
    assert db_session.query(models.NewsItem).count() == 2


def test_pipeline_falls_over_to_secondary_when_primary_empty(db_session, tech_cat):
    """Primary returns [], secondary returns articles. Pipeline uses secondary."""
    primary = StubProvider("primary", articles_by_slug={})
    secondary = StubProvider("secondary", articles_by_slug={
        "technology": [_article("https://x.test/sec", provider="secondary")],
    })

    summary = run_daily_fetch(
        db_session, target_date=date(2026, 6, 3),
        providers=[primary, secondary], limit_per_category=10,
    )

    assert summary.categories[0].provider_used == "secondary"
    assert summary.categories[0].inserted == 1
    assert primary.calls == ["technology"]
    assert secondary.calls == ["technology"]


def test_pipeline_falls_over_when_primary_raises(db_session, tech_cat):
    """Primary errors out; pipeline catches NewsProviderError and tries secondary."""
    primary = StubProvider("primary", raises_for={"technology"})
    secondary = StubProvider("secondary", articles_by_slug={
        "technology": [_article("https://x.test/sec")],
    })

    summary = run_daily_fetch(
        db_session, target_date=date(2026, 6, 3),
        providers=[primary, secondary], limit_per_category=10,
    )

    assert summary.categories[0].provider_used == "secondary"
    assert summary.categories[0].inserted == 1


def test_pipeline_records_error_when_all_providers_fail(db_session, tech_cat):
    primary = StubProvider("primary", raises_for={"technology"})
    secondary = StubProvider("secondary", raises_for={"technology"})

    summary = run_daily_fetch(
        db_session, target_date=date(2026, 6, 3),
        providers=[primary, secondary], limit_per_category=10,
    )

    assert summary.total_inserted == 0
    cat_result = summary.categories[0]
    assert cat_result.error is not None
    assert "secondary" in cat_result.error


def test_pipeline_skips_inactive_categories(db_session, tech_cat, world_cat):
    world_cat.is_active = False
    db_session.commit()

    primary = StubProvider("primary", articles_by_slug={
        "technology": [_article("https://x.test/t")],
        "world":      [_article("https://x.test/w")],
    })

    summary = run_daily_fetch(
        db_session, target_date=date(2026, 6, 3),
        providers=[primary], limit_per_category=10,
    )

    slugs_processed = [c.category_slug for c in summary.categories]
    assert "world" not in slugs_processed
    assert "technology" in slugs_processed


# ─── Router round-trip ──────────────────────────────────────────────────────

def test_get_categories_marks_user_picks(auth_client, db_session, test_user, tech_cat, world_cat):
    db_session.add(models.UserNewsCategory(
        person_id=test_user.id, category_id=tech_cat.id,
    ))
    db_session.commit()

    r = auth_client.get("/api/news/categories")
    assert r.status_code == 200
    payload = {c["slug"]: c for c in r.json()}
    assert payload["technology"]["is_selected"] is True
    assert payload["world"]["is_selected"] is False


def test_put_categories_replaces_selection(auth_client, db_session, test_user, tech_cat, world_cat):
    # Pre-pick world.
    db_session.add(models.UserNewsCategory(
        person_id=test_user.id, category_id=world_cat.id,
    ))
    db_session.commit()

    # Replace with just technology.
    r = auth_client.put(
        "/api/news/categories",
        json={"category_ids": [tech_cat.id]},
    )
    assert r.status_code == 200

    picks = {
        row.category_id
        for row in db_session.query(models.UserNewsCategory)
        .filter(models.UserNewsCategory.person_id == test_user.id)
        .all()
    }
    assert picks == {tech_cat.id}


def test_put_categories_rejects_unknown_id(auth_client, tech_cat):
    r = auth_client.put(
        "/api/news/categories",
        json={"category_ids": [999_999]},
    )
    assert r.status_code == 400


def test_get_items_returns_only_subscribed_categories(
    auth_client, db_session, test_user, tech_cat, world_cat
):
    target = date(2026, 6, 3)
    db_session.add_all([
        models.NewsItem(
            category_id=tech_cat.id, date=target, headline="Tech 1",
            url="https://t.test/1", provider="gnews",
        ),
        models.NewsItem(
            category_id=world_cat.id, date=target, headline="World 1",
            url="https://w.test/1", provider="gnews",
        ),
    ])
    db_session.add(models.UserNewsCategory(
        person_id=test_user.id, category_id=tech_cat.id,
    ))
    db_session.commit()

    r = auth_client.get(f"/api/news/?date={target.isoformat()}")
    assert r.status_code == 200
    items = r.json()
    assert len(items) == 1
    assert items[0]["category_slug"] == "technology"


def test_get_items_empty_when_no_subscriptions(auth_client, tech_cat):
    r = auth_client.get("/api/news/?date=2026-06-03")
    assert r.status_code == 200
    assert r.json() == []


def test_dates_lists_days_with_content_in_user_categories(
    auth_client, db_session, test_user, tech_cat, world_cat
):
    db_session.add_all([
        models.NewsItem(
            category_id=tech_cat.id, date=date(2026, 6, 1),
            headline="A", url="https://x.test/a", provider="gnews",
        ),
        models.NewsItem(
            category_id=tech_cat.id, date=date(2026, 6, 3),
            headline="B", url="https://x.test/b", provider="gnews",
        ),
        models.NewsItem(
            category_id=world_cat.id, date=date(2026, 6, 2),
            headline="C", url="https://x.test/c", provider="gnews",
        ),
    ])
    db_session.add(models.UserNewsCategory(
        person_id=test_user.id, category_id=tech_cat.id,
    ))
    db_session.commit()

    r = auth_client.get("/api/news/dates?from=2026-05-01&to=2026-06-30")
    assert r.status_code == 200
    dates = r.json()["dates"]
    # 2026-06-02 belongs to world (not subscribed), should NOT appear.
    assert "2026-06-02" not in dates
    assert set(dates) == {"2026-06-01", "2026-06-03"}
