"""Helper functions for the essays router.

Extracted to keep routers/essays.py under 800 lines. All symbols are
re-imported there so callers inside that module need no changes.
"""
import json
import re
from datetime import datetime
from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy import desc, or_
from sqlalchemy.orm import Session

from app import models

# ─── Constants ───────────────────────────────────────────────────────────────

ALLOWED_LEVELS = {"A1", "A2", "B1", "B2", "C1", "C2"}
DEFAULT_WORD_COUNT_BY_LEVEL = {
    "A1": 80, "A2": 120, "B1": 180, "B2": 250, "C1": 320, "C2": 400,
}

DUPLICATE_JACCARD_THRESHOLD = 0.35
_STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for",
    "with", "without", "your", "you", "yours", "their", "there", "this", "that",
    "these", "those", "is", "are", "was", "were", "be", "been", "being", "have",
    "has", "had", "do", "does", "did", "about", "what", "which", "who", "whom",
    "how", "why", "when", "where", "from", "by", "as", "so", "if", "than", "then",
    "into", "out", "up", "down", "over", "under", "again", "further", "more",
    "most", "some", "any", "each", "few", "other", "such", "no", "not", "only",
    "own", "same", "very", "can", "will", "just", "would", "should", "could",
    "write", "essay", "describe", "discuss", "explain", "topic", "prompt",
}

DRILL_SR_LADDER_DAYS = [1, 2, 4, 7, 14, 30, 60]


# ─── Text utilities ──────────────────────────────────────────────────────────

def _count_words(body: str) -> int:
    if not body:
        return 0
    return len(re.findall(r"\b[\w'\-]+\b", body, flags=re.UNICODE))


def _normalize_prompt(text: str) -> str:
    if not text:
        return ""
    cleaned = re.sub(r"[^\w\s]", " ", text.lower(), flags=re.UNICODE)
    return re.sub(r"\s+", " ", cleaned).strip()


def _meaningful_tokens(text: str) -> set:
    return {t for t in _normalize_prompt(text).split() if t and t not in _STOPWORDS and len(t) > 2}


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    inter = a & b
    union = a | b
    if not union:
        return 0.0
    return len(inter) / len(union)


def _parse_json_field(raw: Optional[str]):
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


def _strip_json_fence(raw: str) -> str:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if "\n" in cleaned:
            first, rest = cleaned.split("\n", 1)
            if first.strip().lower() in {"json", ""}:
                cleaned = rest
    return cleaned


# ─── DB helpers ──────────────────────────────────────────────────────────────

def _find_duplicate_essay(
    db: Session,
    user_id: int,
    candidate_prompt: str,
    candidate_title: Optional[str] = None,
    threshold: float = DUPLICATE_JACCARD_THRESHOLD,
) -> Optional[models.Essay]:
    candidate_tokens = _meaningful_tokens(candidate_prompt) | _meaningful_tokens(candidate_title or "")
    if not candidate_tokens:
        return None

    rows = db.query(models.Essay).filter(
        models.Essay.person_id == user_id,
        models.Essay.deleted == False,
    ).all()

    candidate_norm = _normalize_prompt(candidate_prompt)
    best: tuple = (0.0, None)
    for row in rows:
        row_norm = _normalize_prompt(row.prompt)
        if candidate_norm and candidate_norm == row_norm:
            return row
        row_tokens = _meaningful_tokens(row.prompt) | _meaningful_tokens(row.title or "")
        score = _jaccard(candidate_tokens, row_tokens)
        if score > best[0]:
            best = (score, row)
    return best[1] if best[0] >= threshold else None


def _summarize_existing_essays(db: Session, user_id: int, limit: int = 25) -> List[str]:
    rows = (
        db.query(models.Essay)
        .filter(
            models.Essay.person_id == user_id,
            models.Essay.deleted == False,
        )
        .order_by(desc(models.Essay.updated_at), desc(models.Essay.created_at))
        .limit(limit)
        .all()
    )
    out: List[str] = []
    for r in rows:
        label = (r.title or "").strip() or (r.prompt or "").strip().split("\n")[0][:120]
        if label:
            out.append(label)
    return out


def _own_essay_or_404(db: Session, user_id: int, essay_id: int) -> models.Essay:
    e = db.query(models.Essay).filter(
        models.Essay.id == essay_id,
        models.Essay.person_id == user_id,
        models.Essay.deleted == False,
    ).first()
    if not e:
        raise HTTPException(status_code=404, detail="Essay not found.")
    return e


def _require_ai_provider():
    from app.config import settings
    if not (settings.GEMINI_API_KEY or settings.OPENAI_API_KEY or settings.GROQ_API_KEY):
        raise HTTPException(
            status_code=503,
            detail="AI provider not configured. Set GEMINI_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY.",
        )


