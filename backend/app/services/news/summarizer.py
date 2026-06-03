"""AI summarizer for fetched articles.

Reuses `_generate_text` from `app.tasks` so the news section walks the same
Gemini → OpenAI → Groq fallback chain as the daily conclusion. The prompt is
written defensively — explicit "do not invent facts" — to match the user's
standing "never invent data" rule.

Failure mode: returns the raw description (truncated) instead of an AI
summary. The user-facing card always has *something*, and the pipeline
never blocks waiting on AI to recover.
"""
from __future__ import annotations

import logging
from typing import Optional


logger = logging.getLogger(__name__)


SUMMARY_PROMPT = (
    "You are summarizing one news article in 2 short sentences (max 50 words "
    "total). Be neutral, do not add facts that are not in the source, do not "
    "speculate. Plain text only — no markdown, no headlines, no quotes.\n\n"
    "Headline: {headline}\n"
    "Description: {description}\n\n"
    "Summary:"
)


def summarize_article(headline: str, description: Optional[str]) -> Optional[str]:
    """
    Return a 2-sentence AI summary or None if AI is unconfigured / failed.
    Imports `_generate_text` lazily — top-level would cycle through
    `app.tasks` ↔ `app.services.news` on module load.
    """
    if not (headline or description):
        return None

    prompt = SUMMARY_PROMPT.format(
        headline=headline or "",
        description=(description or "(no description)"),
    )

    from app.tasks import _generate_text
    try:
        text = _generate_text(prompt, max_tokens=120, temperature=0.3)
    except Exception as exc:
        logger.warning("summarize_article failed: %s", exc)
        return None
    return text.strip() or None


def fallback_summary(description: Optional[str]) -> Optional[str]:
    """When the AI is unavailable, surface the raw description (truncated)
    rather than an empty card."""
    if not description:
        return None
    text = description.strip()
    if len(text) <= 280:
        return text
    return text[:277].rstrip() + "…"
