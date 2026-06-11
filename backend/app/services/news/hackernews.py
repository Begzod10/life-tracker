"""Hacker News provider (community top stories).

Uses the official Firebase REST API — no key required, no rate limit.
Only meaningful for tech/science/startup categories; returns [] for any
category whose slug is not in HN_SLUGS so the pipeline skips it cleanly.

Each story is just a title + URL, so content must come from trafilatura
scraping in the pipeline. The description field is seeded from the HN
score so the summarizer has at least something to work with when scraping
is blocked.
"""
from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

import requests

from app.services.news.base import NewsProvider, NewsProviderError, RawArticle


logger = logging.getLogger(__name__)

HN_BASE = "https://hacker-news.firebaseio.com/v0"

# Only serve HN articles for categories where community tech curation adds
# signal. Add more slugs here to expand coverage.
HN_SLUGS = {"technology", "science", "startups"}

# How many top-story IDs to fetch from /topstories.json. We grab more than
# `limit` because some items turn out to be Ask HN / dead / flagged.
_CANDIDATES = 60


class HackerNewsProvider(NewsProvider):
    name = "hackernews"

    @property
    def configured(self) -> bool:
        return True  # no key needed

    def fetch(self, category, *, limit: int) -> list[RawArticle]:
        if category.slug not in HN_SLUGS:
            return []

        try:
            top_ids: list[int] = requests.get(
                f"{HN_BASE}/topstories.json", timeout=10
            ).json()
        except requests.RequestException as exc:
            raise NewsProviderError(str(exc)) from exc

        candidates = top_ids[:_CANDIDATES]
        articles: list[RawArticle] = []

        with ThreadPoolExecutor(max_workers=10) as pool:
            futures = {pool.submit(self._fetch_item, sid): sid for sid in candidates}
            for future in as_completed(futures):
                if len(articles) >= limit:
                    break
                item = future.result()
                if item:
                    articles.append(item)

        return articles[:limit]

    def _fetch_item(self, story_id: int) -> Optional[RawArticle]:
        try:
            data = requests.get(
                f"{HN_BASE}/item/{story_id}.json", timeout=8
            ).json()
        except requests.RequestException:
            return None

        if not data or data.get("dead") or data.get("deleted"):
            return None
        if data.get("type") != "story":
            return None
        url = data.get("url")
        if not url:
            return None  # Ask HN / self-posts — no external article

        score = data.get("score", 0)
        comments = data.get("descendants", 0)
        return RawArticle(
            url=url,
            headline=(data.get("title") or "").strip()[:500],
            description=f"{score} points · {comments} comments on Hacker News",
            image_url=None,
            source_name="Hacker News",
            published_at=None,
            provider="hackernews",
        )
