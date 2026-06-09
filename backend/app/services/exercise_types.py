"""
Exercise type catalog, SRS-driven selection, question generation, and deterministic grading.
Production types (sentence/constrained_sentence/paraphrase/prompt_response) are graded by Groq.
All other types are graded deterministically here.
"""
from __future__ import annotations

import json
import logging
import random
import re
from typing import Any, Optional

_log = logging.getLogger(__name__)

# ─── Type catalog ─────────────────────────────────────────────────────────────

PRODUCTION_TYPES = frozenset({"sentence", "constrained_sentence", "paraphrase", "prompt_response"})
RECOGNITION_TYPES = frozenset({"meaning_mc", "reverse_mc"})
CLOZE_TYPES = frozenset({"cloze"})
FORM_TYPES = frozenset({"spelling", "anagram"})
GROUPED_TYPES = frozenset({"match", "cloze_bank"})
PHASE_B_TYPES = frozenset({"word_formation", "synonym_antonym", "odd_one_out"})

ALL_TYPES = PRODUCTION_TYPES | RECOGNITION_TYPES | CLOZE_TYPES | FORM_TYPES | GROUPED_TYPES | PHASE_B_TYPES
DETERMINISTIC_TYPES = ALL_TYPES - PRODUCTION_TYPES

VALID_MODES = {"auto", "recognition", "cloze", "production", "mixed"} | ALL_TYPES

# ─── SRS thresholds ───────────────────────────────────────────────────────────

_REPS_FOR_PRODUCTION = 5
_INTERVAL_FOR_PRODUCTION = 10

# ─── Constraints for constrained_sentence ─────────────────────────────────────

_CONSTRAINTS = [
    "using the past tense",
    "as a question",
    "in a formal context",
    "in an academic essay sentence",
    "describing a specific person",
    "about a work situation",
    "comparing two things",
    "using a negative construction",
]

# Grammar-targeted constraints: keyed by grammar error category.
# When a learner has a known weakness in a category, constrained_sentence
# exercises will use the matching constraint to give focused practice.
GRAMMAR_ERROR_LABELS: dict[str, str] = {
    "articles":               "Articles (a/an/the)",
    "plural_singular":        "Plural/Singular",
    "verb_tense":             "Verb Tenses",
    "subject_verb_agreement": "Subject-Verb Agreement",
    "prepositions":           "Prepositions",
    "word_form":              "Word Form",
    "word_order":             "Word Order",
    "spelling":               "Spelling",
    "pronoun":                "Pronouns",
    "constraint_not_met":     "Constraint Not Met",
}

_GRAMMAR_CONSTRAINTS: dict[str, str] = {
    "articles":               "paying close attention to correct article usage (a, an, the)",
    "plural_singular":        "using the correct singular or plural form of nouns",
    "verb_tense":             "using the past simple tense",
    "subject_verb_agreement": "ensuring the subject and verb agree in number",
    "prepositions":           "using a preposition correctly (in, on, at, for, with, etc.)",
    "word_form":              "using the correct word form (noun, verb, adjective, or adverb)",
    "word_order":             "with correct subject-verb-object word order",
    "pronoun":                "replacing a noun with the correct pronoun (he/she/they/it)",
    "spelling":               "spelled correctly — double-check every word before submitting",
    "constraint_not_met":     "following all sentence constraints given in the prompt",
}

# ─── Prompt templates for prompt_response ─────────────────────────────────────

_PROMPTS = [
    "Describe a time when you used or experienced '{word}'.",
    "How would you explain '{word}' to a friend?",
    "Write a short response: Have you encountered a situation involving '{word}'?",
    "Use '{word}' to describe something from your daily life.",
]

# ─── Type selection ────────────────────────────────────────────────────────────

