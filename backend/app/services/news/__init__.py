"""News pipeline: fetch from NewsData + Hacker News, summarize via AI, persist per category.

Top-level exports keep call sites short — the Celery task and the router
only need `run_daily_fetch` and the provider error types.
"""
from app.services.news.pipeline import run_daily_fetch, FetchSummary  # noqa: F401
from app.services.news.base import RawArticle, NewsProvider, NewsProviderError  # noqa: F401
