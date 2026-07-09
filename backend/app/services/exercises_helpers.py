"""Exercise session helpers — word selection, collocation generation, AI grading."""
import json
import logging
import re
from datetime import datetime
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.services.exercise_types import GRAMMAR_ERROR_LABELS

logger = logging.getLogger(__name__)


def _select_words(
    db: Session,
    current_user: models.Person,
    count: int,
    source: str,
    module_id: Optional[int] = None,
    folder_id: Optional[int] = None,
    difficulty: Optional[str] = None,
) -> list[models.DictionaryWord]:
    q = db.query(models.DictionaryWord).filter(
        models.DictionaryWord.person_id == current_user.id,
        models.DictionaryWord.deleted == False,
    )
    if module_id is not None:
        q = q.filter(models.DictionaryWord.module_id == module_id)
    if folder_id is not None:
        q = q.join(
            models.DictionaryModule,
            models.DictionaryWord.module_id == models.DictionaryModule.id,
        ).filter(models.DictionaryModule.folder_id == folder_id)
    if difficulty:
        q = q.filter(models.DictionaryWord.difficulty == difficulty)

    if source == "due":
        q = q.filter(or_(
            models.DictionaryWord.next_review_at.is_(None),
            models.DictionaryWord.next_review_at <= datetime.utcnow(),
        ))

    all_words = q.all()

    if source == "weak":
        def is_weak(w: models.DictionaryWord) -> bool:
            if w.review_count == 0:
                return True
            return (w.correct_count / w.review_count) < 0.7
        all_words = [w for w in all_words if is_weak(w)]

    if not all_words:
        raise HTTPException(
            status_code=400,
            detail="No words available. Add some words or relax the filters.",
        )

    now = datetime.utcnow()

    def priority_bucket(w: models.DictionaryWord) -> int:
        if w.next_review_at is not None and w.next_review_at <= now:
            return 0
        if w.review_count == 0:
            return 1
        return 2

    all_words.sort(key=lambda w: (
        priority_bucket(w),
        w.review_count,
        w.last_reviewed_at or w.created_at,
    ))
    return all_words[:count]


def _serialize_item_for_client(plan_item: dict, word: models.DictionaryWord) -> dict:
    """Strip correct_answer; return only what the client needs to render the question."""
    out = {k: v for k, v in plan_item.items() if k != "correct_answer"}
    return out


def _is_proper_noun(word: str) -> bool:
    """Skip collocation generation for proper nouns (names, places, brands)."""
    parts = word.split()
    return all(p[0].isupper() for p in parts if p) and len(word) > 1


def _generate_collocations(words: list[models.DictionaryWord], db: Session) -> None:
    needs = [
        w for w in words
        if not ((w.word_meta or {}).get("collocations")) and not _is_proper_noun(w.word)
    ]
    if not needs or not settings.OPENAI_API_KEY:
        return
    import json as _json
    import httpx as _httpx
    word_list = [w.word for w in needs[:12]]
    base_url = (settings.OPENAI_BASE_URL or "https://api.groq.com/openai/v1").rstrip("/")
    body = {
        "model": settings.OPENAI_MODEL,
        "messages": [{
            "role": "user",
            "content": (
                "For each English word/phrase below, provide exactly 5 natural collocations "
                "as FULL phrases that include the word (e.g. for 'remarkable': "
                "'remarkable achievement', 'remarkable progress'). "
                "Return ONLY valid JSON.\n"
                f"Words: {_json.dumps(word_list)}\n"
                'Format: {"word1": ["full phrase 1", "full phrase 2", ...], "word2": [...]}'
            ),
        }],
        "temperature": 0.2,
        "max_tokens": 700,
        "response_format": {"type": "json_object"},
    }
    try:
        resp = _httpx.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}", "Content-Type": "application/json"},
            json=body,
            timeout=20.0,
        )
        resp.raise_for_status()
        result = _json.loads(resp.json()["choices"][0]["message"]["content"])
        for w in needs:
            collocations = result.get(w.word)
            if collocations and isinstance(collocations, list):
                current_meta = dict(w.word_meta or {})
                current_meta["collocations"] = [c for c in collocations if c][:5]
                w.word_meta = current_meta
        db.commit()
    except Exception as exc:
        logger.warning("collocation generation failed: %s", exc)