def pick_exercise_type(word: Any, mode: str, position: int = 0) -> str:
    """Return an exercise_type string for this word given the requested mode."""
    if mode in ALL_TYPES:
        return mode

    if mode == "recognition":
        options = ["meaning_mc", "reverse_mc"]
        return options[position % len(options)]

    if mode == "cloze":
        options = ["cloze", "spelling", "anagram"]
        return options[position % len(options)]

    if mode == "production":
        options = ["sentence", "constrained_sentence", "prompt_response"]
        return options[position % len(options)]

    if mode == "mixed":
        options = [
            "meaning_mc", "reverse_mc",
            "cloze", "spelling",
            "sentence", "constrained_sentence",
            "prompt_response", "paraphrase",
            "anagram",
        ]
        return options[position % len(options)]

    # mode == "auto": SRS-driven
    reps = getattr(word, "reps", 0) or 0
    interval = getattr(word, "interval_days", 0) or 0

    if reps == 0:
        return ["meaning_mc", "reverse_mc"][position % 2]

    if reps < _REPS_FOR_PRODUCTION or interval < _INTERVAL_FOR_PRODUCTION:
        cued = ["cloze", "spelling", "anagram"]
        return cued[position % len(cued)]

    production = ["sentence", "constrained_sentence", "prompt_response"]
    return production[position % len(production)]


# ─── Distractor selection ──────────────────────────────────────────────────────

def _get_word_distractors(target_word: Any, pool: list[Any], n: int = 3) -> list[str]:
    """Pick n distractor WORDS (not definitions) for meaning_mc / reverse_mc.

    Guarantees all options are parallel in form so the question can't be solved
    by elimination.  Priority order (each tier relaxes one constraint):
      1. Same POS + parallel form/length + same difficulty
      2. Same POS + parallel form/length   (relax difficulty)
      3. Same POS                           (relax form/length)
      4. Any word                           (relax POS — logged as a data warning)
    """
    target = getattr(target_word, "word", "") or ""
    target_pos = getattr(target_word, "part_of_speech", None)
    target_diff = getattr(target_word, "difficulty", None)
    target_id = getattr(target_word, "id", None)
    target_multiword = " " in target

    # Exclude the target and any synonyms stored in word_meta
    meta = getattr(target_word, "word_meta", None) or {}
    synonyms: set[str] = {s.lower() for s in (meta.get("synonyms") or [])}
    synonyms.add(target.lower())

    base_candidates = [
        w for w in pool
        if getattr(w, "id", None) != target_id
        and getattr(w, "word", None)
        and (getattr(w, "word", "") or "").lower() not in synonyms
    ]

    def _is_parallel(w: Any) -> bool:
        return (" " in (getattr(w, "word", "") or "")) == target_multiword

    def _pick(subset: list[Any]) -> list[str]:
        seen: set[str] = {target.lower()}
        result: list[str] = []
        for w in subset:
            val = (getattr(w, "word", "") or "").strip()
            if val and val.lower() not in seen:
                seen.add(val.lower())
                result.append(val)
            if len(result) >= n:
                break
        return result

    # Tier 1 — POS + form + difficulty
    t1 = [w for w in base_candidates
          if getattr(w, "part_of_speech", None) == target_pos
          and _is_parallel(w)
          and getattr(w, "difficulty", None) == target_diff]
    chosen = _pick(t1)
    if len(chosen) >= n:
        return chosen[:n]

    # Tier 2 — POS + form  (relax difficulty)
    t2 = [w for w in base_candidates
          if getattr(w, "part_of_speech", None) == target_pos
          and _is_parallel(w)]
    chosen = _pick(t2)
    if len(chosen) >= n:
        return chosen[:n]

    # Tier 3 — POS only  (relax form/length)
    t3 = [w for w in base_candidates
          if getattr(w, "part_of_speech", None) == target_pos]
    chosen = _pick(t3)
    if len(chosen) >= n:
        return chosen[:n]

    # Tier 4 — relax POS (last resort — log so weak pools are visible)
    _log.warning(
        "distractor_parallelism: relaxing POS constraint for word=%r (pos=%r, pool=%d)",
        target, target_pos, len(base_candidates),
    )
    chosen = _pick(base_candidates)
    while len(chosen) < n:
        chosen.append("—")
    return chosen[:n]


