"""Common protocol + DTOs every news provider implements.

Keeping providers behind one Protocol means the pipeline doesn't care which
vendor a category resolved to — it just calls `.fetch(category, limit)`. New
providers (Currents, NewsData, RSS) drop in by implementing the same method.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Protocol


class NewsProviderError(RuntimeError):
    """Raised by a provider when the upstream call fails. The pipeline
    catches this so one bad provider doesn't kill the whole daily run —
    the next provider in the fallback chain takes over."""


@dataclass(frozen=True)
class RawArticle:
    """
    Normalized article shape. Every provider maps its native response
    into this; downstream code (dedup, summarizer, persistence) never
    touches provider-specific fields.
    """
    url: str
    headline: str
    description: Optional[str]
    image_url: Optional[str]
    source_name: Optional[str]
    published_at: Optional[datetime]
    provider: str            # "gnews" | "newsapi" | ...


class NewsProvider(Protocol):
    """All providers expose the same fetch signature."""

    name: str

    def fetch(self, category, *, limit: int) -> list[RawArticle]:
        """
        Return up to `limit` articles for `category`.

        `category` is the SQLAlchemy NewsCategory ORM row — providers read
        whichever of (gnews_topic, newsapi_category, search_query) is
        relevant to them. A provider that can't serve this category
        (e.g. NewsAPI on a search-only category for which we want a
        different query) should return an empty list, not raise.

        Raise NewsProviderError only on transport/quota failures so the
        pipeline can fall over to the next provider.
        """
        ...
