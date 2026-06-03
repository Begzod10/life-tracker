"""GNews.io client.

Two endpoints used:
  * top-headlines?topic=...  — for category.mode == 'native'
  * search?q=...             — for category.mode == 'search'

Free tier: 100 req/day, production-allowed. Our daily fetch budget at full
9-category subscription is ~9 calls, so headroom is large.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Optional

import requests

from app.config import settings
from app.services.news.base import NewsProvider, NewsProviderError, RawArticle


logger = logging.getLogger(__name__)

GNEWS_BASE = "https://gnews.io/api/v4"

# GNews puts the API key in the query string (?apikey=...). When the upstream
# returns 4xx/5xx, requests.exceptions stringify the full URL — which means a
# naive logger.warning(exc) leaks the credential into log files and crash
# reports. Scrub the value before logging or re-raising.
_APIKEY_RE = re.compile(r"(apikey=)[^&\s]+", re.IGNORECASE)


def _scrub(text: str) -> str:
    return _APIKEY_RE.sub(r"\1***", text)


class GNewsProvider(NewsProvider):
    name = "gnews"

    def __init__(self, api_key: Optional[str] = None) -> None:
        self._api_key = api_key or settings.GNEWS_API_KEY

    @property
    def configured(self) -> bool:
        return bool(self._api_key)

    def fetch(self, category, *, limit: int) -> list[RawArticle]:
        if not self.configured:
            return []

        params: dict = {
            "apikey": self._api_key,
            "lang": "en",
            "max": min(limit, 10),  # GNews caps `max` at 10 per call on free
        }

        if category.mode == "native":
            if not category.gnews_topic:
                # Native category that wasn't mapped for GNews — skip
                # silently; the fallback provider may still have it.
                return []
            url = f"{GNEWS_BASE}/top-headlines"
            params["topic"] = category.gnews_topic
        elif category.mode == "search":
            if not category.search_query:
                return []
            url = f"{GNEWS_BASE}/search"
            params["q"] = category.search_query
        else:
            return []

        try:
            resp = requests.get(url, params=params, timeout=15)
            resp.raise_for_status()
        except requests.RequestException as exc:
            # Never let the API key leak into logs / re-raised messages —
            # the URL in the exception contains ?apikey=... by construction.
            safe_msg = _scrub(str(exc))
            logger.warning("GNews fetch failed for %s: %s", category.slug, safe_msg)
            raise NewsProviderError(safe_msg) from None

        articles = resp.json().get("articles", []) or []
        return [self._map(a) for a in articles if a.get("url")]

    @staticmethod
    def _map(raw: dict) -> RawArticle:
        published_at = None
        if iso := raw.get("publishedAt"):
            try:
                # GNews returns Z-suffixed ISO 8601.
                published_at = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                pass
        source = raw.get("source") or {}
        return RawArticle(
            url=raw.get("url", ""),
            headline=(raw.get("title") or "").strip()[:500],
            description=(raw.get("description") or None),
            image_url=raw.get("image"),
            source_name=(source.get("name") if isinstance(source, dict) else None),
            published_at=published_at,
            provider="gnews",
        )