# ─── Levenshtein distance ──────────────────────────────────────────────────────

def _levenshtein(a: str, b: str) -> int:
    if a == b:
        return 0
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        curr = [i + 1]
        for j, cb in enumerate(b):
            curr.append(min(prev[j + 1] + 1, curr[j] + 1, prev[j] + (0 if ca == cb else 1)))
        prev = curr
    return prev[-1]


# ─── Anagram scramble ─────────────────────────────────────────────────────────

def _scramble(word: str) -> str:
    chars = list(word)
    for _ in range(20):
        random.shuffle(chars)
        candidate = "".join(chars)
        if candidate != word:
            return candidate
    return word[::-1] if word[::-1] != word else word + " "


# ─── Example extraction ───────────────────────────────────────────────────────

def _get_examples(word: Any) -> list[str]:
    raw = getattr(word, "examples", None)
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(x) for x in parsed if x]
    except (json.JSONDecodeError, TypeError):
        pass
    return []


def _find_cloze_sentence(word: Any) -> Optional[str]:
    """Find a sentence containing the word for cloze. Try source_sentence then examples."""
    target = getattr(word, "word", "")
    pattern = re.compile(r"\b" + re.escape(target) + r"\b", re.IGNORECASE)

    # Source sentence from book reader is the strongest cue
    src = getattr(word, "source_sentence", None)
    if src and pattern.search(src):
        return re.sub(pattern, "_____", src, count=1)

    for ex in _get_examples(word):
        if pattern.search(ex):
            return re.sub(pattern, "_____", ex, count=1)

    return None


# ─── Question builder ──────────────────────────────────────────────────────────

