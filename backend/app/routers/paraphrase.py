"""IELTS paraphrase technique drill router.

Teaches 7 paraphrasing sub-techniques by presenting a sentence to rewrite
using a specific technique, then grades the attempt with AI.
"""
from __future__ import annotations

import json
import logging
import random
import re
from collections import Counter
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models
from app.dependencies import get_current_user, get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/essays/paraphrase", tags=["paraphrase"])

# ─── Data ─────────────────────────────────────────────────────────────────────

PARAPHRASE_TECHNIQUES = {
    "synonym": {
        "name": "Synonym Approach",
        "short": "Replace words with synonyms",
        "description": "Replace key nouns, verbs, and adjectives with synonyms. Keep the sentence structure exactly the same.",
        "instruction": "Rewrite the sentence using synonyms ONLY. Do NOT change the sentence structure — only swap words for their equivalents.",
        "example_original": "Many people believe that technology has changed the way we communicate.",
        "example_paraphrase": "Numerous individuals argue that modern devices have transformed the manner in which we interact.",
    },
    "structure": {
        "name": "Change the Structure",
        "short": "Rearrange the sentence",
        "description": "Change the word order or sentence structure (active→passive, reorder clauses). Keep the vocabulary the same.",
        "instruction": "Rewrite the sentence by CHANGING THE STRUCTURE ONLY (active↔passive, reorder clauses, front the object). Do NOT use synonyms — keep the same vocabulary.",
        "example_original": "Many people believe that technology has changed the way we communicate.",
        "example_paraphrase": "The way we communicate has been changed by technology, as many people believe.",
    },
    "synonym_structure": {
        "name": "Synonym + Structure",
        "short": "Both synonyms and restructuring",
        "description": "Combine both techniques: replace key words with synonyms AND change the sentence structure simultaneously.",
        "instruction": "Rewrite the sentence using BOTH synonym substitution AND structural change simultaneously. This is the strongest paraphrase technique.",
        "example_original": "Many people believe that technology has changed the way we communicate.",
        "example_paraphrase": "The impact of modern devices on human interaction is widely recognised across society.",
    },
    "word_form": {
        "name": "Change Word Form",
        "short": "Noun→verb, adjective→noun, etc.",
        "description": "Change the grammatical form of key words (noun→verb, adjective→noun/adverb). This naturally forces structural changes too.",
        "instruction": "Rewrite the sentence by changing the WORD FORM of at least two key words (e.g. 'responsibility'→'responsible', 'communicate'→'communication'). Adjust the sentence structure to accommodate the new forms.",
        "example_original": "The government should take responsibility for citizens' health.",
        "example_paraphrase": "It is the government's responsibility to ensure that citizens remain healthy.",
    },
    "there_be": {
        "name": "There Be",
        "short": "Start with 'There is/are'",
        "description": "Begin the sentence with 'There is' or 'There are' to introduce the topic existentially.",
        "instruction": "Rewrite the sentence starting with 'There is' or 'There are'. The original subject usually becomes part of a noun phrase after 'There is/are' (e.g. 'There is widespread belief that...' / 'There are those who argue...').",
        "example_original": "Many people believe that technology has changed the way we communicate.",
        "example_paraphrase": "There is widespread belief that technology has fundamentally altered the way humans interact.",
    },
    "it_is_that": {
        "name": "It is… that/who",
        "short": "Cleft sentence construction",
        "description": "Use a cleft sentence ('It is X that Y') to shift emphasis onto a specific element of the sentence.",
        "instruction": "Rewrite the sentence as a cleft sentence using 'It is… that' or 'It is… who'. Identify the key element to emphasise and place it after 'It is'.",
        "example_original": "Technology has greatly changed how people communicate in the modern age.",
        "example_paraphrase": "It is technology that has had the greatest impact on the way people communicate in today's world.",
    },
    "gerund": {
        "name": "Gerund (-ing)",
        "short": "Start the sentence with -ing",
        "description": "Begin the sentence with a gerund phrase (-ing form of a verb) to introduce the topic as an activity or process.",
        "instruction": "Rewrite the sentence so it STARTS with a gerund (-ing verb form). Convert the main action into a gerund phrase acting as the subject (e.g. 'Communicating via technology…' / 'Providing free education…').",
        "example_original": "Many people believe that universities should be free for all students.",
        "example_paraphrase": "Providing free university education for all students is a view held by a significant portion of the population.",
    },
}

