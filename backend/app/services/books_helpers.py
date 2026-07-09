"""Non-route helpers for the books library router."""
from __future__ import annotations

import json
import logging
import re
import string
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app import models

logger = logging.getLogger(__name__)

# Strip-set used for "is this the same word?" comparison.
_DEDUP_STRIP = string.punctuation + string.whitespace

_LOOKUP_USER_AGENT = (
    "LifeTrackerDictionaryBot/1.0 "
    "(+https://github.com/Begzod10/life-tracker; contact: rimefara22@gmail.com)"
)


def _norm_word_for_dedup(s: str) -> str:
    return (s or "").strip().strip(_DEDUP_STRIP).lower()


def _try_ai_json(prompt: str, word: str) -> tuple[str, str]:
    try:
        from app.tasks import _generate_text
    except Exception:
        return ("", "")
    try:
        text = _generate_text(prompt, max_tokens=180, temperature=0.3)
    except Exception as exc:
        logger.warning("_try_ai_json: AI call failed for %r: %s", word, exc)
        return ("", "")
    if not text:
        return ("", "")

    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return ("", "")
    try:
        data = json.loads(match.group(0))
    except Exception:
        return ("", "")

    definition = str(data.get("definition") or "").strip()
    translation = str(data.get("translation") or "").strip()
    if not definition:
        logger.info(
            "_try_ai_json: parsed but definition empty for %r — raw=%r",
            word,
            text[:200],
        )
    return (definition, translation)


def _ai_word_lookup(word: str, context: Optional[str] = None) -> tuple[str, str]:
    try:
        from app.tasks import _generate_text
    except Exception:
        return ("", "")

    cleaned = (word or "").strip().strip(_DEDUP_STRIP)
    safe_word = cleaned.replace('"', "'") or (word or "").strip()
    if not safe_word:
        return ("", "")
    ctx_line = f'\nContext: "{context.strip()}"' if context and context.strip() else ""

    prompt_json = (
        f'Generate a dictionary entry for the English word/phrase: "{safe_word}"'
        f'{ctx_line}\n\n'
        'Rules:\n'
        '- If the word is a common noun/verb/adj, give a normal definition + translation.\n'
        '- If it is a proper noun (person, place, brand), the definition should '
        "name what it refers to in <= 12 words; translation should just be a "
        "transliteration in Uzbek + Russian (e.g. \"Bogues / Богус\").\n"
        '- If it is a multi-word phrase, define the phrase itself, not the '
        'first word — e.g. "plow through water" -> a definition for the '
        'whole phrase.\n'
        '- Drop trailing punctuation from the headword when reasoning, but '
        'keep the answer concise.\n\n'
        'Return ONLY a single JSON object, no prose:\n'
        '{\n'
        '  "definition": "<one short English sentence, under 22 words>",\n'
        '  "translation": "<Uzbek translation> / <Russian translation>"\n'
        '}'
    )
    definition, translation = _try_ai_json(prompt_json, safe_word)
    if definition:
        return (definition, translation)

    prompt_plain = (
        f'Define the English word or phrase "{safe_word}" in one short '
        f'sentence, under 22 words. Reply with the definition only — '
        f'no quotes, no labels, no JSON.{ctx_line}'
    )
    try:
        from app.tasks import _generate_text
        plain = _generate_text(prompt_plain, max_tokens=80, temperature=0.2)
    except Exception as exc:
        logger.warning("_ai_word_lookup: plain-prose fallback failed: %s", exc)
        return ("", "")
    plain = (plain or "").strip().strip('"').strip("'").strip()
    if plain and len(plain) >= 4:
        return (plain, "")
    return ("", "")


def _http_get_json(url: str, *, timeout: float = 8.0, headers: Optional[dict] = None, attempts: int = 2):
    import requests
    merged_headers = {"User-Agent": _LOOKUP_USER_AGENT}
    if headers:
        merged_headers.update(headers)
    last_exc: Optional[Exception] = None
    for _ in range(max(1, attempts)):
        try:
            resp = requests.get(url, timeout=timeout, headers=merged_headers)
            if resp.status_code != 200:
                logger.info("_http_get_json: %s returned HTTP %s", url, resp.status_code)
                return None
            return resp.json()
        except Exception as exc:
            last_exc = exc
            continue
    if last_exc is not None:
        logger.warning("_http_get_json: all attempts failed for %s: %s", url, last_exc)
    return None


