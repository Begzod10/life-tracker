"""Grammar-focused grader for the vocabulary/grammar SRS system.

The grader's `category` values are the same slugs used as `id` in
grammar_points.json, so every logged error links directly to a grammar
point and feeds the error-driven SRS.

Flow:
    payload = build_user_prompt(...)
    raw     = await call_openai(SYSTEM_PROMPT, payload)
    result  = parse_grading_response(raw)
    # -> store result.errors[].category to update grammar-point mastery / SRS
"""
from __future__ import annotations

import json
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, ValidationError


class GrammarCategory(str, Enum):
    articles = "articles"
    subject_verb_agreement = "subject_verb_agreement"
    present_perfect = "present_perfect"
    tense_consistency = "tense_consistency"
    prepositions = "prepositions"
    countable_uncountable = "countable_uncountable"
    complex_sentences = "complex_sentences"
    relative_clauses = "relative_clauses"
    conditionals = "conditionals"
    passive_voice = "passive_voice"
    word_order = "word_order"
    gerund_infinitive = "gerund_infinitive"
    modal_verbs = "modal_verbs"
    comparatives_superlatives = "comparatives_superlatives"
    plural_singular = "plural_singular"
    punctuation_run_on = "punctuation_run_on"
    other = "other"


class Severity(str, Enum):
    minor = "minor"
    major = "major"


class GrammarError(BaseModel):
    span: str = Field(..., description="The exact incorrect text from the answer.")
    category: GrammarCategory
    severity: Severity
    correction: str = Field(..., description="The corrected version of the span.")
    rule: str = Field(..., description="One-line reason, in plain language.")


class GradingResult(BaseModel):
    used_target_structure: Optional[bool] = None
    errors: List[GrammarError] = Field(default_factory=list)
    gra_band_estimate: float = Field(..., ge=0, le=9)
    feedback: str = Field(..., description="One actionable sentence.")
    revised: str = Field(..., description="The student's answer, fully corrected.")


ALLOWED_CATEGORIES = ", ".join(c.value for c in GrammarCategory)

SYSTEM_PROMPT = f"""You are an IELTS Writing examiner grading ONLY grammar (the \
Grammatical Range and Accuracy band). You are strict, accurate, and concise.

Grade the student's answer and return a SINGLE JSON object and nothing else — no \
prose, no markdown, no code fences.

Rules:
- Tag every genuine grammar error. Do NOT invent errors. If the grammar is clean, \
return an empty errors array.
- Ignore spelling, vocabulary choice, style, content quality, and ideas. Grammar only.
- Every error's "category" MUST be exactly one of: {ALLOWED_CATEGORIES}. \
Use "other" only when a real grammar error fits none of the named categories.
- "span" must be copied verbatim from the student's answer.
- "severity": "major" if it impedes accuracy or could hold the band down; "minor" otherwise.
- "used_target_structure": true/false if a target grammar point was required; null if none.
- "gra_band_estimate": IELTS GRA band 0–9 in 0.5 steps. Be conservative. A 6.5 needs a \
mix of simple and complex sentences with errors that don't impede communication; \
frequent errors in basic structures cap the band near 5.0–5.5.
- "feedback": one actionable sentence aimed at the student's biggest single issue.
- "revised": the student's answer rewritten with all grammar errors fixed, preserving \
their meaning and word choices.

Return only the JSON object."""


def build_user_prompt(
    student_answer: str,
    exercise_type: str,
    target_grammar_point: Optional[str] = None,
    target_word: Optional[str] = None,
    instruction: Optional[str] = None,
    example_sentence: Optional[str] = None,
) -> str:
    parts = [f"Exercise type: {exercise_type}"]
    if target_grammar_point:
        parts.append(f"Required grammar point: {target_grammar_point}")
    if target_word:
        parts.append(f"Target word to use: {target_word}")
    if instruction:
        parts.append(f"Task shown to student: {instruction}")
    if example_sentence:
        parts.append(f"Source sentence: {example_sentence}")
    parts.append(f'Student answer: """{student_answer.strip()}"""')
    parts.append("Grade now. Return only the JSON object.")
    return "\n".join(parts)


def extract_json(text: str) -> str:
    t = text.strip()
    if t.startswith("```"):
        t = t.split("```", 2)[1] if t.count("```") >= 2 else t.strip("`")
        if t.lstrip().lower().startswith("json"):
            t = t.lstrip()[4:]
    start, end = t.find("{"), t.rfind("}")
    if start != -1 and end != -1 and end > start:
        return t[start: end + 1]
    return t


def parse_grading_response(raw: str) -> GradingResult:
    try:
        data = json.loads(extract_json(raw))
    except json.JSONDecodeError as e:
        raise ValueError(f"Grader did not return valid JSON: {e}") from e

    valid = {c.value for c in GrammarCategory}
    for err in data.get("errors", []):
        if err.get("category") not in valid:
            err["category"] = "other"

    try:
        return GradingResult.model_validate(data)
    except ValidationError as e:
        raise ValueError(f"Grader JSON failed schema validation: {e}") from e