def build_question(
    exercise_type: str,
    word: Any,
    distractor_pool: list[Any],
    position: int = 0,
    grammar_focus: list[str] | None = None,
) -> dict[str, Any]:
    """
    Returns a dict with:
      - All client-facing fields (no correct_answer)
      - correct_answer  (stored server-side only, NOT sent to client)
      - exercise_type
    """
    w = word
    target = getattr(w, "word", "")
    definition = getattr(w, "definition", "") or ""
    translation = getattr(w, "translation", None)
    phonetic = getattr(w, "phonetic", None)
    part_of_speech = getattr(w, "part_of_speech", None)
    difficulty = getattr(w, "difficulty", "B1")
    examples = _get_examples(w)

    base = {
        "exercise_type": exercise_type,
        "word_id": getattr(w, "id", None),
        "word": target,
        "definition": definition,
        "translation": translation,
        "phonetic": phonetic,
        "part_of_speech": part_of_speech,
        "difficulty": difficulty,
        "examples": examples,
        "group_id": None,
        "correct_answer": None,
    }

    if exercise_type == "meaning_mc":
        # Prompt = the definition; options = words (all same POS, parallel form).
        # One correct answer = the target word.
        distractors = _get_word_distractors(w, distractor_pool)
        options = [target] + distractors
        random.shuffle(options)
        return {**base,
                "prompt": definition,
                "options": options,
                "correct_answer": target}

    if exercise_type == "reverse_mc":
        # Prompt = translation (or definition if no translation); options = words.
        prompt_text = translation if translation else definition
        distractors = _get_word_distractors(w, distractor_pool)
        options = [target] + distractors
        random.shuffle(options)
        return {**base,
                "prompt": prompt_text,
                "options": options,
                "correct_answer": target}

    if exercise_type == "cloze":
        gapped = _find_cloze_sentence(w)
        if gapped is None:
            # fall back to spelling
            return build_question("spelling", w, distractor_pool, position)
        return {**base,
                "exercise_type": "cloze",
                "prompt": gapped,
                "correct_answer": target}

    if exercise_type == "spelling":
        parts = [definition]
        if translation:
            parts.append(f"({translation})")
        if phonetic:
            parts.append(f"/{phonetic}/")
        return {**base,
                "prompt": "Spell the word: " + " · ".join(parts),
                "correct_answer": target}

    if exercise_type == "anagram":
        scrambled = _scramble(target)
        hint = definition[:80]
        return {**base,
                "prompt": f"Unscramble: {scrambled.upper()}",
                "hint": f"Clue: {hint}",
                "correct_answer": target}

    if exercise_type == "sentence":
        return {**base,
                "prompt": f"Write a sentence using \"{target}\".",
                "instruction": definition,
                "correct_answer": None}

    if exercise_type == "constrained_sentence":
        # If the learner has known grammar weaknesses, target one of them.
        constraint = None
        if grammar_focus:
            for err in grammar_focus:
                if err in _GRAMMAR_CONSTRAINTS:
                    constraint = _GRAMMAR_CONSTRAINTS[err]
                    break
        if constraint is None:
            constraint = _CONSTRAINTS[position % len(_CONSTRAINTS)]
        return {**base,
                "prompt": f"Write a sentence using \"{target}\" — {constraint}.",
                "instruction": definition,
                "constraint": constraint,
                "correct_answer": None}

    if exercise_type == "paraphrase":
        source = examples[0] if examples else f'Use "{target}" to describe something.'
        return {**base,
                "prompt": f"Rewrite this sentence using \"{target}\":",
                "source_sentence": source,
                "instruction": definition,
                "correct_answer": None}

    if exercise_type == "prompt_response":
        tmpl = _PROMPTS[position % len(_PROMPTS)]
        prompt_text = tmpl.format(word=target)
        return {**base,
                "prompt": prompt_text,
                "instruction": definition,
                "correct_answer": None}

    # ── Grouped types ────────────────────────────────────────────────────────
    # build_question returns a stub; assign_groups() enriches these with group_id
    # and question_payload after all items in the session have been built.

    if exercise_type == "match":
        # Learner selects the matching definition for this word from a group.
        # correct_answer = definition; graded by exact match in grade_deterministic.
        return {**base,
                "prompt": definition,
                "correct_answer": definition}

    if exercise_type == "cloze_bank":
        # Learner picks this word from a shared word bank to fill a gapped sentence.
        gapped = _find_cloze_sentence(w)
        if gapped is None:
            gapped = f"_____ — {definition}"
        return {**base,
                "prompt": gapped,
                "correct_answer": target}

    # ── Phase B types (require word_meta) ────────────────────────────────────

    if exercise_type == "word_formation":
        meta = getattr(w, "word_meta", None) or {}
        forms: dict[str, str] = {
            k: v for k, v in (meta.get("forms") or {}).items()
            if v and str(v).lower() != target.lower()
        }
        if not forms:
            return build_question("spelling", w, distractor_pool, position)
        form_keys = list(forms.keys())
        form_type = form_keys[position % len(form_keys)]
        form_value = forms[form_type]
        return {**base,
                "exercise_type": "word_formation",
                "prompt": f'What is the {form_type} form of "{target}"?',
                "instruction": definition,
                "form_type": form_type,
                "correct_answer": form_value}

    if exercise_type == "synonym_antonym":
        meta = getattr(w, "word_meta", None) or {}
        synonyms_raw = [s for s in (meta.get("synonyms") or []) if s]
        antonyms_raw = [a for a in (meta.get("antonyms") or []) if a]
        if not synonyms_raw and not antonyms_raw:
            return build_question("meaning_mc", w, distractor_pool, position)
        # Alternate: even position → synonym, odd → antonym (when both available)
        use_antonym = bool(antonyms_raw) and (not synonyms_raw or position % 2 == 1)
        q_type = "antonym" if use_antonym else "synonym"
        candidates = antonyms_raw if use_antonym else synonyms_raw
        correct = candidates[0]
        # Distractors: words that are NOT synonyms/antonyms of the target
        excluded = {s.lower() for s in synonyms_raw + antonyms_raw}
        excluded.add(target.lower())
        excluded.add(correct.lower())
        filtered_pool = [
            pw for pw in distractor_pool
            if (getattr(pw, "word", "") or "").lower() not in excluded
            and getattr(pw, "id", None) != getattr(w, "id", None)
        ]
        # Prefer same POS, same difficulty
        filtered_pool.sort(key=lambda pw: (
            getattr(pw, "part_of_speech", None) != part_of_speech,
            getattr(pw, "difficulty", None) != difficulty,
        ))
        distractors: list[str] = []
        seen_d: set[str] = {correct.lower()}
        for pw in filtered_pool:
            val = (getattr(pw, "word", "") or "").strip()
            if val and val.lower() not in seen_d:
                seen_d.add(val.lower())
                distractors.append(val)
            if len(distractors) >= 3:
                break
        while len(distractors) < 3:
            distractors.append("—")
        options = [correct] + distractors
        random.shuffle(options)
        return {**base,
                "exercise_type": "synonym_antonym",
                "prompt": f'Which word is a {q_type} of "{target}"?',
                "options": options,
                "relation_type": q_type,
                "correct_answer": correct}

    if exercise_type == "odd_one_out":
        meta = getattr(w, "word_meta", None) or {}
        synonyms_raw = [s for s in (meta.get("synonyms") or []) if s]
        if not synonyms_raw:
            return build_question("meaning_mc", w, distractor_pool, position)
        # "Belonging" group: target + up to 2 synonyms
        belonging: list[str] = [target] + synonyms_raw[:2]
        # Pad belonging to 3 if fewer synonyms
        if len(belonging) < 3:
            extras = [
                pw for pw in distractor_pool
                if getattr(pw, "id", None) != getattr(w, "id", None)
                and getattr(pw, "part_of_speech", None) == part_of_speech
                and (getattr(pw, "word", "") or "").lower() not in {b.lower() for b in belonging}
            ]
            for pw in extras:
                belonging.append(getattr(pw, "word", ""))
                if len(belonging) >= 3:
                    break
        belonging = belonging[:3]
        # Odd one out: different POS preferred, otherwise any unrelated word
        odd_pool = [
            pw for pw in distractor_pool
            if getattr(pw, "id", None) != getattr(w, "id", None)
            and (getattr(pw, "word", "") or "").lower() not in {b.lower() for b in belonging}
            and getattr(pw, "word", None)
        ]
        odd_pool_diff_pos = [pw for pw in odd_pool if getattr(pw, "part_of_speech", None) != part_of_speech]
        source = odd_pool_diff_pos or odd_pool
        if not source:
            return build_question("meaning_mc", w, distractor_pool, position)
        odd_word = random.choice(source[:10])
        odd_str = getattr(odd_word, "word", "")
        options = belonging + [odd_str]
        random.shuffle(options)
        return {**base,
                "exercise_type": "odd_one_out",
                "prompt": "Which word does not belong with the others?",
                "options": options,
                "correct_answer": odd_str}

    # Unknown type: fall back to sentence
    return build_question("sentence", w, distractor_pool, position)