def _dictionary_api_lookup(word: str) -> str:
    try:
        clean = (word or "").strip().strip(_DEDUP_STRIP)
        if len(clean) < 2:
            return ""
        data = _http_get_json(f"https://api.dictionaryapi.dev/api/v2/entries/en/{clean}")
        if not isinstance(data, list) or not data:
            return ""
        for entry in data:
            for meaning in (entry.get("meanings") or []):
                for d in (meaning.get("definitions") or []):
                    text = (d.get("definition") or "").strip()
                    if text:
                        return text
        return ""
    except Exception as exc:
        logger.warning("_dictionary_api_lookup failed for %r: %s", word, exc)
        return ""


def _wiktionary_lookup(word: str) -> str:
    try:
        clean = (word or "").strip().strip(_DEDUP_STRIP)
        if len(clean) < 2:
            return ""
        data = _http_get_json(
            f"https://en.wiktionary.org/api/rest_v1/page/definition/{clean}",
            headers={"Accept": "application/json"},
        )
        if not isinstance(data, dict):
            return ""
        entries = data.get("en")
        if not isinstance(entries, list):
            return ""
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            for defn in (entry.get("definitions") or []):
                if not isinstance(defn, dict):
                    continue
                raw = (defn.get("definition") or "").strip()
                if not raw:
                    continue
                cleaned = re.sub(r"<(style|script)[^>]*>.*?</\1>", "", raw, flags=re.IGNORECASE | re.DOTALL)
                cleaned = re.sub(r"<[^>]+>", "", cleaned)
                text = re.sub(r"\s+", " ", cleaned).strip()
                if text:
                    return text
        return ""
    except Exception as exc:
        logger.warning("_wiktionary_lookup failed for %r: %s", word, exc)
        return ""


def _lookup_definition(word: str, context: Optional[str] = None) -> tuple[str, str]:
    ai_definition, ai_translation = _ai_word_lookup(word, context=context)
    if ai_definition:
        return (ai_definition, ai_translation)
    definition = _dictionary_api_lookup(word)
    if not definition:
        definition = _wiktionary_lookup(word)
    return (definition, ai_translation)


def _extract_pdf_metadata(path) -> dict:
    out = {"title": None, "author": None, "total_pages": 0}
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(path))
        out["total_pages"] = len(reader.pages)
        meta = reader.metadata or {}
        title = (meta.title or "").strip() if hasattr(meta, "title") else ""
        author = (meta.author or "").strip() if hasattr(meta, "author") else ""
        if title:
            out["title"] = title
        if author:
            out["author"] = author
    except Exception as exc:
        logger.warning("PDF metadata extraction failed for %s: %s", path, exc)
    return out


def _serialize_book(book: models.Book, highlight_count: int = 0) -> dict:
    progress = 0
    if book.total_pages and book.total_pages > 0:
        progress = round(min(book.current_page, book.total_pages) / book.total_pages * 100)
    return {
        "id": book.id,
        "title": book.title,
        "author": book.author,
        "total_pages": book.total_pages,
        "current_page": book.current_page,
        "status": book.status,
        "cover_url": book.cover_url,
        "isbn": book.isbn,
        "tags": book.tags,
        "notes": book.notes,
        "file_size_bytes": book.file_size_bytes,
        "last_opened_at": book.last_opened_at,
        "finished_at": book.finished_at,
        "created_at": book.created_at,
        "updated_at": book.updated_at,
        "progress_percent": progress,
        "highlight_count": highlight_count,
        "resume_text": book.resume_text,
        "resume_page": book.resume_page,
    }


def _own_book_or_404(db: Session, user_id: int, book_id: int) -> models.Book:
    book = db.query(models.Book).filter(
        models.Book.id == book_id,
        models.Book.person_id == user_id,
        models.Book.deleted == False,
    ).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


def _highlight_counts_for(db: Session, user_id: int, book_ids: List[int]) -> dict:
    if not book_ids:
        return {}
    rows = (
        db.query(models.BookHighlight.book_id, func.count(models.BookHighlight.id))
        .filter(
            models.BookHighlight.person_id == user_id,
            models.BookHighlight.book_id.in_(book_ids),
        )
        .group_by(models.BookHighlight.book_id)
        .all()
    )
    return {bid: count for bid, count in rows}


def _serialize_highlight(
    h: models.BookHighlight,
    translation: Optional[str] = None,
    definition: Optional[str] = None,
) -> dict:
    return {
        "id": h.id,
        "book_id": h.book_id,
        "page": h.page,
        "text": h.text,
        "note": h.note,
        "kind": h.kind,
        "color": h.color,
        "dictionary_word_id": h.dictionary_word_id,
        "translation": translation,
        "definition": definition,
        "source_sentence": h.source_sentence,
        "created_at": h.created_at,
    }
