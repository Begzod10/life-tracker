"""Unit tests for the shared block-completion service.

Covers the rules the toggle endpoint and the Telegram bot both rely on:
  * idempotency (second call with same state is a no-op),
  * ProgressLogTask sync for recurring-task-linked blocks,
  * ownership filter (person_id mismatch ⇒ None),
  * soft-delete filter (deleted=True ⇒ None),
  * is_missed mutual exclusivity with is_completed,
  * skip-without-log behaviour,
  * postpone enqueues exactly one Celery job and does NOT clear notified_at.
"""
from datetime import date, datetime
from unittest.mock import patch

import pytest

from app import models
from app.services.block_completion import (
    BlockToggleResult,
    set_block_completed,
    set_block_skipped,
    postpone_block_checkin,
    block_checkin_keyboard,
)


# ─── Fixtures ────────────────────────────────────────────────────────────────

@pytest.fixture
def goal(db_session, test_user):
    g = models.Goal(
        person_id=test_user.id,
        name="Test goal",
        status="active",
        deleted=False,
    )
    db_session.add(g)
    db_session.commit()
    db_session.refresh(g)
    return g


@pytest.fixture
def recurring_task(db_session, goal):
    t = models.Task(
        goal_id=goal.id,
        name="Daily reading",
        task_type="daily",
        is_recurring=True,
        deleted=False,
    )
    db_session.add(t)
    db_session.commit()
    db_session.refresh(t)
    return t


@pytest.fixture
def block(db_session, test_user):
    b = models.TimeBlock(
        person_id=test_user.id,
        title="Reading",
        date=date(2026, 5, 17),
        start_time="14:00",
        end_time="15:00",
        category="learning",
        is_completed=False,
        is_missed=False,
        deleted=False,
    )
    db_session.add(b)
    db_session.commit()
    db_session.refresh(b)
    return b


@pytest.fixture
def linked_block(db_session, test_user, recurring_task):
    b = models.TimeBlock(
        person_id=test_user.id,
        title="Reading",
        date=date(2026, 5, 17),
        start_time="14:00",
        end_time="15:00",
        category="learning",
        is_completed=False,
        is_missed=False,
        task_id=recurring_task.id,
        deleted=False,
    )
    db_session.add(b)
    db_session.commit()
    db_session.refresh(b)
    return b


def _log_count(db_session, task_id, log_date):
    return (
        db_session.query(models.ProgressLogTask)
        .filter(
            models.ProgressLogTask.task_id == task_id,
            models.ProgressLogTask.log_date == log_date,
        )
        .count()
    )


# ─── set_block_completed ─────────────────────────────────────────────────────

def test_set_completed_true_unlinked_block(db_session, test_user, block):
    result = set_block_completed(
        db_session, block.id, completed=True, person_id=test_user.id,
    )
    assert isinstance(result, BlockToggleResult)
    assert result.state_changed is True
    assert result.is_completed is True
    assert result.task is None
    assert result.streak == 0
    assert result.log_created is False
    db_session.refresh(block)
    assert block.is_completed is True


def test_set_completed_clears_is_missed(db_session, test_user, block):
    block.is_missed = True
    db_session.commit()

    result = set_block_completed(
        db_session, block.id, completed=True, person_id=test_user.id,
    )
    assert result.state_changed is True
    db_session.refresh(block)
    assert block.is_completed is True
    assert block.is_missed is False, (
        "completed blocks must never carry is_missed=True"
    )


def test_set_completed_uncompleting_preserves_is_missed(db_session, test_user, block):
    block.is_completed = True
    db_session.commit()

    result = set_block_completed(
        db_session, block.id, completed=False, person_id=test_user.id,
    )
    assert result.state_changed is True
    db_session.refresh(block)
    assert block.is_completed is False
    # The nightly Celery job is the only thing that should manufacture missed.
    assert block.is_missed is False


def test_set_completed_idempotent_when_already_completed(db_session, test_user, block):
    block.is_completed = True
    db_session.commit()

    result = set_block_completed(
        db_session, block.id, completed=True, person_id=test_user.id,
    )
    assert result is not None
    assert result.state_changed is False
    assert result.is_completed is True


def test_recurring_block_creates_exactly_one_log(
    db_session, test_user, linked_block, recurring_task
):
    """First Done tap writes one ProgressLogTask; second tap is a no-op."""
    r1 = set_block_completed(
        db_session, linked_block.id, completed=True, person_id=test_user.id,
    )
    assert r1.state_changed is True
    assert r1.log_created is True
    assert _log_count(db_session, recurring_task.id, linked_block.date) == 1

    r2 = set_block_completed(
        db_session, linked_block.id, completed=True, person_id=test_user.id,
    )
    assert r2.state_changed is False
    assert r2.log_created is False
    assert _log_count(db_session, recurring_task.id, linked_block.date) == 1, (
        "double-tap must not create a second ProgressLogTask"
    )


