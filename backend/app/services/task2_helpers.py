"""Task 2 essay grading helpers — grader prompt, grade coercion, OpenAI client, grammar SRS."""
import json
import logging
import os
import random as _random
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app import models
from app.config import settings
from app.services.essay_service import VALID_ESSAY_ERRORS, round_to_half_band
from app.services.grammar_grading import (
    SYSTEM_PROMPT as GRAMMAR_SYSTEM_PROMPT,
    build_user_prompt as build_grammar_prompt,
)
from app.services.srs_update import (
    GrammarPointState,
    apply_drill_result,
    apply_error,
    build_drill_queue,
    priority_score,
)

logger = logging.getLogger(__name__)


_ESSAY_GRADER_SYSTEM = """\
You are an expert IELTS Writing Task 2 examiner. Grade candidate essays strictly \
according to the four official IELTS criteria:

1. **Task Response (TR)** — Does the essay fully address all parts of the task? \
Is the position clear and supported?
2. **Coherence and Cohesion (CC)** — Is the essay logically organised? Is cohesive \
language used accurately and not mechanically?
3. **Lexical Resource (LR)** — Is the vocabulary range appropriate? Are words used \
with precision and natural collocation?
4. **Grammatical Range and Accuracy (GRA)** — Is sentence structure varied? \
Are grammatical errors infrequent?

Score each criterion on the IELTS 9-band scale in increments of 0.5 \
(e.g. 5.0, 5.5, 6.0, 6.5 … 9.0). \
Round the mean of the four criteria to the nearest 0.5 for overall_band.

Return ONLY valid JSON with this exact shape:
{
  "task_response": <float 1-9>,
  "coherence_cohesion": <float 1-9>,
  "lexical_resource": <float 1-9>,
  "grammatical_range_accuracy": <float 1-9>,
  "overall_band": <float 1-9>,
  "is_correct": <true if overall_band >= target_band else false>,
  "essay_errors": [<up to 5 error keys from the allowed set>],
  "feedback": "<2-3 sentences: one strength, one main weakness, one concrete suggestion>",
  "model_revision": "<revised version of the opening sentence ONLY, showing better range/accuracy. Omit if band 8+>"
}

Allowed essay_error keys (return ONLY keys from this list, or an empty array):
no_clear_position, doesnt_address_all_parts, underdeveloped_idea, missing_topic_sentence,
weak_cohesion, paragraphing_issue, no_referencing, overgeneralization, repetitive_vocabulary,
informal_register, template_overuse, weak_conclusion, irrelevant_content, off_topic
"""


def _essay_grader_prompt(payload: dict) -> str:
    question = payload["question"]
    question_type = payload["question_type"]
    essay_type = payload["essay_type"]
    assigned_position = payload.get("assigned_position")
    target_band = payload.get("target_band", 7.0)
    response = payload["response"]
    word_count = payload.get("word_count", 0)
    drill_instruction = payload.get("drill_instruction")

    lines = [
        f"QUESTION TYPE: {question_type}",
        f"ESSAY TYPE: {essay_type}",
        f"TARGET BAND: {target_band}",
        "",
        f"TASK QUESTION:\n{question}",
    ]
    if assigned_position:
        lines += ["", f"ASSIGNED POSITION: {assigned_position}"]
    if drill_instruction:
        lines += ["", f"DRILL FOCUS: {drill_instruction}"]
    lines += [
        "",
        f"CANDIDATE RESPONSE ({word_count} words):",
        response,
    ]
    return "\n".join(lines)


def _coerce_essay_grade(raw: dict, target_band: float) -> dict:
    def _clamp_band(val) -> Optional[float]:
        if val is None:
            return None
        try:
            f = float(val)
        except (TypeError, ValueError):
            return None
        f = max(1.0, min(9.0, round(f * 2) / 2))
        return f

    tr  = _clamp_band(raw.get("task_response"))
    cc  = _clamp_band(raw.get("coherence_cohesion"))
    lr  = _clamp_band(raw.get("lexical_resource"))
    gra = _clamp_band(raw.get("grammatical_range_accuracy"))

    filled = [x for x in [tr, cc, lr, gra] if x is not None]
    if filled:
        computed = round_to_half_band(sum(filled) / len(filled))
    else:
        computed = None

    overall = _clamp_band(raw.get("overall_band")) or computed
    is_correct = bool(overall is not None and overall >= target_band)

    feedback = (raw.get("feedback") or "").strip() or None
    revision = raw.get("model_revision")
    revision = revision.strip() if isinstance(revision, str) and revision.strip() else None

    raw_errors = raw.get("essay_errors")
    essay_errors: Optional[list[str]] = None
    if isinstance(raw_errors, list):
        essay_errors = [e for e in raw_errors if isinstance(e, str) and e in VALID_ESSAY_ERRORS] or None

    criteria_scores = {
        "task_response": tr,
        "coherence_cohesion": cc,
        "lexical_resource": lr,
        "grammatical_range_accuracy": gra,
    }

    return {
        "criteria_scores": criteria_scores,
        "overall_band": overall,
        "is_correct": is_correct,
        "essay_errors": essay_errors,
        "feedback": feedback,
        "model_revision": revision,
    }


