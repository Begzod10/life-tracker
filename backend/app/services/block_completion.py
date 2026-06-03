"""
Shared completion logic for `TimeBlock` — used by both:
  * PATCH /timetable/{id}/toggle (the React UI), and
  * Telegram inline-button callbacks (tb:d / tb:s / tb:p).

The web and the bot used to flip `is_completed` in two separate code paths.
That worked until the toggle endpoint grew the ProgressLogTask sync rule for
recurring tasks — the bot path silently kept omitting the log, so a recurring
task completed via Telegram never counted toward its streak. Keeping the rule
in one place avoids that drift.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from app import models


TASHKENT_OFFSET = timedelta(hours=5)


def tashkent_today() -> date:
    """User-local 'today'. Server is UTC, users are in Tashkent (UTC+5)."""
    return (datetime.utcnow() + TASHKENT_OFFSET).date()


@dataclass(frozen=True)
class BlockToggleResult:
    block: models.TimeBlock
    task: Optional[models.Task]      # the linked recurring task, if any
    state_changed: bool              # did we actually write?
    is_completed: bool               # post-write is_completed value
    streak: int                      # 0 when not linked to a recurring task
    log_created: bool                # did we add a ProgressLogTask just now?


# ─── Inline keyboard for the */5 check-in prompt ─────────────────────────────

def block_checkin_text(block: models.TimeBlock) -> str:
    return (
        f"⏰ Time's up! Did you complete: <b>{block.title}</b> "
        f"({block.start_time}–{block.end_time})?"
    )


def block_checkin_keyboard(block_id: int) -> dict:
    """
    Three-button row. Keep callback_data ≤ 64 bytes — the `tb:{d|s|p}:{id}`
    encoding fits comfortably even for billion-scale block IDs.
    """
    return {
        "inline_keyboard": [[
            {"text": "✅ Done", "callback_data": f"tb:d:{block_id}"},
            {"text": "❌ Skip", "callback_data": f"tb:s:{block_id}"},
            {"text": "⏰ +30m",  "callback_data": f"tb:p:{block_id}"},
        ]]
    }


# ─── DB-level helpers ────────────────────────────────────────────────────────

def _load_block(
    db: Session, block_id: int, person_id: Optional[int]
) -> Optional[models.TimeBlock]:
    """
    Re-read the block under the active session so concurrent callers (web
    toggle + bot tap on the same block) can't double-write. `person_id=None`
    bypasses the ownership check — used by the Celery one-off re-prompt that
    already trusts the block.
    """
    block = (
        db.query(models.TimeBlock)
        .filter(
            models.TimeBlock.id == block_id,
            models.TimeBlock.deleted == False,
        )
        .first()
    )
    if not block:
        return None
    if person_id is not None and block.person_id != person_id:
        return None
    return block


def _recurring_task(
    db: Session, block: models.TimeBlock
) -> Optional[models.Task]:
    if not block.task_id:
        return None
    task = (
        db.query(models.Task)
        .filter(models.Task.id == block.task_id)
        .first()
    )
    if task and task.is_recurring:
        return task
    return None


def _streak_for_task(db: Session, task: models.Task) -> int:
    """
    Consecutive days ending today (Tashkent) on which this recurring task was
    completed. Matches /tasks/recurring-stats: completion = ProgressLogTask
    log OR a completed TimeBlock for that date.
    """
    log_dates = {
        log.log_date
        for log in db.query(models.ProgressLogTask)
        .filter(models.ProgressLogTask.task_id == task.id)
        .all()
    }
    block_dates = {
        b.date
        for b in db.query(models.TimeBlock)
        .filter(
            models.TimeBlock.task_id == task.id,
            models.TimeBlock.is_completed == True,
            models.TimeBlock.deleted == False,
        )
        .all()
    }
    completed = log_dates | block_dates

    today = tashkent_today()
    cursor = today if today in completed else today - timedelta(days=1)
    streak = 0
    while cursor in completed:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


# ─── Public mutations ────────────────────────────────────────────────────────

def set_block_completed(
    db: Session,
    block_id: int,
    *,
    completed: bool,
    person_id: Optional[int] = None,
) -> Optional[BlockToggleResult]:
    """
    Set the block's completion state. Idempotent:
      * second call with the same `completed` value is a no-op,
      * for a recurring-task-linked block, the ProgressLogTask is created on
        the way to True and deleted on the way back to False — never duplicated.

    Returns `None` when the block is missing, soft-deleted, or not owned by
    `person_id`.
    """
    block = _load_block(db, block_id, person_id)
    if not block:
        return None

    task = _recurring_task(db, block)
    state_changed = False
    log_created = False

    if block.is_completed != completed:
        block.is_completed = completed
        # Mutually exclusive with is_missed — see test_toggle_clears_is_missed.
        if completed:
            block.is_missed = False
        state_changed = True

    if task is not None:
        log_date = block.date
        existing = (
            db.query(models.ProgressLogTask)
            .filter(
                models.ProgressLogTask.task_id == task.id,
                models.ProgressLogTask.log_date == log_date,
            )
            .first()
        )
        if completed and existing is None:
            db.add(models.ProgressLogTask(task_id=task.id, log_date=log_date))
            log_created = True
            state_changed = True
        elif (not completed) and existing is not None:
            db.delete(existing)
            state_changed = True

    if state_changed:
        db.commit()
        db.refresh(block)

    streak = _streak_for_task(db, task) if task is not None else 0
    return BlockToggleResult(
        block=block,
        task=task,
        state_changed=state_changed,
        is_completed=block.is_completed,
        streak=streak,
        log_created=log_created,
    )


def set_block_skipped(
    db: Session,
    block_id: int,
    *,
    person_id: Optional[int] = None,
) -> Optional[BlockToggleResult]:
    """
    "❌ Skip" button: leave is_completed as-is, mark is_missed=True. Does NOT
    create a ProgressLogTask. Idempotent.
    """
    block = _load_block(db, block_id, person_id)
    if not block:
        return None

    task = _recurring_task(db, block)
    state_changed = False
    if not block.is_completed and not block.is_missed:
        block.is_missed = True
        state_changed = True
        db.commit()
        db.refresh(block)

    streak = _streak_for_task(db, task) if task is not None else 0
    return BlockToggleResult(
        block=block,
        task=task,
        state_changed=state_changed,
        is_completed=block.is_completed,
        streak=streak,
        log_created=False,
    )


def postpone_block_checkin(
    db: Session,
    block_id: int,
    *,
    delay_minutes: int = 30,
    person_id: Optional[int] = None,
) -> Optional[BlockToggleResult]:
    """
    "⏰ +30m" button: re-prompt later.

    We deliberately do NOT clear `notified_at` — the */5 beat sweeper filters
    on `notified_at IS NULL`, so a non-null value keeps it out of scope. The
    actual re-prompt is the one-off Celery task we enqueue here.

    Import is local — `app.tasks` imports services at task-time, so a
    top-level import would cycle on module load.
    """
    block = _load_block(db, block_id, person_id)
    if not block:
        return None

    from app.tasks import send_block_checkin
    send_block_checkin.apply_async(args=[block.id], countdown=delay_minutes * 60)

    task = _recurring_task(db, block)
    streak = _streak_for_task(db, task) if task is not None else 0
    return BlockToggleResult(
        block=block,
        task=task,
        state_changed=True,
        is_completed=block.is_completed,
        streak=streak,
        log_created=False,
    )
