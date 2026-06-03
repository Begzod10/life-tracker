"""NewsAPI.org client.

Two endpoints used:
  * top-headlines?category=... — for native categories
  * everything?q=...           — for search-based categories

CAUTION: NewsAPI's free tier is *dev-only* per their terms — production
use requires a paid plan. The pipeline degrades gracefully when this
provider is misconfigured or returns an error; GNews handles the fetch
on its own when NEWSAPI_KEY is unset.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

import requests

from app.config import settings
from app.services.news.base import NewsProvider, NewsProviderError, RawArticle


logger = logging.getLogger(__name__)

NEWSAPI_BASE = "https://newsapi.org/v2"


class NewsAPIProvider(NewsProvider):
    name = "newsapi"

    def __init__(self, api_key: Optional[str] = None) -> None:
        self._api_key = api_key or settings.NEWSAPI_KEY

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    def fetch(self, category, *, limit: int) -> list[RawArticle]:
        if not self.configured:
            return []

        headers = {"X-Api-Key": self._api_key}
        params: dict = {"language": "en", "pageSize": limit}

        if category.mode == "native":
            if not category.newsapi_category:
                return []
            url = f"{NEWSAPI_BASE}/top-headlines"
            params["category"] = category.newsapi_category
            params["country"] = "us"  # top-headlines requires country OR sources
        elif category.mode == "search":
            if not category.search_query:
                return []
            url = f"{NEWSAPI_BASE}/everything"
            params["q"] = category.search_query
            params["sortBy"] = "publishedAt"
        else:
            return []

        try:
            resp = requests.get(url, params=params, headers=headers, timeout=15)
            resp.raise_for_status()
        except requests.RequestException as exc:
            logger.warning("NewsAPI fetch failed for %s: %s", category.slug, exc)
            raise NewsProviderError(str(exc)) from exc

        payload = resp.json()
        if payload.get("status") != "ok":
            # NewsAPI returns 200 with status=error for things like "apiKey
            # only works on developer plan" — raise so the pipeline can log
            # and fall over to the next provider.
            raise NewsProviderError(payload.get("message") or "NewsAPI error")

        articles = payload.get("articles", []) or []
        return [self._map(a) for a in articles if a.get("url")]

    @staticmethod
    def _map(raw: dict) -> RawArticle:
        published_at = None
        if iso := raw.get("publishedAt"):
            try:
                published_at = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass
        source = raw.get("source") or {}
        return RawArticle(
            url=raw.get("url", ""),
            headline=(raw.get("title") or "").strip()[:500],
            description=(raw.get("description") or None),
            image_url=raw.get("urlToImage"),
            source_name=(source.get("name") if isinstance(source, dict) else None),
            published_at=published_at,
            provider="newsapi",
        )
