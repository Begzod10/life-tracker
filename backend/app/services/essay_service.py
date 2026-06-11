"""Task 2 essay subsystem — question bank, error taxonomy, adaptive selection.

Mirrors the pattern of exercise_types.py but for essay-level constructs.
"""
from __future__ import annotations

import math
import random
from collections import Counter
from typing import Optional

# ─── Essay type catalog ────────────────────────────────────────────────────────

ESSAY_TYPES: frozenset[str] = frozenset({"essay_intro", "essay_paragraph", "essay_full"})

# ─── IELTS Task 2 question types and topic domains ───────────────────────────

QUESTION_TYPES = [
    "opinion",                    # To what extent do you agree/disagree?
    "discussion",                 # Discuss both views and give your own opinion.
    "problem_solution",           # What are the causes? What solutions can you suggest?
    "advantages_disadvantages",   # Do the advantages outweigh the disadvantages?
    "two_part",                   # Two separate questions to answer.
]

TOPIC_DOMAINS = [
    "education", "technology", "environment", "health", "work",
    "society", "government", "globalisation", "crime", "culture",
]

# ─── Question bank ────────────────────────────────────────────────────────────
# Each entry has a stable seq_id so sessions can track recency without a DB table.
# When the bank exhausts (all seq_ids recently used) the selector wraps around.

_QUESTION_BANK: list[dict] = [
    # opinion
    {"seq_id": 1,  "question_type": "opinion",                  "topic_domain": "education",
     "question": "Some people believe that university education should be free for all students. To what extent do you agree or disagree with this view?"},
    {"seq_id": 2,  "question_type": "opinion",                  "topic_domain": "technology",
     "question": "Some people argue that social media does more harm than good to individuals and society. To what extent do you agree?"},
    {"seq_id": 3,  "question_type": "opinion",                  "topic_domain": "environment",
     "question": "Individual actions to protect the environment are pointless unless governments make large-scale changes. To what extent do you agree?"},
    {"seq_id": 4,  "question_type": "opinion",                  "topic_domain": "health",
     "question": "The government should be responsible for ensuring that people maintain a healthy lifestyle. To what extent do you agree?"},
    {"seq_id": 5,  "question_type": "opinion",                  "topic_domain": "crime",
     "question": "The best way to reduce crime is to give longer prison sentences. To what extent do you agree or disagree?"},
    # discussion
    {"seq_id": 6,  "question_type": "discussion",               "topic_domain": "work",
     "question": "Some people think it is better to have a wide range of skills in their working lives. Others believe it is better to specialise in one area. Discuss both views and give your own opinion."},
    {"seq_id": 7,  "question_type": "discussion",               "topic_domain": "education",
     "question": "Some people think children should learn to compete while others believe it is more important to teach them to cooperate. Discuss both views and give your own opinion."},
    {"seq_id": 8,  "question_type": "discussion",               "topic_domain": "technology",
     "question": "Some people think that technology has made people less social, while others believe the opposite is true. Discuss both views and give your own opinion."},
    {"seq_id": 9,  "question_type": "discussion",               "topic_domain": "society",
     "question": "Some argue that older people should step aside to allow younger generations to take on leadership roles in society. Others disagree. Discuss both views and give your opinion."},
    # problem_solution
    {"seq_id": 10, "question_type": "problem_solution",         "topic_domain": "government",
     "question": "Traffic congestion is a major problem in many cities. What are the main causes of this problem and what measures can be taken to solve it?"},
    {"seq_id": 11, "question_type": "problem_solution",         "topic_domain": "health",
     "question": "Obesity is an increasing problem in many countries. What are the causes of obesity and what can be done to address this issue?"},
    {"seq_id": 12, "question_type": "problem_solution",         "topic_domain": "crime",
     "question": "Juvenile crime has been increasing in many countries. What do you think are the causes, and what solutions can you suggest?"},
    {"seq_id": 13, "question_type": "problem_solution",         "topic_domain": "environment",
     "question": "Plastic waste is one of the biggest threats to the world's oceans. What are the causes of this problem and what solutions can you propose?"},
    # advantages_disadvantages
    {"seq_id": 14, "question_type": "advantages_disadvantages", "topic_domain": "globalisation",
     "question": "The world is becoming increasingly connected, with more people choosing to live and work abroad. Do the advantages of this trend outweigh the disadvantages?"},
    {"seq_id": 15, "question_type": "advantages_disadvantages", "topic_domain": "technology",
     "question": "Working from home has become increasingly popular. Do the advantages of working from home outweigh the disadvantages?"},
    {"seq_id": 16, "question_type": "advantages_disadvantages", "topic_domain": "education",
     "question": "Online learning is replacing traditional classroom education in many countries. Do the advantages of online learning outweigh its disadvantages?"},
    {"seq_id": 17, "question_type": "advantages_disadvantages", "topic_domain": "culture",
     "question": "Many traditional festivals and customs are disappearing due to globalisation. Do the advantages of cultural exchange outweigh the loss of local traditions?"},
    # two_part
    {"seq_id": 18, "question_type": "two_part",                 "topic_domain": "technology",
     "question": "Social media has changed the way people communicate. Why has social media become so popular? Is this a positive or negative development?"},
    {"seq_id": 19, "question_type": "two_part",                 "topic_domain": "education",
     "question": "Many schools are now using computers and tablets in the classroom. Why is this happening? Is this a positive or negative development?"},
    {"seq_id": 20, "question_type": "two_part",                 "topic_domain": "society",
     "question": "In many countries, people are choosing to have children later in life. Why is this? What are the effects of this trend on society?"},
]

