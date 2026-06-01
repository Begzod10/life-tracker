"""Spaced-repetition scheduler.

Pure functions: no ORM-model imports. Callers pass the SQLAlchemy
mapped class as the `Word` arg so this module stays unit-testable.

Replaces the legacy fixed [1, 2, 4, 7, 14, 30, 60] day ladder with a
per-card SM-2 variant. Cards diverge by individual difficulty:

  - ease_factor   per-card growth multiplier (default 2.5, floor 1.3)
  - reps          consecutive-success counter, resets on lapse
  - lapses        lifetime forget count, feeds leech + weak detection

`apply_result` accepts a 3-level grade (0/1/2) but remains backward
compatible with the legacy binary `was_correct`. `correct_count` is
still incremented for display purposes; the scheduler no longer reads
lifetime accuracy at all.
"""

from __future__ import annotations

import random
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from sqlalchemy import and_, case, func, or_, select


# ─── Tunables ────────────────────────────────────────────────────────────────
DEFAULT_EASE = 2.5
MIN_EASE = 1.3
EASE_LAPSE_PENALTY = 0.20      # subtracted when a learned card is forgotten
EASE_HARD_PENALTY = 0.15       # subtracted on a "hard" (close-but-not-exact) pass
FIRST_INTERVAL = 1             # days, after the 1st success
SECOND_INTERVAL = 3            # days, after the 2nd success (gentle for B1 learners)
HARD_MULTIPLIER = 1.2          # growth for a "hard" pass (vs ease_factor for "good")
FUZZ_RATIO = 0.10              # +/- jitter on intervals >= 2 days
MATURE_THRESHOLD = 21          # interval_days boundary for "mature" (Anki-style)
WEAK_EASE = 2.0
LEECH_LAPSES = 5               # surface as a leech after this many lapses


# ─── Core scheduler ──────────────────────────────────────────────────────────

def _fuzz(interval_days: int) -> int:
    """Spread due dates so a big cohort doesn't all land on the same day."""
    if interval_days < 2:
        return interval_days
    delta = max(1, round(interval_days * FUZZ_RATIO))
    return interval_days + random.randint(-delta, delta)