PARAPHRASE_SENTENCES = [
    {"id": 1, "sentence": "Many people believe that university education should be free for all students.", "topic": "education"},
    {"id": 2, "sentence": "Technology has fundamentally changed the way people communicate with each other.", "topic": "technology"},
    {"id": 3, "sentence": "Governments should take responsibility for ensuring that all citizens live a healthy lifestyle.", "topic": "health"},
    {"id": 4, "sentence": "Rising levels of traffic congestion are causing serious problems in cities around the world.", "topic": "environment"},
    {"id": 5, "sentence": "Young people today are spending too much time on social media.", "topic": "technology"},
    {"id": 6, "sentence": "A growing number of people are choosing to live and work in other countries.", "topic": "globalisation"},
    {"id": 7, "sentence": "The gap between rich and poor people in society is becoming wider.", "topic": "society"},
    {"id": 8, "sentence": "Parents have a greater influence on children's development than schools do.", "topic": "education"},
    {"id": 9, "sentence": "Many traditional customs and cultures are disappearing due to the effects of globalisation.", "topic": "culture"},
    {"id": 10, "sentence": "Longer prison sentences are the most effective way to reduce crime in a society.", "topic": "crime"},
    {"id": 11, "sentence": "Plastic waste is causing severe damage to the world's oceans and marine life.", "topic": "environment"},
    {"id": 12, "sentence": "Many people are now choosing to work from home rather than in a traditional office.", "topic": "work"},
    {"id": 13, "sentence": "Children should learn to be competitive in order to succeed in the modern world.", "topic": "education"},
    {"id": 14, "sentence": "Wealthier countries have a responsibility to provide financial aid to poorer nations.", "topic": "globalisation"},
    {"id": 15, "sentence": "Space exploration is a waste of money that could be better spent addressing problems on Earth.", "topic": "science"},
]

_SENTENCE_BY_ID = {s["id"]: s for s in PARAPHRASE_SENTENCES}

# ─── Pydantic schemas ──────────────────────────────────────────────────────────

class NextDrillOut(BaseModel):
    technique_key: str
    technique_name: str
    technique_short: str
    technique_description: str
    technique_instruction: str
    example_original: str
    example_paraphrase: str
    sentence_id: int
    original_sentence: str
    topic: str


class GradeIn(BaseModel):
    sentence_id: int
    technique: str
    response: str


class GradeOut(BaseModel):
    id: int
    technique: str
    original_sentence: str
    response: str
    applied_correctly: Optional[bool]
    technique_check: Optional[str]
    feedback: Optional[str]
    model_answer: Optional[str]
    created_at: str

    class Config:
        from_attributes = True


class TechniqueStatOut(BaseModel):
    technique_key: str
    technique_name: str
    total: int
    correct: int
    accuracy: float


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _pick_technique(db: Session, person_id: int) -> str:
    """Return the technique least used in the user's last 21 attempts."""
    recent = (
        db.query(models.ParaphraseAttempt.technique)
        .filter(models.ParaphraseAttempt.person_id == person_id)
        .order_by(models.ParaphraseAttempt.created_at.desc())
        .limit(21)
        .all()
    )
    counts: Counter = Counter({k: 0 for k in PARAPHRASE_TECHNIQUES})
    for (t,) in recent:
        if t in counts:
            counts[t] += 1

    min_count = min(counts.values())
    least_used = [k for k, v in counts.items() if v == min_count]
    return random.choice(least_used)


def _pick_sentence(db: Session, person_id: int) -> dict:
    """Return the sentence least recently used by this user."""
    recent_sentence_ids = (
        db.query(models.ParaphraseAttempt.sentence_id)
        .filter(
            models.ParaphraseAttempt.person_id == person_id,
            models.ParaphraseAttempt.sentence_id.isnot(None),
        )
        .order_by(models.ParaphraseAttempt.created_at.desc())
        .limit(len(PARAPHRASE_SENTENCES))
        .all()
    )
    used_ids = [r[0] for r in recent_sentence_ids]
    all_ids = [s["id"] for s in PARAPHRASE_SENTENCES]

    # Prefer sentences not in recent history
    unused = [sid for sid in all_ids if sid not in used_ids]
    if unused:
        chosen_id = random.choice(unused)
    else:
        # All sentences used recently — pick the oldest-used one
        for sid in reversed(used_ids):
            if sid in _SENTENCE_BY_ID:
                chosen_id = sid
                break
        else:
            chosen_id = random.choice(all_ids)

    return _SENTENCE_BY_ID[chosen_id]


def _build_grade_prompt(
    technique_key: str,
    original_sentence: str,
    response: str,
) -> str:
    tech = PARAPHRASE_TECHNIQUES[technique_key]
    tech_name = tech["name"]
    json_shape = (
        '{\n'
        '  "applied_correctly": <true or false>,\n'
        '  "technique_check": "<one sentence: what specifically was done correctly or incorrectly about the technique>",\n'
        '  "feedback": "<1-2 sentence constructive feedback>",\n'
        f'  "model_answer": "<a correct paraphrase of the original using the {tech_name} technique>"\n'
        '}'
    )
    return (
        f"You are an IELTS paraphrase technique evaluator.\n\n"
        f"TECHNIQUE REQUIRED: {tech_name}\n"
        f"RULE: {tech['instruction']}\n"
        f"EXAMPLE (Original): {tech['example_original']}\n"
        f"EXAMPLE (Correct paraphrase using this technique): {tech['example_paraphrase']}\n\n"
        f"ORIGINAL SENTENCE: {original_sentence}\n"
        f"STUDENT'S PARAPHRASE: {response}\n\n"
        f'Evaluate whether the student correctly applied the "{tech_name}" technique.\n\n'
        f"Return ONLY valid JSON with this exact shape:\n{json_shape}"
    )