_SEQ_ID_TO_ENTRY: dict[int, dict] = {q["seq_id"]: q for q in _QUESTION_BANK}

# ─── Question selection ────────────────────────────────────────────────────────

def pick_question(recent_seq_ids: list[int]) -> dict:
    """Pick the least-recently-used question.  Never repeats until all are
    exhausted, then wraps.  Mirrors the collocation generator's avoid-redo logic."""
    recent_set = set(recent_seq_ids)
    # Candidates are those not recently used; if all are used, reset (cycle).
    candidates = [q for q in _QUESTION_BANK if q["seq_id"] not in recent_set]
    if not candidates:
        candidates = list(_QUESTION_BANK)   # bank exhausted — wrap
    return random.choice(candidates)


# ─── Assigned position for essay_paragraph ────────────────────────────────────

_POSITIONS: dict[str, list[str]] = {
    "opinion": [
        "strongly agree with the statement",
        "partially agree, with reservations",
        "disagree with the statement",
    ],
    "discussion": [
        "the first view has more merit",
        "the second view is more convincing",
        "both views have valid points but neither is fully correct",
    ],
    "problem_solution": [
        "the main cause is economic inequality",
        "the main cause is lack of government regulation",
        "the main cause is changing social attitudes",
    ],
    "advantages_disadvantages": [
        "the advantages clearly outweigh the disadvantages",
        "the disadvantages are more significant",
        "the advantages and disadvantages are roughly balanced",
    ],
    "two_part": [
        "the development is largely positive overall",
        "the trend has mixed effects that depend on context",
    ],
}

def get_assigned_position(question_type: str) -> str:
    opts = _POSITIONS.get(question_type, ["argue for one clear position"])
    return random.choice(opts)


# ─── Essay error taxonomy ─────────────────────────────────────────────────────
# Validated label set — parallel to GRAMMAR_ERROR_LABELS in exercise_types.py.
# Any error string not in this dict is stripped from Groq's response.

ESSAY_ERROR_LABELS: dict[str, str] = {
    "no_clear_position":        "No clear position",
    "doesnt_address_all_parts": "Doesn't address all parts",
    "underdeveloped_idea":      "Underdeveloped idea",
    "missing_topic_sentence":   "Missing topic sentence",
    "weak_cohesion":            "Weak cohesion",
    "paragraphing_issue":       "Paragraphing issue",
    "no_referencing":           "Over-repeats nouns instead of pronouns/synonyms",
    "overgeneralization":       "Overgeneralization",
    "repetitive_vocabulary":    "Repetitive vocabulary",
    "informal_register":        "Informal register",
    "template_overuse":         "Template / memorized filler",
    "weak_conclusion":          "Weak conclusion",
    "irrelevant_content":       "Irrelevant content",
    "off_topic":                "Off topic",
}

VALID_ESSAY_ERRORS: frozenset[str] = frozenset(ESSAY_ERROR_LABELS.keys())