def test_recurring_block_uncomplete_removes_log(
    db_session, test_user, linked_block, recurring_task
):
    set_block_completed(
        db_session, linked_block.id, completed=True, person_id=test_user.id,
    )
    assert _log_count(db_session, recurring_task.id, linked_block.date) == 1

    r = set_block_completed(
        db_session, linked_block.id, completed=False, person_id=test_user.id,
    )
    assert r.state_changed is True
    assert _log_count(db_session, recurring_task.id, linked_block.date) == 0


def test_streak_counts_block_and_log_dates(
    db_session, test_user, linked_block, recurring_task
):
    """Streak source is the union of ProgressLogTask + completed TimeBlock."""
    today = linked_block.date  # use the block's own date as our "today" anchor

    # Pre-existing log on the day before — should chain with the block we'll
    # complete in a moment.
    db_session.add(
        models.ProgressLogTask(
            task_id=recurring_task.id,
            log_date=date(today.year, today.month, today.day - 1),
        )
    )
    db_session.commit()

    # Anchor the service's notion of "today" to the block date so the chain
    # ends at the block we're about to complete.
    with patch(
        "app.services.block_completion.tashkent_today",
        return_value=today,
    ):
        result = set_block_completed(
            db_session, linked_block.id, completed=True, person_id=test_user.id,
        )

    assert result.streak == 2, (
        "yesterday's log + today's completed block = 2-day streak"
    )


def test_set_completed_404_for_other_user(db_session, block):
    result = set_block_completed(
        db_session, block.id, completed=True, person_id=block.person_id + 999,
    )
    assert result is None


def test_set_completed_404_for_deleted_block(db_session, test_user, block):
    block.deleted = True
    db_session.commit()

    result = set_block_completed(
        db_session, block.id, completed=True, person_id=test_user.id,
    )
    assert result is None


def test_set_completed_404_for_missing_block(db_session, test_user):
    result = set_block_completed(
        db_session, block_id=999_999, completed=True, person_id=test_user.id,
    )
    assert result is None


# ─── set_block_skipped ───────────────────────────────────────────────────────

def test_skip_marks_missed_without_creating_log(
    db_session, test_user, linked_block, recurring_task
):
    result = set_block_skipped(
        db_session, linked_block.id, person_id=test_user.id,
    )
    assert result.state_changed is True
    db_session.refresh(linked_block)
    assert linked_block.is_missed is True
    assert linked_block.is_completed is False
    assert _log_count(db_session, recurring_task.id, linked_block.date) == 0


def test_skip_idempotent(db_session, test_user, block):
    set_block_skipped(db_session, block.id, person_id=test_user.id)
    result = set_block_skipped(db_session, block.id, person_id=test_user.id)
    assert result.state_changed is False
    db_session.refresh(block)
    assert block.is_missed is True


def test_skip_noop_when_already_completed(db_session, test_user, block):
    block.is_completed = True
    db_session.commit()
    result = set_block_skipped(db_session, block.id, person_id=test_user.id)
    assert result is not None
    assert result.state_changed is False
    db_session.refresh(block)
    assert block.is_missed is False, "must not mark a done block as missed"


# ─── postpone_block_checkin ──────────────────────────────────────────────────

def test_postpone_enqueues_celery_and_preserves_notified_at(
    db_session, test_user, block
):
    # The */5 sweeper filters on notified_at IS NULL; preserving a non-null
    # value keeps a deferred block out of its scope.
    block.notified_at = datetime(2026, 5, 17, 14, 0)
    db_session.commit()
    original_notified_at = block.notified_at

    with patch("app.tasks.send_block_checkin.apply_async") as mock_apply:
        result = postpone_block_checkin(
            db_session, block.id, delay_minutes=30, person_id=test_user.id,
        )

    assert result is not None
    assert result.state_changed is True
    mock_apply.assert_called_once_with(args=[block.id], countdown=30 * 60)

    db_session.refresh(block)
    assert block.notified_at == original_notified_at, (
        "postpone must NOT clear notified_at — the beat sweeper relies on "
        "it being non-null to skip the deferred block"
    )


def test_postpone_404_for_other_user(db_session, block):
    with patch("app.tasks.send_block_checkin.apply_async") as mock_apply:
        result = postpone_block_checkin(
            db_session, block.id, person_id=block.person_id + 999,
        )
    assert result is None
    mock_apply.assert_not_called()


# ─── Keyboard contract ───────────────────────────────────────────────────────

def test_keyboard_callback_data_under_64_bytes():
    # Telegram caps callback_data at 64 bytes. Verify our encoding even at
    # billion-scale block ids.
    kb = block_checkin_keyboard(9_999_999_999)
    for button in kb["inline_keyboard"][0]:
        assert len(button["callback_data"].encode("utf-8")) <= 64


def test_keyboard_has_expected_actions():
    kb = block_checkin_keyboard(42)
    callbacks = [b["callback_data"] for b in kb["inline_keyboard"][0]]
    assert callbacks == ["tb:d:42", "tb:s:42", "tb:p:42"]