# ─── Group assembly (call after all items are built) ──────────────────────────

_GROUP_SIZE = 4


def assign_groups(items_plan: list[dict]) -> list[dict]:
    """Assign group_ids and enrich payloads for match and cloze_bank items.

    Must be called once after build_question() has been called for all words in
    the session.  Lone items (< 2 in a chunk) are downgraded to their fallback.
    """
    match_items = [
        (i, item) for i, item in enumerate(items_plan)
        if item.get("exercise_type") == "match"
    ]
    cloze_items = [
        (i, item) for i, item in enumerate(items_plan)
        if item.get("exercise_type") == "cloze_bank"
    ]

    counter = 0

    for start in range(0, len(match_items), _GROUP_SIZE):
        chunk = match_items[start:start + _GROUP_SIZE]
        if len(chunk) < 2:
            idx, item = chunk[0]
            items_plan[idx] = {**item, "exercise_type": "meaning_mc"}
            continue
        group_id = f"match_{counter}"
        counter += 1
        words_in_group = [item["word"] for _, item in chunk]
        defs_in_group = [item["definition"] for _, item in chunk]
        shuffled_defs = defs_in_group[:]
        random.shuffle(shuffled_defs)
        group_payload = {"words": words_in_group, "definitions": shuffled_defs}
        for idx, item in chunk:
            items_plan[idx] = {**item, "group_id": group_id, "question_payload": group_payload}

    for start in range(0, len(cloze_items), _GROUP_SIZE):
        chunk = cloze_items[start:start + _GROUP_SIZE]
        if len(chunk) < 2:
            idx, item = chunk[0]
            items_plan[idx] = {**item, "exercise_type": "cloze"}
            continue
        group_id = f"cloze_bank_{counter}"
        counter += 1
        word_bank = [item["word"] for _, item in chunk]
        random.shuffle(word_bank)
        group_payload = {"word_bank": word_bank}
        for idx, item in chunk:
            items_plan[idx] = {**item, "group_id": group_id, "question_payload": group_payload}

    return items_plan