def schedule_after_review(
    *,
    reps: int,
    lapses: int,
    ease_factor: float,
    interval_days: int,
    grade: int,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Given a card's SR state + a grade, return the next state.

    grade: 0 = wrong/forgot, 1 = hard (close), 2 = good (exact/correct).
    """
    now = now or datetime.utcnow()
    ef = ease_factor or DEFAULT_EASE

    if grade == 0:
        # Lapse: penalize ease, reset progress, requeue immediately.
        # interval_days=0 + next_review_at=now preserves the existing
        # "just-missed word reappears in the very next session"
        # invariant the practice pool sort depends on.
        lapses += 1
        reps = 0
        ef = max(MIN_EASE, ef - EASE_LAPSE_PENALTY)
        return {
            "reps": reps,
            "lapses": lapses,
            "ease_factor": round(ef, 2),
            "interval_days": 0,
            "next_review_at": now,
            "is_leech": lapses >= LEECH_LAPSES,
        }

    # Passed (hard or good).
    if reps == 0:
        new_interval = FIRST_INTERVAL
    elif reps == 1:
        new_interval = SECOND_INTERVAL
    else:
        mult = HARD_MULTIPLIER if grade == 1 else ef
        # never let an interval shrink or stall on a successful pass
        new_interval = max(interval_days + 1, round(interval_days * mult))

    if grade == 1:
        ef = max(MIN_EASE, ef - EASE_HARD_PENALTY)

    reps += 1
    new_interval = _fuzz(new_interval)
    return {
        "reps": reps,
        "lapses": lapses,
        "ease_factor": round(ef, 2),
        "interval_days": new_interval,
        "next_review_at": now + timedelta(days=new_interval),
        "is_leech": lapses >= LEECH_LAPSES,
    }


# ─── Grade mapping from existing frontend signals ───────────────────────────

def grade_from_spelling(is_close_result: dict) -> int:
    """isCloseSpelling already returns {ok, exact}; stop throwing the
    close-but-not-exact signal away.

    Used by spelling / listening / cloze, which all have a typed answer:
        exact          -> 2 (good)
        close (1-2 ed) -> 1 (hard)  — smaller interval bump, ease penalty
        wrong          -> 0 (lapse)

    Flashcard swipe and quiz MCQ stay binary: known/correct -> 2, else -> 0.
    """
    if not is_close_result.get("ok"):
        return 0
    return 2 if is_close_result.get("exact") else 1


# ─── apply_result: orchestrates an ORM word + a graded answer ────────────────

def apply_result(
    word: Any,
    *,
    grade: Optional[int] = None,
    was_correct: Optional[bool] = None,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    """Update a DictionaryWord in place with the next SR state.

    Backward compatible: callers can pass either `grade` (preferred)
    or the legacy `was_correct`. Returns the scheduler dict so the
    API response can surface `is_leech` for client-side flagging.
    """
    now = now or datetime.utcnow()
    if grade is None:
        grade = 2 if was_correct else 0

    word.review_count = (word.review_count or 0) + 1
    if grade != 0:
        # Lifetime accuracy: display only now.
        word.correct_count = (word.correct_count or 0) + 1
    word.last_reviewed_at = now

    sched = schedule_after_review(
        reps=word.reps or 0,
        lapses=word.lapses or 0,
        ease_factor=word.ease_factor or DEFAULT_EASE,
        interval_days=word.interval_days or 0,
        grade=grade,
        now=now,
    )
    word.reps = sched["reps"]
    word.lapses = sched["lapses"]
    word.ease_factor = sched["ease_factor"]
    word.interval_days = sched["interval_days"]
    word.next_review_at = sched["next_review_at"]
    return sched


# ─── Retention buckets (replaces flat accuracy in /stats) ────────────────────

def bucket_expr(Word):
    """SQLAlchemy CASE expression mapping a word's current state into a
    learner-meaningful bucket."""
    return case(
        (Word.review_count == 0, "new"),
        (Word.interval_days <= 1, "learning"),  # incl. just-lapsed
        (Word.interval_days <= MATURE_THRESHOLD, "young"),
        else_="mature",
    )


def retention_buckets(
    session,
    Word,
    person_id: int,
    *,
    folder_id: Optional[int] = None,
    module_id: Optional[int] = None,
) -> Dict[str, int]:
    """Returns {'new': n, 'learning': n, 'young': n, 'mature': n}."""
    conds = [Word.person_id == person_id, Word.deleted.is_(False)]
    if module_id is not None:
        conds.append(Word.module_id == module_id)
    elif folder_id is not None:
        # words -> module -> folder; relies on Word.module relationship
        conds.append(Word.module.has(folder_id=folder_id))

    label = bucket_expr(Word).label("bucket")
    rows = session.execute(
        select(label, func.count().label("n")).where(*conds).group_by(label)
    ).all()
    out: Dict[str, int] = {"new": 0, "learning": 0, "young": 0, "mature": 0}
    for bucket, n in rows:
        out[bucket] = n
    return out


# ─── Redefined "weak" (fragile current retention) ────────────────────────────

def weak_condition(Word):
    """A word is "weak" when its *current* retention is fragile, not
    when its lifetime hit-rate is low. Three independent signals
    qualify a card; any one fires:

      - ease_factor < WEAK_EASE       chronically hard ("leech-ish")
      - lapses >= 2                   forgotten more than once
      - interval_days <= 7 AND reps <= 1
                                      still stuck in early learning

    review_count >= 2 keeps never-reviewed cards out of "weak" — they
    belong in "new" instead.
    """
    return and_(
        Word.review_count >= 2,
        or_(
            Word.ease_factor < WEAK_EASE,
            Word.lapses >= 2,
            and_(Word.interval_days <= 7, Word.reps <= 1),
        ),
    )


# ─── Default /practice/words priority ────────────────────────────────────────

def pool_priority_order(Word, now: datetime):
    """Coverage-aware, ease-weighted ordering for the default practice pool.

        bucket 0: due now / just-missed   (next_review_at <= now or null)
        bucket 1: never reviewed          (oldest first)
        then    : hardest first (low ease), then shortest interval
    """
    pri = case(
        (or_(Word.next_review_at.is_(None), Word.next_review_at <= now), 0),
        (Word.review_count == 0, 1),
        else_=2,
    )
    return [
        pri.asc(),
        Word.ease_factor.asc(),
        Word.interval_days.asc(),
        Word.created_at.asc(),
    ]


# ─── Leeches (powered by the lapses field) ───────────────────────────────────

def leeches(session, Word, person_id: int, limit: int = 20):
    """Cards the learner has forgotten LEECH_LAPSES+ times. Surface
    these so the learner can pause, study them deliberately, or
    reformulate the entry."""
    return session.execute(
        select(Word)
        .where(
            Word.person_id == person_id,
            Word.deleted.is_(False),
            Word.lapses >= LEECH_LAPSES,
        )
        .order_by(Word.lapses.desc(), Word.ease_factor.asc())
        .limit(limit)
    ).scalars().all()
