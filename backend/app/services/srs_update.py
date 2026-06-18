"""Error-driven SRS engine for grammar points.

Two events update a grammar point's state:
  - apply_error(...)        an error of that category was found in an essay
  - apply_drill_result(...) a targeted drill for that point was answered right/wrong

Free essays only ever PENALISE categories where errors were found.
No error in category X does NOT mean mastery — you may simply not have used it.
Reward (interval growth) happens only in targeted drills.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List

from pydantic import BaseModel, Field

MIN_EASE = 1.3
START_EASE = 2.5


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class GrammarPointState(BaseModel):
    grammar_point_id: str
    reps: int = 0
    ease: float = START_EASE
    interval_days: float = 0.0
    lapses: int = 0
    correct_count: int = 0
    review_count: int = 0
    last_seen_at: datetime | None = None
    next_review_at: datetime | None = None

    @property
    def accuracy(self) -> float:
        return self.correct_count / self.review_count if self.review_count else 0.0

    @property
    def mastery(self) -> float:
        """0–1 blend of accuracy and interval confidence."""
        interval_factor = min(self.interval_days / 30.0, 1.0)
        return round(0.6 * self.accuracy + 0.4 * interval_factor, 3)


def apply_error(
    state: GrammarPointState,
    severity: str = "major",
    count: int = 1,
    now: datetime | None = None,
) -> GrammarPointState:
    """Lapse update: shrink interval, drop ease, queue the point back soon."""
    now = now or _utcnow()

    drop = 0.25 if severity == "major" else 0.10
    drop *= min(1 + 0.25 * (count - 1), 1.75)
    state.ease = max(MIN_EASE, round(state.ease - drop, 3))

    state.reps = 0
    state.lapses += 1
    state.interval_days = 1.0 if severity == "major" else 2.0
    state.last_seen_at = now
    state.next_review_at = now + timedelta(days=state.interval_days)
    return state


def apply_drill_result(
    state: GrammarPointState,
    correct: bool,
    now: datetime | None = None,
) -> GrammarPointState:
    """SM-2-style update for an explicit drill targeting this grammar point."""
    now = now or _utcnow()
    state.review_count += 1
    state.last_seen_at = now

    if not correct:
        state.ease = max(MIN_EASE, round(state.ease - 0.2, 3))
        state.reps = 0
        state.lapses += 1
        state.interval_days = 1.0
    else:
        state.correct_count += 1
        if state.reps == 0:
            state.interval_days = 1.0
        elif state.reps == 1:
            state.interval_days = 6.0
        else:
            state.interval_days = round(state.interval_days * state.ease, 2)
        state.reps += 1
        state.ease = round(state.ease + 0.05, 3)

    state.next_review_at = now + timedelta(days=state.interval_days)
    return state


def priority_score(state: GrammarPointState, now: datetime | None = None) -> float:
    """Higher = more urgent to drill next."""
    now = now or _utcnow()
    overdue_days = 0.0
    if state.next_review_at:
        overdue_days = max((now - state.next_review_at).total_seconds() / 86400.0, 0.0)
    return round(
        2.0 * overdue_days
        + 1.5 * (1 - state.mastery)
        + 0.5 * state.lapses,
        3,
    )


def build_drill_queue(
    states: List[GrammarPointState],
    limit: int = 10,
    now: datetime | None = None,
) -> List[GrammarPointState]:
    """Order grammar points for the next session by urgency."""
    now = now or _utcnow()
    ranked = sorted(states, key=lambda s: priority_score(s, now), reverse=True)
    return ranked[:limit]