# ─── Deterministic grading ────────────────────────────────────────────────────

def _normalize(text: str) -> str:
    return text.strip().lower()


def grade_deterministic(
    exercise_type: str,
    word: Any,
    response: str,
    question_data: Optional[dict] = None,
) -> dict[str, Any]:
    """
    Grade recognition/cloze/form types without Groq.
    Returns: {is_correct, usage_score, feedback, suggested_revision, correct_answer, srs_grade}
    srs_grade: 2=correct, 1=partial, 0=wrong
    """
    target = getattr(word, "word", "")
    definition = getattr(word, "definition", "") or ""
    correct_answer = (question_data or {}).get("correct_answer") if question_data else None

    norm_resp = _normalize(response)

    if exercise_type == "meaning_mc":
        expected = _normalize(correct_answer or definition)
        is_correct = norm_resp == expected
        return {
            "is_correct": is_correct,
            "usage_score": 100 if is_correct else 0,
            "feedback": None,
            "suggested_revision": None,
            "correct_answer": correct_answer or definition,
            "srs_grade": 2 if is_correct else 0,
        }

    if exercise_type == "reverse_mc":
        expected = _normalize(correct_answer or target)
        is_correct = norm_resp == expected
        return {
            "is_correct": is_correct,
            "usage_score": 100 if is_correct else 0,
            "feedback": None,
            "suggested_revision": None,
            "correct_answer": correct_answer or target,
            "srs_grade": 2 if is_correct else 0,
        }

    # Selection-based exact match (no typos possible) — match, cloze_bank,
    # synonym_antonym, odd_one_out all use click-to-select UI.
    if exercise_type in ("match", "cloze_bank", "synonym_antonym", "odd_one_out"):
        ca = correct_answer or target
        expected = _normalize(ca)
        is_correct = norm_resp == expected
        return {
            "is_correct": is_correct,
            "usage_score": 100 if is_correct else 0,
            "feedback": None,
            "suggested_revision": None,
            "correct_answer": ca,
            "srs_grade": 2 if is_correct else 0,
        }

    # cloze, spelling, anagram, word_formation — typed input; allow Levenshtein ≤1 partial
    expected = _normalize(correct_answer or target)
    if norm_resp == expected:
        return {
            "is_correct": True,
            "usage_score": 100,
            "feedback": None,
            "suggested_revision": None,
            "correct_answer": correct_answer or target,
            "srs_grade": 2,
        }
    if _levenshtein(norm_resp, expected) <= 1:
        return {
            "is_correct": False,
            "usage_score": 60,
            "feedback": f"Almost! The correct answer is \"{correct_answer or target}\".",
            "suggested_revision": None,
            "correct_answer": correct_answer or target,
            "srs_grade": 1,
        }
    return {
        "is_correct": False,
        "usage_score": 0,
        "feedback": f"Incorrect. The correct answer is \"{correct_answer or target}\".",
        "suggested_revision": None,
        "correct_answer": correct_answer or target,
        "srs_grade": 0,
    }