# Structural: best addressed by essay_paragraph drill
_STRUCTURAL_ERRORS: frozenset[str] = frozenset({
    "missing_topic_sentence",
    "weak_cohesion",
    "paragraphing_issue",
    "underdeveloped_idea",
    "no_referencing",
})

# Task-level: best addressed by essay_intro drill
_TASK_ERRORS: frozenset[str] = frozenset({
    "no_clear_position",
    "doesnt_address_all_parts",
    "off_topic",
    "irrelevant_content",
})

# ─── essay_focus derivation ───────────────────────────────────────────────────

def derive_essay_focus(recent_attempts: list) -> list[str]:
    """Count essay_errors over the last 30 Task2Attempts and return the top 3.
    Directly mirrors the grammar_focus derivation in exercises.py."""
    counts: Counter = Counter()
    for attempt in recent_attempts:
        for err in (attempt.essay_errors or []):
            if err in VALID_ESSAY_ERRORS:
                counts[err] += 1
    return [err for err, _ in counts.most_common(3)]


# ─── Adaptive type selection (replaces SRS) ───────────────────────────────────

def pick_essay_type(
    essay_focus: list[str],
    recent_bands: list[float],
    target_band: float = 7.0,
) -> str:
    """Decide the next exercise type from weakness history.

    Priority order:
    1. 3+ consecutive attempts all at/above target_band → promote to essay_full
    2. Top focus error is structural → essay_paragraph
    3. Top focus error is task-level → essay_intro
    4. No clear pattern → essay_intro (start from basics)
    """
    if len(recent_bands) >= 3 and all(b >= target_band for b in recent_bands[-3:]):
        return "essay_full"
    if essay_focus:
        if essay_focus[0] in _STRUCTURAL_ERRORS:
            return "essay_paragraph"
        if essay_focus[0] in _TASK_ERRORS:
            return "essay_intro"
    return "essay_intro"


# ─── Paragraph drill instruction ─────────────────────────────────────────────

_DRILL_INSTRUCTIONS: dict[str, str] = {
    "missing_topic_sentence":
        "Begin the paragraph with a clear topic sentence that states the main idea. "
        "Do NOT start with a supporting point or example.",
    "weak_cohesion":
        "Use at least THREE different cohesive devices "
        "(e.g. Furthermore, However, As a result, In addition, Therefore). "
        "Each sentence must link logically to the previous one.",
    "paragraphing_issue":
        "Write exactly one paragraph following this strict structure: "
        "topic sentence → explanation → specific example → link back to the question.",
    "underdeveloped_idea":
        "Your paragraph must contain: a topic sentence, a full explanation of WHY "
        "(at least 2 sentences), a specific real-world example, and a concluding link sentence.",
    "no_referencing":
        "Do NOT repeat the same noun more than once in the paragraph. "
        "Replace repeated nouns with pronouns and synonyms.",
}

def get_drill_instruction(essay_focus: list[str]) -> Optional[str]:
    for err in essay_focus:
        if err in _DRILL_INSTRUCTIONS:
            return _DRILL_INSTRUCTIONS[err]
    return None


# ─── Band rounding (IELTS official rule) ─────────────────────────────────────

def round_to_half_band(value: float) -> float:
    """Round to nearest 0.5 per IELTS rounding rule."""
    return math.floor(value * 2 + 0.5) / 2


# ─── Band trend computation ───────────────────────────────────────────────────

_CRITERIA_KEYS = ("task_response", "coherence_cohesion", "lexical_resource", "grammatical_range_accuracy")

def compute_band_trends(recent_attempts: list) -> dict[str, str]:
    """Return rising / flat / falling per criterion over the last 5 attempts."""
    def trend(vals: list[float]) -> str:
        if len(vals) < 2:
            return "flat"
        delta = vals[-1] - vals[0]
        if delta > 0.4:
            return "rising"
        if delta < -0.4:
            return "falling"
        return "flat"

    last5 = recent_attempts[-5:]
    result: dict[str, str] = {}
    for key in _CRITERIA_KEYS:
        vals = [
            (a.criteria_scores or {}).get(key)
            for a in last5
            if a.criteria_scores and a.criteria_scores.get(key) is not None
        ]
        result[key] = trend([v for v in vals if v is not None])
    result["overall"] = trend([a.overall_band for a in last5 if a.overall_band is not None])
    return result
