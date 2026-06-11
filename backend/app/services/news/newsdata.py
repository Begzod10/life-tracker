"""NewsData.io client.

Endpoints used:
  * /news?category=...  — for category.mode == 'native'
  * /news?q=...         — for category.mode == 'search'

Free tier: 200 requests/day, production-allowed.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

import requests

from app.config import settings
from app.services.news.base import NewsProvider, NewsProviderError, RawArticle


logger = logging.getLogger(__name__)

NEWSDATA_BASE = "https://newsdata.io/api/1"


class NewsDataProvider(NewsProvider):
    name = "newsdata"

    def __init__(self, api_key: Optional[str] = None) -> None:
        self._api_key = api_key or settings.NEWSDATA_API_KEY

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    def fetch(self, category, *, limit: int) -> list[RawArticle]:
        if not self.configured:
            return []

        params: dict = {
            "apikey": self._api_key,
            "language": "en",
        }

        if category.mode == "native":
            if not category.newsdata_category:
                return []
            params["category"] = category.newsdata_category
        elif category.mode == "search":
            if not category.search_query:
                return []
            params["q"] = category.search_query
        else:
            return []

        try:
            resp = requests.get(
                f"{NEWSDATA_BASE}/news", params=params, timeout=15
            )
            resp.raise_for_status()
        except requests.RequestException as exc:
            safe = str(exc).replace(self._api_key, "***") if self._api_key else str(exc)
            logger.warning("NewsData fetch failed for %s: %s", category.slug, safe)
            raise NewsProviderError(safe) from None

        payload = resp.json()
        if payload.get("status") != "success":
            raise NewsProviderError(payload.get("message") or "NewsData error")

        articles = payload.get("results", []) or []
        return [self._map(a) for a in articles[:limit] if a.get("link")]

    @staticmethod
    def _map(raw: dict) -> RawArticle:
        published_at = None
        if iso := raw.get("pubDate"):
            try:
                published_at = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass
        return RawArticle(
            url=raw.get("link", ""),
            headline=(raw.get("title") or "").strip()[:500],
            description=(raw.get("description") or None),
            image_url=raw.get("image_url"),
            source_name=(raw.get("source_id") or None),
            published_at=published_at,
            provider="newsdata",
        )
