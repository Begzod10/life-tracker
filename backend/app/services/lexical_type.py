"""Lexical type classification and exercise eligibility gate.

Tags each dictionary entry as word / collocation / phrase / linker,
then filters the exercise-type pool so multiword entries never generate
spelling / anagram / word_formation items.
"""
from __future__ import annotations

import re
from enum import Enum
from typing import List, Optional


class LexicalType(str, Enum):
    word        = "word"         # single lexical item: determined, operate
    collocation = "collocation"  # fixed multiword chunk: social media, private vehicles
    phrase      = "phrase"       # longer descriptive multiword: screen time addiction
    linker      = "linker"       # sentence frame / discourse marker: it is widely believed


# Exercise types each lexical_type may generate.
ELIGIBLE: dict[LexicalType, set[str]] = {
    LexicalType.word: {
        "meaning_mc", "reverse_mc", "collocation_mc", "synonym_antonym", "odd_one_out",
        "spelling", "cloze", "cloze_choice", "anagram", "cloze_bank", "match", "word_formation",
        "sentence", "constrained_sentence", "prompt_response", "paraphrase", "error_correction",
    },
    LexicalType.collocation: {
        # No spelling / anagram / word_formation — don't spell or scramble a chunk.
        "collocation_mc", "meaning_mc", "reverse_mc", "cloze", "cloze_choice", "cloze_bank", "match",
        "sentence", "constrained_sentence", "paraphrase",
    },
    LexicalType.phrase: {
        # Same exclusions as collocation; tighter — fewer MC types make sense.
        "cloze", "cloze_choice", "cloze_bank", "match", "sentence", "paraphrase",
    },
    LexicalType.linker: {
        # Task-2 academic frames: drive into production graded by grammar_grading.
        "linker_function_mc", "structure_production", "cloze", "cloze_choice", "prompt_response",
    },
}

_SINGLE_WORD_ONLY = {"spelling", "anagram", "word_formation"}

# ─── Classification heuristic (used to backfill existing rows) ────────────────

_LINKER_PATTERNS = [
    r"\bthat$",
    r"^this\b",
    r"^it is\b",
    r"^there (is|are)\b",
    r"^(while|although|whereas|however|moreover|furthermore|on the other hand)\b",
    r"\bis (widely|generally|often) (believed|argued|claimed)\b",
    r"\b(demonstrates|suggests|indicates|proves|shows) that\b",
]
_LINKER_RE = re.compile("|".join(_LINKER_PATTERNS), re.IGNORECASE)


def classify(headword: str, definition: Optional[str] = None) -> LexicalType:
    """Heuristic classification of a dictionary headword into a LexicalType."""
    text = headword.strip().lower()
    text = re.sub(r"\(.*?\)", "", text).strip()  # drop parentheticals
    tokens = text.split()

    if len(tokens) == 1:
        return LexicalType.word
    if _LINKER_RE.search(text):
        return LexicalType.linker
    if len(tokens) <= 3:
        return LexicalType.collocation
    return LexicalType.phrase


# ─── Exercise eligibility gate ────────────────────────────────────────────────

def eligible_types(lexical_type: LexicalType, requested_pool: List[str]) -> List[str]:
    """Filter a candidate exercise-type pool to what this entry can produce.

    Call this right before picking a type from the pool. If the result is
    empty, falls back to a safe default for that entry class.
    """
    allowed = ELIGIBLE[lexical_type]
    keep = [
        t for t in requested_pool
        if t in allowed
        and not (t in _SINGLE_WORD_ONLY and lexical_type is not LexicalType.word)
    ]
    if keep:
        return keep
    return ["meaning_mc"] if lexical_type is LexicalType.word else ["cloze"]


def routes_to_grammar_loop(lexical_type: LexicalType) -> bool:
    """Linkers and phrases produce sentences graded by grammar_grading.py."""
    return lexical_type in (LexicalType.linker, LexicalType.phrase)