async def _call_openai_json(system_prompt: str, user_prompt: str, max_tokens: int = 900) -> dict:
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
    try:
        response = await client.chat.completions.create(
            model=settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=max_tokens,
            temperature=0.2,
            response_format={"type": "json_object"},
        )
    except AuthenticationError as exc:
        logger.error("OpenAI auth failed: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"OpenAI auth failed: {exc}") from exc
    except RateLimitError as exc:
        logger.error("OpenAI rate-limited: %s", exc)
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                            detail=f"OpenAI rate-limited: {exc}") from exc
    except APIConnectionError as exc:
        logger.error("OpenAI unreachable: %s", exc)
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                            detail=f"OpenAI unreachable: {exc}") from exc
    except APIError as exc:
        logger.error("OpenAI API error: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"OpenAI API error: {exc}") from exc

    if not response.choices:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail="OpenAI returned no choices.")
    choice = response.choices[0]
    raw = choice.message.content
    if not raw:
        finish = getattr(choice, "finish_reason", "unknown")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"OpenAI returned empty content (finish_reason={finish}).")
    raw = raw.strip()
    raw = re.sub(r'^```(?:json)?\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        finish = getattr(choice, "finish_reason", "unknown")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail=f"OpenAI invalid JSON (finish_reason={finish}): {raw[:200]}")

    if not isinstance(data, dict):
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY,
                            detail="OpenAI response was not a JSON object.")
    return data


async def _grade_essay_via_openai(payload: dict) -> dict:
    return await _call_openai_json(
        system_prompt=_ESSAY_GRADER_SYSTEM,
        user_prompt=_essay_grader_prompt(payload),
        max_tokens=max(900, 250 + 250 * 1),
    )


async def _run_grammar_extraction(essay_text: str, essay_type: str) -> dict:
    """Call OpenAI to extract grammar errors from an essay. Returns raw parsed dict."""
    prompt = build_grammar_prompt(student_answer=essay_text, exercise_type=essay_type)
    return await _call_openai_json(
        system_prompt=GRAMMAR_SYSTEM_PROMPT,
        user_prompt=prompt,
        max_tokens=700,
    )


# ─── Grammar SRS helpers ──────────────────────────────────────────────────────

def _db_to_state(row: models.UserGrammarPoint) -> GrammarPointState:
    return GrammarPointState(
        grammar_point_id=row.grammar_point_id,
        reps=row.reps,
        ease=row.ease,
        interval_days=row.interval_days,
        lapses=row.lapses,
        correct_count=row.correct_count,
        review_count=row.review_count,
        last_seen_at=row.last_seen_at,
        next_review_at=row.next_review_at,
    )


def _state_to_db(row: models.UserGrammarPoint, state: GrammarPointState) -> None:
    row.reps = state.reps
    row.ease = state.ease
    row.interval_days = state.interval_days
    row.lapses = state.lapses
    row.correct_count = state.correct_count
    row.review_count = state.review_count
    row.last_seen_at = state.last_seen_at
    row.next_review_at = state.next_review_at


def _get_or_create_grammar_point(
    db: Session, person_id: int, grammar_point_id: str
) -> models.UserGrammarPoint:
    row = (
        db.query(models.UserGrammarPoint)
        .filter_by(person_id=person_id, grammar_point_id=grammar_point_id)
        .first()
    )
    if row is None:
        row = models.UserGrammarPoint(
            person_id=person_id,
            grammar_point_id=grammar_point_id,
        )
        db.add(row)
    return row


# ─── Error Hunt sentence bank ─────────────────────────────────────────────────