def _pick_target_words(db: Session, user_id: int, level: str, limit: int = 6) -> List[str]:
    rows = db.query(models.DictionaryWord).filter(
        models.DictionaryWord.person_id == user_id,
        models.DictionaryWord.deleted == False,
        or_(
            models.DictionaryWord.next_review_at.is_(None),
            models.DictionaryWord.next_review_at <= datetime.utcnow(),
        ),
    ).all()
    level_order = ["A1", "A2", "B1", "B2", "C1", "C2"]
    try:
        target_idx = level_order.index(level)
    except ValueError:
        target_idx = 2

    def distance(w):
        try:
            return abs(level_order.index(w.difficulty) - target_idx)
        except ValueError:
            return 99

    def weakness(w):
        if w.review_count == 0:
            return 0
        return -(w.correct_count / w.review_count)

    rows.sort(key=lambda w: (distance(w), weakness(w)))
    return [w.word for w in rows[:limit]]


# ─── Serializers ─────────────────────────────────────────────────────────────

def _serialize(e: models.Essay) -> dict:
    return {
        "id": e.id,
        "title": e.title,
        "prompt": e.prompt,
        "body": e.body,
        "level": e.level,
        "target_word_count": e.target_word_count,
        "target_words": _parse_json_field(e.target_words) or [],
        "status": e.status,
        "word_count": e.word_count,
        "quick_score": e.quick_score,
        "quick_feedback": _parse_json_field(e.quick_feedback),
        "deep_score": e.deep_score,
        "deep_review": _parse_json_field(e.deep_review),
        "time_spent_seconds": e.time_spent_seconds,
        "created_at": e.created_at,
        "updated_at": e.updated_at,
        "submitted_at": e.submitted_at,
    }


def _serialize_plan(p: Optional[models.EssayPlan], essay_id: int) -> dict:
    if p is None:
        return {
            "essay_id": essay_id,
            "thesis": None,
            "body_plans": [],
            "conclusion_plan": None,
            "updated_at": None,
            "created_at": None,
        }
    return {
        "essay_id": p.essay_id,
        "thesis": p.thesis,
        "body_plans": _parse_json_field(p.body_plans) or [],
        "conclusion_plan": p.conclusion_plan,
        "updated_at": p.updated_at,
        "created_at": p.created_at,
    }


def _serialize_attempt(a: models.EssayAttempt) -> dict:
    return {
        "id": a.id,
        "essay_id": a.essay_id,
        "kind": a.kind,
        "score": a.score,
        "level_estimate": a.level_estimate,
        "word_count": a.word_count,
        "payload": _parse_json_field(a.payload),
        "created_at": a.created_at,
    }


def _serialize_error(err: models.EssayError) -> dict:
    return {
        "id": err.id,
        "attempt_id": err.attempt_id,
        "essay_id": err.essay_id,
        "kind": err.kind,
        "original": err.original,
        "explanation": err.explanation,
        "suggestion": err.suggestion,
        "level": err.level,
        "created_at": err.created_at,
        "review_count": err.review_count,
        "correct_count": err.correct_count,
        "interval_days": err.interval_days,
        "last_reviewed_at": err.last_reviewed_at,
        "next_review_at": err.next_review_at,
        "archived": err.archived,
    }


# ─── Plan helpers ─────────────────────────────────────────────────────────────

def _load_plan(db: Session, user_id: int, essay_id: int) -> Optional[models.EssayPlan]:
    return (
        db.query(models.EssayPlan)
        .filter(
            models.EssayPlan.essay_id == essay_id,
            models.EssayPlan.person_id == user_id,
        )
        .first()
    )


def _format_plan_for_ai(plan: Optional[models.EssayPlan]) -> str:
    if plan is None:
        return ""
    body_plans = _parse_json_field(plan.body_plans) or []
    if not (plan.thesis or plan.conclusion_plan or body_plans):
        return ""

    lines: List[str] = ["The learner's own outline before writing:"]
    if plan.thesis:
        lines.append(f"- Thesis / position: {plan.thesis.strip()}")
    for i, body in enumerate(body_plans, start=1):
        if not isinstance(body, dict):
            continue
        label = (body.get("label") or f"Body paragraph {i}").strip() or f"Body paragraph {i}"
        lines.append(f"- {label}")
        for slot_key, slot_label in (
            ("claim", "Claim (why)"),
            ("what_kind", "What kind (specifics)"),
            ("so_what", "So what (consequences)"),
            ("what_if", "What if (counterfactual)"),
        ):
            val = (body.get(slot_key) or "").strip()
            if val:
                lines.append(f"    • {slot_label}: {val}")
    if plan.conclusion_plan:
        lines.append(f"- Conclusion plan: {plan.conclusion_plan.strip()}")
    return "\n".join(lines) + "\n\n"


# ─── SRS drill scheduling ────────────────────────────────────────────────────

def _next_drill_interval_days(prev_interval: int, was_correct: bool) -> int:
    if not was_correct:
        return 1
    if prev_interval <= 0:
        return DRILL_SR_LADDER_DAYS[0]
    if prev_interval in DRILL_SR_LADDER_DAYS:
        i = DRILL_SR_LADDER_DAYS.index(prev_interval)
        return DRILL_SR_LADDER_DAYS[i + 1] if i + 1 < len(DRILL_SR_LADDER_DAYS) else prev_interval * 2
    return prev_interval * 2


# ─── AI prompt builders ──────────────────────────────────────────────────────