_GRADER_SYSTEM = """You are an encouraging English teacher grading vocabulary exercises for ESL learners (B1–B2 level, mostly Uzbek speakers).

PRIMARY GOAL: Check whether the learner used the TARGET WORD correctly. Grammar quality is secondary.

You will receive items with: exercise_type, target word, definition, and the learner's response.

## Exercise types

- sentence: Learner wrote a sentence using the target word. Focus: word used with correct meaning in a sensible context.
- constrained_sentence: Same as sentence PLUS a structural constraint (e.g., "as a question", "using passive voice", "as a conditional", "using a relative clause"). Check BOTH word usage AND that the constraint is followed.
- paraphrase: Learner rewrote a sentence using the target word. Check: original meaning preserved AND word used correctly.
- prompt_response: Learner answered an open question using the target word. Check: response is on-topic AND word is used correctly.
- error_correction: A sentence with ONE deliberate grammar mistake was shown (source_sentence). The learner rewrote it correctly. The correct_version field shows the original correct sentence. is_correct=true if the grammar error was fixed AND the rewrite is grammatically sound (exact wording not required). grammar_errors should name the type of error that was in the original errored sentence.

## Scoring rubric (usage_score 0–100)

90–100  Perfect: word used correctly, constraint met (if any), natural grammar.
75–89   Good: word used correctly, minor grammar slips (articles, prepositions, tense), constraint met.
60–74   Partial: word appears with roughly correct meaning BUT one of: constraint not met, significant grammar error, word form wrong (e.g. "parent" instead of "parents"), or meaning slightly off.
40–59   Weak: word present but meaning is wrong or sentence is too broken to evaluate.
0–39    Wrong: word missing, completely wrong meaning, or response is not a sentence.

## is_correct rules

Set is_correct=true when ALL of:
1. Target word (or a natural inflection: plural, -ed, -ing, comparative) is present.
2. Word is used with the correct meaning from the definition.
3. The sentence is understandable (minor grammar errors are OK).
4. For constrained_sentence: the constraint is followed.
5. For paraphrase: the core meaning of the source sentence is preserved.
6. usage_score >= 65.

Set is_correct=false when:
- Word is missing or used with wrong meaning.
- Sentence is incomprehensible.
- For constrained_sentence: constraint is completely ignored.
- usage_score < 65.

## Feedback rules

- ONE sentence, max 20 words.
- ALWAYS start by naming what the learner did right, then what to fix.
- Focus on the single most important issue, not every grammar mistake.
- If is_correct=true: briefly confirm the good usage.
- If is_correct=false: name the specific problem and how to fix it.
- Never be discouraging. Assume the learner tried their best.

## suggested_revision

- Provide a natural, corrected version of the learner's own sentence (preserve their idea).
- null only if usage_score >= 90.

Return ONLY valid JSON — no markdown, no prose:
{
  "items": [
    {
      "word_id": <int>,
      "is_correct": <bool>,
      "usage_score": <0..100 int>,
      "feedback": "<one sentence>",
      "suggested_revision": "<corrected version of their sentence, or null>",
      "grammar_errors": ["<error_type>", ...]
    }
  ]
}

grammar_errors must be an array (can be empty []) containing only values from this list:
articles, plural_singular, verb_tense, subject_verb_agreement, prepositions, word_form, word_order, spelling, pronoun, constraint_not_met, passive_voice, relative_clause, conditional, cohesive_device, reported_speech

Rules for grammar_errors:
- Include grammar errors actually present in the learner's response — even if is_correct=false because the target word is missing.
- "constraint_not_met" only for constrained_sentence where the constraint was ignored.
- Empty array [] if grammar is fine.
- Max 3 errors per item — list only the most impactful ones.
- IMPORTANT: Never return null for grammar_errors — always return an array (empty if no errors)."""


