#!/usr/bin/env python3
"""
Offline script: generate word_meta (synonyms, antonyms, word forms) for dictionary words.

Usage:
    python scripts/generate_word_meta.py [--limit 100] [--dry-run]

Requires GROQ_API_KEY and DATABASE_URL in environment (or .env file in backend/).
Idempotent: skips words that already have word_meta.
Commits every 10 words so partial runs are preserved.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

# Allow running from repo root or backend/
_here = Path(__file__).resolve().parent
_backend = _here.parent
if str(_backend) not in sys.path:
    sys.path.insert(0, str(_backend))

# Load .env from backend/
from dotenv import load_dotenv
load_dotenv(_backend / ".env")

import sqlalchemy
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL")
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")


_SYSTEM = """You are a vocabulary data generator. Given a word and its definition, return a JSON object with:
{
  "synonyms": ["word1", "word2", "word3"],
  "antonyms": ["word1", "word2"],
  "forms": {
    "noun": "...",
    "verb": "...",
    "adjective": "...",
    "adverb": "..."
  }
}

Rules:
- synonyms: 2–4 common synonyms (empty list if none)
- antonyms: 1–3 antonyms (empty list if none)
- forms: fill only the forms that exist; omit keys that don't apply (null is not acceptable)
- Return ONLY the JSON object — no markdown, no prose."""


def _call_groq(word: str, definition: str, client) -> dict | None:
    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": f"word: {word}\ndefinition: {definition}"},
            ],
            max_tokens=300,
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content or ""
        data = json.loads(raw.strip())
        # Validate minimal shape
        if not isinstance(data.get("synonyms"), list):
            data["synonyms"] = []
        if not isinstance(data.get("antonyms"), list):
            data["antonyms"] = []
        if not isinstance(data.get("forms"), dict):
            data["forms"] = {}
        return data
    except Exception as exc:
        print(f"  [error] Groq call failed for '{word}': {exc}", file=sys.stderr)
        return None


def main():
    parser = argparse.ArgumentParser(description="Generate word_meta for dictionary words")
    parser.add_argument("--limit", type=int, default=100, help="Max words to process")
    parser.add_argument("--dry-run", action="store_true", help="Print words without writing")
    args = parser.parse_args()

    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set.", file=sys.stderr)
        sys.exit(1)
    if not GROQ_API_KEY:
        print("ERROR: GROQ_API_KEY not set.", file=sys.stderr)
        sys.exit(1)

    from groq import Groq
    client = Groq(api_key=GROQ_API_KEY)

    engine = create_engine(DATABASE_URL)
    Session = sessionmaker(bind=engine)
    db = Session()

    try:
        rows = db.execute(
            text("SELECT id, word, definition FROM dictionary_words WHERE word_meta IS NULL AND deleted = false LIMIT :lim"),
            {"lim": args.limit},
        ).fetchall()
    except Exception as exc:
        print(f"DB error: {exc}", file=sys.stderr)
        db.close()
        sys.exit(1)

    print(f"Found {len(rows)} words without word_meta (limit={args.limit})")
    if args.dry_run:
        for row in rows:
            print(f"  would process: {row.word} (id={row.id})")
        db.close()
        return

    updated = 0
    failed = 0
    batch: list[tuple[int, dict]] = []

    for i, row in enumerate(rows, 1):
        print(f"[{i}/{len(rows)}] {row.word}...", end=" ", flush=True)
        meta = _call_groq(row.word, row.definition, client)
        if meta is None:
            print("FAILED")
            failed += 1
        else:
            print(f"ok (synonyms={meta['synonyms'][:2]}...)")
            batch.append((row.id, meta))
            updated += 1

        # Commit every 10 words
        if len(batch) >= 10:
            _flush(db, batch)
            batch = []

        # Rate limit: ~20 req/min on free tier
        if i < len(rows):
            time.sleep(3)

    if batch:
        _flush(db, batch)

    db.close()
    print(f"\nDone. Updated: {updated}, Failed: {failed}")


def _flush(db, batch: list[tuple[int, dict]]):
    for word_id, meta in batch:
        db.execute(
            text("UPDATE dictionary_words SET word_meta = :meta WHERE id = :id"),
            {"meta": json.dumps(meta), "id": word_id},
        )
    db.commit()
    print(f"  [committed {len(batch)} rows]")


if __name__ == "__main__":
    main()
