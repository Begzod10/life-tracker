"""AI-powered sentence generation for grammar drill sessions.

For each word in a grammar_drill session, calls the LLM once to produce a
unique correct sentence + the same sentence with one targeted error injected.
This replaces the static fallback templates that caused all 10 exercises to
be identical when words had no stored examples.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import httpx

_log = logging.getLogger(__name__)

_CATEGORY_INSTRUCTIONS: dict[str, str] = {
    "articles":    "remove or change one article (a / an / the) to make it wrong",
    "prepositions":"swap one preposition to a wrong one (e.g. rely on → rely in, depend on → depend at)",
    "word_forms":  "change one word to the wrong grammatical form (e.g. adjective where a noun is needed)",
    "connectors":  "create a double-connector error: add 'but' after a concessive clause ('While X, but Y')",
    "comparatives":"create a double-comparative error: add 'more' before a comparative adjective/adverb",
}


def generate_drill_pairs(
    words: list[Any],
    category: str,
    api_key: str,
    model: str,
    base_url: str,
) -> dict[int, dict[str, str]]:
    """Return {word_id: {"correct": str, "errored": str}} for all words.

    Makes a single LLM call. On any failure, returns {} so the caller falls
    back to the existing regex injection path.
    """
    if not words or not api_key:
        return {}

    instruction = _CATEGORY_INSTRUCTIONS.get(category, f"introduce one {category} error")

    # Build numbered input so the model can key results back to word IDs.
    word_entries = {str(w.id): getattr(w, "word", "") for w in words}

    system = (
        "You are an IELTS Task 2 grammar drill generator. "
        "You create error-correction exercises for academic English learners. "
        "Each exercise has a correct sentence and an errored version with exactly ONE mistake."
    )

    user = (
        f"Grammar category: {category.upper()}\n"
        f"Error instruction: {instruction}\n\n"
        "For each phrase/word below, write:\n"
        "  \"correct\" — a grammatically perfect academic sentence (15–22 words) that "
        "naturally uses or follows on from the given phrase. "
        "Each sentence MUST be different from all others.\n"
        "  \"errored\" — the EXACT SAME sentence with exactly ONE error introduced "
        "according to the grammar category above. Only one word changes.\n\n"
        "Return ONLY valid JSON with this exact structure "
        "(use the phrase IDs as keys):\n"
        + json.dumps({k: {"correct": "...", "errored": "..."} for k in word_entries}, indent=2)
        + "\n\nPhrases:\n"
        + "\n".join(f"  {wid}: {phrase}" for wid, phrase in word_entries.items())
    )

    url = base_url.rstrip("/") + "/chat/completions"
    try:
        resp = httpx.post(
            url,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user",   "content": user},
                ],
                "temperature": 0.85,
                "max_tokens": 1400,
                "response_format": {"type": "json_object"},
            },
            timeout=28.0,
        )
        resp.raise_for_status()
        raw: dict = json.loads(resp.json()["choices"][0]["message"]["content"])
    except Exception as exc:
        _log.warning("grammar_drill AI generation failed (%s): %s", category, exc)
        return {}

    result: dict[int, dict[str, str]] = {}
    for w in words:
        entry = raw.get(str(w.id))
        if (
            isinstance(entry, dict)
            and isinstance(entry.get("correct"), str)
            and isinstance(entry.get("errored"), str)
            and entry["correct"].strip()
            and entry["errored"].strip()
            and entry["correct"] != entry["errored"]
        ):
            result[w.id] = {"correct": entry["correct"].strip(), "errored": entry["errored"].strip()}

    if len(result) < len(words):
        _log.warning(
            "grammar_drill AI returned %d/%d pairs for category %s",
            len(result), len(words), category,
        )
    return result