def _grader_user_prompt(items: list[dict]) -> str:
    lines = ["Grade the following:\n"]
    for it in items:
        lines.append(f"- word_id: {it['word_id']}")
        lines.append(f"  exercise_type: {it['exercise_type']}")
        lines.append(f"  word: {it['word']}")
        if it.get("part_of_speech"):
            lines.append(f"  part_of_speech: {it['part_of_speech']}")
        lines.append(f"  definition: {it['definition']}")
        if it.get("constraint"):
            lines.append(f"  constraint: {it['constraint']}")
        if it.get("source_sentence"):
            lines.append(f"  source_sentence: {it['source_sentence']}")
        if it.get("correct_version"):
            lines.append(f"  correct_version: {it['correct_version']}")
        lines.append(f"  response: {it['response']}")
        lines.append("")
    return "\n".join(lines)


def _coerce_grade(raw: dict, fallback_id: int) -> dict:
    _VALID_GRAMMAR_ERRORS = frozenset(GRAMMAR_ERROR_LABELS.keys())

    word_id = int(raw.get("word_id") or fallback_id)
    is_correct = bool(raw.get("is_correct"))
    score = raw.get("usage_score")
    try:
        score_int = max(0, min(100, int(score))) if score is not None else None
    except (TypeError, ValueError):
        score_int = None
    feedback = (raw.get("feedback") or "").strip() or None
    revision = raw.get("suggested_revision")
    if isinstance(revision, str):
        revision = revision.strip() or None
    else:
        revision = None
    raw_errors = raw.get("grammar_errors")
    if isinstance(raw_errors, list):
        grammar_errors = [e for e in raw_errors if isinstance(e, str) and e in _VALID_GRAMMAR_ERRORS] or None
    else:
        grammar_errors = None
    return {
        "word_id": word_id,
        "is_correct": is_correct,
        "usage_score": score_int,
        "feedback": feedback,
        "suggested_revision": revision,
        "grammar_errors": grammar_errors,
    }


async def _grade_via_openai(grader_items: list[dict]) -> list[dict]:
    from openai import (
        AsyncOpenAI,
        APIConnectionError,
        APIError,
        AuthenticationError,
        RateLimitError,
    )
    import httpx

    http_client = None
    if settings.OPENAI_PROXY_URL:
        http_client = httpx.AsyncClient(proxy=settings.OPENAI_PROXY_URL)

    client = AsyncOpenAI(
        api_key=settings.OPENAI_API_KEY,
        base_url=settings.OPENAI_BASE_URL or None,
        http_client=http_client,
    )
    max_tokens = max(900, 250 + 250 * len(grader_items))
    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": _GRADER_SYSTEM},
                {"role": "user", "content": _grader_user_prompt(grader_items)},
            ],
            max_tokens=max_tokens,
            temperature=0.2,
            response_format={"type": "json_object"},
        )
    except AuthenticationError as exc:
        logger.error("OpenAI auth failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Grader auth failed: {exc}",
        ) from exc
    except RateLimitError as exc:
        logger.error("OpenAI rate-limited: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Grader rate-limited: {exc}",
        ) from exc
    except APIConnectionError as exc:
        logger.error("OpenAI unreachable: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=f"Grader unreachable: {exc}",
        ) from exc
    except APIError as exc:
        logger.error("OpenAI API error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Grader API error: {exc}",
        ) from exc

    if not response.choices:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Grader returned no choices.",
        )
    choice = response.choices[0]
    raw = choice.message.content
    if not raw:
        finish = getattr(choice, "finish_reason", "unknown")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Grader returned empty content (finish_reason={finish}).",
        )
    raw = raw.strip()
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        finish = getattr(choice, "finish_reason", "unknown")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Grader returned invalid JSON (finish_reason={finish}): {raw[:200]}",
        )
    items = data.get("items") or []
    if not isinstance(items, list):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Grader payload missing 'items' list",
        )
    grades_by_id: dict[int, dict] = {}
    for i, raw_item in enumerate(items):
        if not isinstance(raw_item, dict):
            continue
        coerced = _coerce_grade(raw_item, grader_items[i]["word_id"] if i < len(grader_items) else 0)
        grades_by_id[coerced["word_id"]] = coerced

    result = []
    for src in grader_items:
        g = grades_by_id.get(src["word_id"])
        if g is None:
            g = {
                "word_id": src["word_id"],
                "is_correct": False,
                "usage_score": None,
                "feedback": "Grader did not return a verdict for this item.",
                "suggested_revision": None,
            }
        result.append(g)
    return result