def _prompt_topic_prompt(
    level: str,
    hint: Optional[str],
    target_words: List[str],
    word_count: int,
    existing_topics: Optional[List[str]] = None,
) -> str:
    hint_clause = f"Topic hint: \"{hint}\".\n" if hint else ""
    words_clause = (
        f"If natural, the prompt should invite the learner to use words like: {', '.join(target_words)}.\n"
        if target_words else ""
    )
    avoid_clause = ""
    if existing_topics:
        bullet_list = "\n".join(f"- {t}" for t in existing_topics[:25])
        avoid_clause = (
            "The learner has already written or started essays on the topics below — "
            "do NOT propose anything that overlaps in subject or angle with these. "
            "Pick a clearly different theme.\n"
            f"{bullet_list}\n\n"
        )
    return (
        f"You design English essay prompts for a learner at CEFR level {level}.\n"
        f"{hint_clause}{words_clause}{avoid_clause}"
        f"Write ONE essay prompt (1-3 sentences) appropriate for {level} that is interesting, "
        f"specific, and answerable in roughly {word_count} words. Avoid generic clichés.\n\n"
        f"Return ONLY a JSON object (no markdown):\n"
        f"{{ \"prompt\": string, \"title\": string }}"
    )


def _quick_check_prompt(level: str, prompt: str, body: str, target_words: List[str]) -> str:
    tw_clause = (
        f"Target vocabulary the learner aimed to use: {', '.join(target_words)}.\n"
        if target_words else ""
    )
    return (
        f"You are an encouraging English writing coach grading at CEFR level {level}.\n"
        f"Essay prompt:\n\"\"\"\n{prompt}\n\"\"\"\n\n"
        f"{tw_clause}"
        f"Student essay:\n\"\"\"\n{body}\n\"\"\"\n\n"
        f"Provide a fast assessment. Return ONLY this JSON object (no markdown):\n"
        f"{{\n"
        f"  \"score\": number,            // 0-100, holistic\n"
        f"  \"level_estimate\": string,    // CEFR estimate of the writing\n"
        f"  \"strengths\": [string, string, string],\n"
        f"  \"improvements\": [string, string, string],\n"
        f"  \"suggestions\": [string, string, string]   // concrete next-step advice\n"
        f"}}"
    )


def _deep_review_prompt(
    level: str,
    prompt: str,
    body: str,
    target_words: List[str],
    plan_text: str = "",
) -> str:
    tw_clause = (
        f"Target vocabulary the learner aimed to use: {', '.join(target_words)}.\n"
        if target_words else ""
    )
    plan_clause = ""
    structure_block = ""
    if plan_text:
        plan_clause = plan_text
        structure_block = (
            "  \"structure_coverage\": {        // does the essay actually deliver the learner's plan?\n"
            "     \"overall_score\": number,    // 0-25, holistic plan→essay alignment\n"
            "     \"thesis_present\": boolean,\n"
            "     \"conclusion_present\": boolean,\n"
            "     \"bodies\": [                  // one entry per body paragraph in the learner's plan\n"
            "        {\n"
            "           \"label\": string,\n"
            "           \"claim_covered\": boolean,\n"
            "           \"what_kind_covered\": boolean,\n"
            "           \"so_what_covered\": boolean,\n"
            "           \"what_if_covered\": boolean,\n"
            "           \"notes\": string         // 1 short sentence on what's missing or weak\n"
            "        }\n"
            "     ],\n"
            "     \"summary\": string             // 1-2 sentences on structure quality overall\n"
            "  },\n"
        )
    return (
        f"You are a meticulous English writing teacher reviewing at CEFR level {level}.\n"
        f"Essay prompt:\n\"\"\"\n{prompt}\n\"\"\"\n\n"
        f"{tw_clause}{plan_clause}"
        f"Student essay:\n\"\"\"\n{body}\n\"\"\"\n\n"
        f"Provide a detailed review. Return ONLY this JSON object (no markdown):\n"
        f"{{\n"
        f"  \"score\": number,                // 0-100\n"
        f"  \"level_estimate\": string,        // CEFR\n"
        f"  \"criteria\": {{\n"
        f"     \"task_response\": number,      // 0-25\n"
        f"     \"coherence_cohesion\": number, // 0-25\n"
        f"     \"vocabulary\": number,         // 0-25\n"
        f"     \"grammar\": number             // 0-25\n"
        f"  }},\n"
        f"{structure_block}"
        f"  \"overall\": string,                // 2-4 sentence verdict\n"
        f"  \"sentences\": [                    // up to 8 of the most important fixes\n"
        f"     {{\n"
        f"        \"original\": string,\n"
        f"        \"issue\": string,            // 'grammar' | 'vocab' | 'style' | 'cohesion' | 'clarity'\n"
        f"        \"explanation\": string,\n"
        f"        \"suggestion\": string\n"
        f"     }}\n"
        f"  ],\n"
        f"  \"vocabulary_upgrades\": [           // up to 5 stronger word/phrase swaps\n"
        f"     {{ \"from\": string, \"to\": string, \"why\": string }}\n"
        f"  ]\n"
        f"}}"
    )
