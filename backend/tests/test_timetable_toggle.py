"""Critical-path test: completing a time block must clear is_missed.

Regression for an earlier session bug where the day overview's "MISSED"
count inflated because completed blocks could simultaneously carry
is_completed=True AND is_missed=True. Two states are mutually exclusive
and the toggle endpoint enforces it.
"""
from datetime import date

from app import models


def _make_block(db_session, person, *, completed=False, missed=False):
    block = models.TimeBlock(
        person_id=person.id,
        title="Test block",
        date=date(2026, 5, 17),
        start_time="14:00",
        end_time="15:00",
        category="learning",
        is_completed=completed,
        is_missed=missed,
        deleted=False,
    )
    db_session.add(block)
    db_session.commit()
    db_session.refresh(block)
    return block


def test_toggle_clears_is_missed_when_completing(auth_client, db_session, test_user):
    """Block in 'missed' state must drop is_missed when marked complete."""
    block = _make_block(db_session, test_user, completed=False, missed=True)

    response = auth_client.patch(f"/api/timetable/{block.id}/toggle")

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["is_completed"] is True
    assert payload["is_missed"] is False, "completed blocks must not also be marked missed"


def test_toggle_preserves_is_missed_when_uncompleting(auth_client, db_session, test_user):
    """Going from completed → not completed must NOT silently re-mark missed."""
    block = _make_block(db_session, test_user, completed=True, missed=False)

    response = auth_client.patch(f"/api/timetable/{block.id}/toggle")

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["is_completed"] is False
    # Toggling back off shouldn't manufacture a "missed" state — that's the
    # nightly Celery job's job, not the toggle endpoint's.
    assert payload["is_missed"] is False


def test_toggle_404_when_block_belongs_to_another_user(auth_client, db_session, test_user):
    """Authenticated user must not be able to toggle someone else's blocks."""
    other = models.Person(
        name="Other User",
        email="other@test.local",
        hashed_password="x",
        timezone="Asia/Tashkent",
        is_active=True,
    )
    db_session.add(other)
    db_session.commit()
    db_session.refresh(other)
    foreign_block = _make_block(db_session, other)

    response = auth_client.patch(f"/api/timetable/{foreign_block.id}/toggle")

    assert response.status_code == 404