def _parse_ai_json(raw: str) -> dict:
    """Strip code fences and parse JSON. Returns a dict with keys or raw fallback."""
    cleaned = re.sub(r"```(?:json)?", "", raw).strip().rstrip("```").strip()
    try:
        return json.loads(cleaned)
    except (json.JSONDecodeError, ValueError):
        logger.warning("Paraphrase grader: failed to parse AI JSON — raw=%r", raw[:300])
        return {
            "applied_correctly": None,
            "technique_check": None,
            "feedback": raw[:500] if raw else "AI grading unavailable.",
            "model_answer": None,
        }


def _attempt_to_out(attempt: models.ParaphraseAttempt) -> GradeOut:
    return GradeOut(
        id=attempt.id,
        technique=attempt.technique,
        original_sentence=attempt.original_sentence,
        response=attempt.response,
        applied_correctly=attempt.applied_correctly,
        technique_check=attempt.technique_check,
        feedback=attempt.feedback,
        model_answer=attempt.model_answer,
        created_at=str(attempt.created_at),
    )


# ─── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/next", response_model=NextDrillOut)
def get_next_drill(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
) -> NextDrillOut:
    """Return the next technique + sentence for this user."""
    technique_key = _pick_technique(db, current_user.id)
    sentence = _pick_sentence(db, current_user.id)
    tech = PARAPHRASE_TECHNIQUES[technique_key]

    return NextDrillOut(
        technique_key=technique_key,
        technique_name=tech["name"],
        technique_short=tech["short"],
        technique_description=tech["description"],
        technique_instruction=tech["instruction"],
        example_original=tech["example_original"],
        example_paraphrase=tech["example_paraphrase"],
        sentence_id=sentence["id"],
        original_sentence=sentence["sentence"],
        topic=sentence["topic"],
    )


@router.post("/grade", response_model=GradeOut)
def grade_attempt(
    payload: GradeIn,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
) -> GradeOut:
    """Grade a paraphrase attempt using AI and save the result."""
    if payload.technique not in PARAPHRASE_TECHNIQUES:
        raise HTTPException(status_code=400, detail=f"Unknown technique: {payload.technique!r}")

    sentence_data = _SENTENCE_BY_ID.get(payload.sentence_id)
    if sentence_data is None:
        raise HTTPException(status_code=400, detail=f"Unknown sentence_id: {payload.sentence_id}")

    if not payload.response.strip():
        raise HTTPException(status_code=400, detail="Response cannot be empty.")

    prompt = _build_grade_prompt(
        technique_key=payload.technique,
        original_sentence=sentence_data["sentence"],
        response=payload.response.strip(),
    )

    from app.tasks import _generate_text  # lazy import — avoids circular dependency
    raw = _generate_text(prompt, max_tokens=400, temperature=0.3)

    if raw:
        parsed = _parse_ai_json(raw)
    else:
        parsed = {
            "applied_correctly": None,
            "technique_check": None,
            "feedback": "AI grading unavailable. Try again later.",
            "model_answer": None,
        }

    attempt = models.ParaphraseAttempt(
        person_id=current_user.id,
        technique=payload.technique,
        sentence_id=payload.sentence_id,
        original_sentence=sentence_data["sentence"],
        response=payload.response.strip(),
        applied_correctly=parsed.get("applied_correctly"),
        technique_check=parsed.get("technique_check"),
        feedback=parsed.get("feedback"),
        model_answer=parsed.get("model_answer"),
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    return _attempt_to_out(attempt)


@router.get("/history", response_model=List[GradeOut])
def get_history(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
) -> List[GradeOut]:
    """Return the last N attempts for this user, newest first."""
    attempts = (
        db.query(models.ParaphraseAttempt)
        .filter(models.ParaphraseAttempt.person_id == current_user.id)
        .order_by(models.ParaphraseAttempt.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_attempt_to_out(a) for a in attempts]


@router.get("/stats", response_model=List[TechniqueStatOut])
def get_stats(
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
) -> List[TechniqueStatOut]:
    """Return per-technique accuracy stats for this user."""
    attempts = (
        db.query(models.ParaphraseAttempt)
        .filter(models.ParaphraseAttempt.person_id == current_user.id)
        .all()
    )

    totals: dict[str, int] = {k: 0 for k in PARAPHRASE_TECHNIQUES}
    corrects: dict[str, int] = {k: 0 for k in PARAPHRASE_TECHNIQUES}

    for attempt in attempts:
        if attempt.technique in totals:
            totals[attempt.technique] += 1
            if attempt.applied_correctly is True:
                corrects[attempt.technique] += 1

    result = []
    for key, tech in PARAPHRASE_TECHNIQUES.items():
        total = totals[key]
        correct = corrects[key]
        accuracy = round(correct / total, 4) if total > 0 else 0.0
        result.append(
            TechniqueStatOut(
                technique_key=key,
                technique_name=tech["name"],
                total=total,
                correct=correct,
                accuracy=accuracy,
            )
        )
    return result