_ERROR_HUNT_SENTENCES: dict[str, list[str]] = {
    "articles": [
        "The development of a strong education system is essential for every society.",
        "A university degree is often seen as a requirement for a well-paid job.",
        "The government should invest in the public transport to reduce congestion.",
        "An increase in the renewable energy usage is needed to fight climate change.",
        "The people who work long hours often suffer from burnout and health problems.",
    ],
    "prepositions": [
        "Many students rely on their teachers for guidance in their academic studies.",
        "The government should invest in infrastructure to improve quality of life.",
        "Excessive use of social media has a negative impact on mental health.",
        "Authorities should allocate more funds to sustainable transport systems.",
        "Young people need to be aware of the dangers associated with online activity.",
    ],
    "subject_verb_agreement": [
        "The number of people who use social media is increasing every year.",
        "A group of scientists have published a report on climate change solutions.",
        "Each of the proposals submitted by the team was carefully evaluated.",
        "The quality of the products available in local shops has improved recently.",
        "Neither the government nor private companies are doing enough to reduce pollution.",
    ],
    "comparatives_superlatives": [
        "Modern devices are faster and more efficient than the older models.",
        "Public transport is cheaper than owning a private vehicle in most cities.",
        "The most effective solution is to invest in renewable energy sources.",
        "Smaller class sizes lead to better educational outcomes for students.",
        "Living in a rural area is often more peaceful than living in a city.",
    ],
    "complex_sentences": [
        "While technology has many benefits, it also presents significant challenges.",
        "Although automation creates job losses, it also generates new opportunities.",
        "Even though cities are crowded, many people prefer urban lifestyles.",
        "Whereas some people prefer remote work, others thrive in office environments.",
        "Despite the benefits of globalisation, many local traditions are disappearing.",
    ],
    "tense_consistency": [
        "The researcher collected the data and then analysed the results carefully.",
        "Many students study hard but struggled to perform well in examinations.",
        "The government introduced new policies and monitored their effectiveness.",
        "Scientists discovered the link between diet and health and published their findings.",
        "The company launched a new product and received positive feedback from customers.",
    ],
    "word_order": [
        "It is widely believed that education is the key to social mobility.",
        "Rarely do governments invest enough in mental health services.",
        "Only by working together can we solve the problem of climate change.",
        "Never before has technology played such a central role in daily life.",
        "Seldom do young people consider the long-term effects of their choices.",
    ],
    "punctuation_run_on": [
        "Technology has transformed communication; people can now connect instantly.",
        "Many students struggle with time management; they often leave work until the last minute.",
        "Exercise has numerous benefits. It improves both physical and mental health.",
        "Online learning is growing rapidly; universities are adapting their programmes.",
        "Cities face serious pollution problems. Governments must act urgently to address them.",
    ],
    "modal_verbs": [
        "Governments should invest more in renewable energy to combat climate change.",
        "Students must develop critical thinking skills to succeed in higher education.",
        "Employers could offer flexible working arrangements to improve productivity.",
        "Citizens might benefit from better public health education programmes.",
        "Schools should provide more opportunities for creative expression and arts.",
    ],
    "gerund_infinitive": [
        "Many people avoid using public transport because of overcrowding.",
        "The government decided to invest in renewable energy infrastructure.",
        "Students should consider taking a gap year to gain real-world experience.",
        "Companies have started to adopt more environmentally friendly practices.",
        "Young people often struggle to find affordable housing in major cities.",
    ],
    "passive_voice": [
        "New environmental regulations have been introduced by the government.",
        "A significant amount of food is wasted by households every year.",
        "Children are often influenced by the media and advertising campaigns.",
        "The new policy was received positively by both businesses and consumers.",
        "Important decisions about public health are made by elected officials.",
    ],
    "countable_uncountable": [
        "A great deal of research has been conducted into the effects of screen time.",
        "Much of the information available online is unreliable and misleading.",
        "Furniture in modern offices is often designed to promote collaboration.",
        "The amount of traffic on city roads continues to increase each year.",
        "Little evidence exists to support the claim that longer working hours increase productivity.",
    ],
    "plural_singular": [
        "The main criteria for selecting candidates are experience and qualifications.",
        "The data collected by researchers suggest a link between diet and mental health.",
        "Several phenomena have been observed in the field of climate science.",
        "The media often focuses on negative events rather than positive developments.",
        "Economic crises can have long-lasting effects on employment and living standards.",
    ],
}

# Load grammar_points.json once at module level
_GP_CATALOG: dict[str, dict] = {}
try:
    _catalog_path = os.path.join(os.path.dirname(__file__), "..", "assets", "grammar_points.json")
    with open(_catalog_path, encoding="utf-8") as _f:
        _GP_CATALOG = {p["id"]: p for p in json.load(_f)}
except Exception as _e:
    logger.warning("Failed to load grammar_points.json: %s", _e)
