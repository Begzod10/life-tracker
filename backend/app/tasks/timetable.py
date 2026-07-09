"""
Timetable Celery tasks:
  - copy_recurring_blocks       : Saturday — copy recurring blocks to next week
  - propagate_recurring_category: on-demand — sync category change across siblings
  - mark_missed_blocks          : daily 00:05 UTC — mark incomplete past blocks as missed
  - check_block_completions     : every 5 min — prompt about just-ended blocks
  - send_block_checkin          : one-off re-prompt after user defers a block
  - carryover_missed_tasks      : daily 22:05 Tashkent — carry missed recurring blocks to tomorrow
"""
from datetime import date, datetime, timedelta

import logging

from app.celery_app import celery_app
from app.database import SessionLocal
from app import models
from app.bot.telegram import send_message, is_configured

logger = logging.getLogger(__name__)


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _block_end_datetime(block) -> datetime | None:
    """Return the block's end as a full datetime, or None if unparseable."""
    if not block.end_time or not block.date:
        return None
    try:
        h, m = block.end_time.split(":")
        return datetime.combine(block.date, datetime.min.time()).replace(
            hour=int(h), minute=int(m)
        )
    except (ValueError, AttributeError):
        return None


def _to_minutes(t: str) -> int:
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def _find_free_slot(occupied: list, dur: int, start_from_h: int = 8, limit_h: int = 22) -> tuple | None:
    """Return (hour, minute) of the first free slot before limit_h, or None."""
    for h in range(start_from_h, limit_h):
        for m in (0, 30):
            s = h * 60 + m
            e = s + dur
            if e > limit_h * 60:
                continue
            if all(not (s < _to_minutes(et) and e > _to_minutes(st)) for st, et in occupied):
                return (h, m)
    return None


def _is_recurring_task(db, task_id: int) -> bool:
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    return bool(task and task.is_recurring)


# ─── Tasks ───────────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.copy_recurring_blocks", bind=True, max_retries=3)
def copy_recurring_blocks(self):
    """
    Copy all recurring time blocks to the same weekday in the next week.
    Runs every Saturday at 00:00 UTC so the upcoming week is ready in advance.

    Skips a block if an identical one (same person, date, start_time, title)
    already exists to prevent duplicates on retries. Also skips carry-over
    blocks (titles starting with "↩") — those are one-off by definition and
    must never propagate as recurring even if their flag was set incorrectly.
    """
    db = SessionLocal()
    try:
        today = date.today()
        week_ago = today - timedelta(days=7)

        recurring = (
            db.query(models.TimeBlock)
            .filter(
                models.TimeBlock.is_recurring == True,
                models.TimeBlock.deleted == False,
                models.TimeBlock.date >= week_ago,
                models.TimeBlock.date <= today,
            )
            .all()
        )

        created = 0
        skipped = 0

        for block in recurring:
            if block.title and block.title.lstrip().startswith("↩"):
                skipped += 1
                continue

            next_date = block.date + timedelta(weeks=1)

            exists = (
                db.query(models.TimeBlock)
                .filter(
                    models.TimeBlock.person_id == block.person_id,
                    models.TimeBlock.date == next_date,
                    models.TimeBlock.start_time == block.start_time,
                    models.TimeBlock.title == block.title,
                    models.TimeBlock.deleted == False,
                )
                .first()
            )

            if exists:
                skipped += 1
                continue

            new_block = models.TimeBlock(
                person_id=block.person_id,
                title=block.title,
                description=block.description,
                date=next_date,
                start_time=block.start_time,
                end_time=block.end_time,
                category=block.category,
                color=block.color,
                task_id=block.task_id,
                is_recurring=True,
                is_completed=False,
                deleted=False,
            )
            db.add(new_block)
            created += 1

        db.commit()
        logger.info("copy_recurring_blocks: created=%d skipped=%d", created, skipped)
        return {"created": created, "skipped": skipped}

    except Exception as exc:
        db.rollback()
        logger.exception("copy_recurring_blocks failed: %s", exc)
        raise self.retry(exc=exc, countdown=60 * 10)
    finally:
        db.close()


@celery_app.task(name="app.tasks.propagate_recurring_category", bind=True, max_retries=3)
def propagate_recurring_category(self, block_id: int, new_category: str, person_id: int):
    """
    When a recurring block's category is changed, update all future recurring blocks
    with the same title + start_time + end_time for the same person.
    Runs as a background task so the API response is immediate.
    """
    db = SessionLocal()
    try:
        today = date.today()

        source = db.query(models.TimeBlock).filter(
            models.TimeBlock.id == block_id,
            models.TimeBlock.person_id == person_id,
            models.TimeBlock.deleted == False,
        ).first()

        if not source:
            logger.warning("propagate_recurring_category: block %d not found", block_id)
            return {"updated": 0}

        siblings = db.query(models.TimeBlock).filter(
            models.TimeBlock.person_id == person_id,
            models.TimeBlock.title == source.title,
            models.TimeBlock.start_time == source.start_time,
            models.TimeBlock.end_time == source.end_time,
            models.TimeBlock.is_recurring == True,
            models.TimeBlock.deleted == False,
            models.TimeBlock.date >= today,
        ).all()

        updated = 0
        for block in siblings:
            block.category = new_category
            updated += 1

        db.commit()
        logger.info(
            "propagate_recurring_category: updated %d blocks for person %d",
            updated, person_id,
        )
        return {"updated": updated}

    except Exception as exc:
        db.rollback()
        logger.exception("propagate_recurring_category failed: %s", exc)
        raise self.retry(exc=exc, countdown=30)
    finally:
        db.close()


@celery_app.task(name="app.tasks.mark_missed_blocks", bind=True, max_retries=3)
def mark_missed_blocks(self):
    """
    Runs at midnight (00:05 UTC) every day.
    Marks all time blocks from previous days that are still incomplete as is_missed=True.
    """
    db = SessionLocal()
    try:
        today = date.today()
        updated = (
            db.query(models.TimeBlock)
            .filter(
                models.TimeBlock.date < today,
                models.TimeBlock.is_completed == False,
                models.TimeBlock.is_missed == False,
                models.TimeBlock.deleted == False,
            )
            .all()
        )
        count = len(updated)
        for block in updated:
            block.is_missed = True
        db.commit()
        logger.info("mark_missed_blocks: marked %d blocks as missed", count)
        return {"marked": count}
    except Exception as exc:
        db.rollback()
        logger.exception("mark_missed_blocks failed: %s", exc)
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()


@celery_app.task(name="app.tasks.check_block_completions", bind=True, max_retries=2)
def check_block_completions(self):
    """
    Runs every 5 minutes. Asks about any incomplete blocks that ended within the
    last NOTIFY_WINDOW_MIN minutes and haven't been notified yet. Blocks that
    ended longer ago are auto-marked as missed so we never spam past prompts.

    Compares full datetimes rather than HH:MM strings — a string-only window
    wraps around midnight Tashkent (e.g. `"23:30"` for "60 min before 00:30")
    and would falsely mark every today block ending before 23:30 as missed.

    Dedupes by (person_id, title, start_time, end_time) within today so that
    duplicate rows for the same logical block produce at most one notification.

    Tashkent = UTC+5, blocks store times as "HH:MM" strings.
    """
    if not is_configured():
        return {"skipped": True}

    NOTIFY_WINDOW_MIN = 60

    db = SessionLocal()
    sent = 0
    try:
        TASHKENT = timedelta(hours=5)
        now_tashkent = datetime.utcnow() + TASHKENT
        today_tashkent = now_tashkent.date()
        window_start_dt = now_tashkent - timedelta(minutes=NOTIFY_WINDOW_MIN)
        # Block end_time is stored at minute precision ("HH:MM"), so a block
        # ending at 13:30 actually ends at 13:30:00. A cron tick that lands a
        # few hundred ms before the minute boundary would otherwise classify
        # that block as "future" and skip it. Treat anything within the next
        # 30 seconds as already-ended.
        boundary_now = now_tashkent + timedelta(seconds=30)

        # Self-heal: an earlier version of this task did HH:MM string comparison
        # which, during the 00:00–00:59 Tashkent window, falsely set is_missed
        # on every today block ending before 23:00 (string "14:00" < "23:30").
        # On each tick, undo that damage for any today block whose end-datetime
        # is still in the future. Legitimate misses (end_dt <= now) stay set.
        possibly_damaged = (
            db.query(models.TimeBlock)
            .filter(
                models.TimeBlock.date == today_tashkent,
                models.TimeBlock.deleted == False,
                models.TimeBlock.is_completed == False,
                models.TimeBlock.is_missed == True,
            )
            .all()
        )
        reset_future = 0
        for b in possibly_damaged:
            end_dt = _block_end_datetime(b)
            if end_dt is None:
                continue
            if end_dt > now_tashkent:
                b.is_missed = False
                b.notified_at = None
                reset_future += 1

        pending_today = (
            db.query(models.TimeBlock)
            .filter(
                models.TimeBlock.date == today_tashkent,
                models.TimeBlock.deleted == False,
                models.TimeBlock.is_completed == False,
                models.TimeBlock.notified_at.is_(None),
            )
            .all()
        )

        stale: list[models.TimeBlock] = []
        candidates: list[models.TimeBlock] = []
        for b in pending_today:
            end_dt = _block_end_datetime(b)
            if end_dt is None:
                continue
            if end_dt < window_start_dt:
                stale.append(b)
            elif end_dt <= boundary_now:
                candidates.append(b)

        for b in stale:
            b.notified_at = datetime.utcnow()
            b.is_missed = True

        seen: set[tuple[int, str, str, str]] = set()
        blocks: list[models.TimeBlock] = []
        for b in candidates:
            key = (b.person_id, b.title, b.start_time, b.end_time)
            if key in seen:
                b.notified_at = datetime.utcnow()
                continue
            seen.add(key)
            blocks.append(b)

        for block in blocks:
            person = db.query(models.Person).filter(models.Person.id == block.person_id).first()
            if not person:
                continue
            chat_id = person.telegram_chat_id
            if not chat_id:
                from app.config import settings
                chat_id = settings.TELEGRAM_CHAT_ID
            if not chat_id:
                continue

            from app.services.block_completion import (
                block_checkin_keyboard, block_checkin_text,
            )
            if send_message(
                block_checkin_text(block),
                chat_id=chat_id,
                reply_markup=block_checkin_keyboard(block.id),
            ):
                block.notified_at = datetime.utcnow()
                sent += 1

        db.commit()
        logger.info(
            "check_block_completions: sent=%d stale_cleared=%d reset_future=%d",
            sent, len(stale), reset_future,
        )
        return {"sent": sent, "stale_cleared": len(stale), "reset_future": reset_future}

    except Exception as exc:
        db.rollback()
        logger.exception("check_block_completions failed: %s", exc)
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()


@celery_app.task(name="app.tasks.send_block_checkin", bind=True, max_retries=2)
def send_block_checkin(self, block_id: int):
    """
    One-off re-prompt for a single block. Enqueued by the "⏰ +30m" Telegram
    button with countdown=1800, so the user gets re-asked 30 min after they
    deferred. Bypasses the */5 sweeper's `notified_at IS NULL` filter — the
    deferred block deliberately keeps its non-null notified_at so the beat
    sweeper leaves it alone; this task is what re-prompts.

    Idempotent. If the block was completed, deleted, or already responded to
    via another channel between scheduling and firing, the task silently noops.
    """
    if not is_configured():
        return {"skipped": True}

    db = SessionLocal()
    try:
        block = (
            db.query(models.TimeBlock)
            .filter(
                models.TimeBlock.id == block_id,
                models.TimeBlock.deleted == False,
            )
            .first()
        )
        if not block:
            return {"skipped": "missing"}
        if block.is_completed:
            return {"skipped": "completed"}

        person = (
            db.query(models.Person)
            .filter(models.Person.id == block.person_id)
            .first()
        )
        if not person:
            return {"skipped": "no_person"}

        chat_id = person.telegram_chat_id
        if not chat_id:
            from app.config import settings
            chat_id = settings.TELEGRAM_CHAT_ID
        if not chat_id:
            return {"skipped": "no_chat"}

        from app.services.block_completion import (
            block_checkin_keyboard, block_checkin_text,
        )
        ok = send_message(
            block_checkin_text(block),
            chat_id=chat_id,
            reply_markup=block_checkin_keyboard(block.id),
        )
        if ok:
            block.notified_at = datetime.utcnow()
            db.commit()
        return {"sent": 1 if ok else 0}

    except Exception as exc:
        db.rollback()
        logger.exception("send_block_checkin failed for block %s: %s", block_id, exc)
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()


@celery_app.task(name="app.tasks.carryover_missed_tasks", bind=True, max_retries=2)
def carryover_missed_tasks(self):
    """
    17:05 UTC (22:05 Tashkent) daily — for each missed recurring block today,
    schedule it for tomorrow in a free slot before 22:00.
    If no free slot exists, send a Telegram message asking the user to pick a time.
    """
    db = SessionLocal()
    created = 0
    asked = 0
    try:
        TASHKENT = timedelta(hours=5)
        now_tashkent = datetime.utcnow() + TASHKENT
        today = now_tashkent.date()
        tomorrow = today + timedelta(days=1)

        persons = db.query(models.Person).filter(models.Person.is_active == True).all()
        for person in persons:
            chat_id = getattr(person, "telegram_chat_id", None)
            if not chat_id:
                from app.config import settings
                chat_id = settings.TELEGRAM_CHAT_ID

            now_str = now_tashkent.strftime("%H:%M")
            todays_blocks = db.query(models.TimeBlock).filter(
                models.TimeBlock.person_id == person.id,
                models.TimeBlock.date == today,
                models.TimeBlock.deleted == False,
                models.TimeBlock.is_completed == False,
            ).all()

            missed_blocks = [
                b for b in todays_blocks
                if b.end_time and b.end_time <= now_str
                and (b.is_recurring or (b.task_id and _is_recurring_task(db, b.task_id)))
            ]

            tomorrow_blocks = db.query(models.TimeBlock).filter(
                models.TimeBlock.person_id == person.id,
                models.TimeBlock.date == tomorrow,
                models.TimeBlock.deleted == False,
            ).all()
            occupied_tomorrow = [
                (b.start_time, b.end_time)
                for b in tomorrow_blocks
                if b.start_time and b.end_time
            ]

            for block in missed_blocks:
                # Skip if already has a carry-over for tomorrow for this task
                if block.task_id:
                    existing = db.query(models.TimeBlock).filter(
                        models.TimeBlock.person_id == person.id,
                        models.TimeBlock.task_id == block.task_id,
                        models.TimeBlock.date == tomorrow,
                        models.TimeBlock.deleted == False,
                    ).first()
                    if existing:
                        continue
                else:
                    # No task_id — deduplicate by title so recurring blocks without a
                    # linked task don't stack a new carry-over every night they're missed.
                    bare_title = block.title.lstrip("↩ ")
                    existing = db.query(models.TimeBlock).filter(
                        models.TimeBlock.person_id == person.id,
                        models.TimeBlock.date == tomorrow,
                        models.TimeBlock.deleted == False,
                        models.TimeBlock.title.in_([bare_title, f"↩ {bare_title}"]),
                    ).first()
                    if existing:
                        continue

                dur = block.end_time and block.start_time and (
                    _to_minutes(block.end_time) - _to_minutes(block.start_time)
                ) or 30

                free_slot = _find_free_slot(occupied_tomorrow, dur, limit_h=22)
                if not free_slot:
                    free_slot = _find_free_slot(occupied_tomorrow, dur, start_from_h=22, limit_h=24)

                if free_slot:
                    slot_h, slot_m = free_slot
                    start = f"{slot_h:02d}:{slot_m:02d}"
                    end_total = slot_h * 60 + slot_m + dur
                    end = f"{end_total // 60:02d}:{end_total % 60:02d}"

                    new_block = models.TimeBlock(
                        person_id=person.id,
                        title=f"↩ {block.title.lstrip('↩ ')}",
                        date=tomorrow,
                        start_time=start,
                        end_time=end,
                        category=block.category or "work",
                        task_id=block.task_id,
                        is_recurring=False,
                    )
                    db.add(new_block)
                    occupied_tomorrow.append((start, end))
                    created += 1
                else:
                    if chat_id and is_configured():
                        title = block.title.lstrip("↩ ")
                        date_str = tomorrow.strftime("%Y%m%d")
                        candidates = [
                            f"{h:02d}:{m:02d}"
                            for h in range(8, 24)
                            for m in (0, 30)
                            if h * 60 + m + dur <= 24 * 60
                        ]
                        free_options = [
                            t for t in candidates
                            if _find_free_slot(occupied_tomorrow, dur,
                                               start_from_h=int(t[:2]),
                                               limit_h=int(t[:2]) + 1) == (int(t[:2]), int(t[3:]))
                        ][:8]
                        if not free_options:
                            free_options = candidates[-8:]
                        buttons = [
                            {"text": t, "callback_data": f"carryover_{block.id}_{date_str}_{t.replace(':', '')}"}
                            for t in free_options
                        ]
                        mid = len(buttons) // 2
                        keyboard = [buttons[:mid], buttons[mid:]]
                        send_message(
                            f"📅 Tomorrow is fully booked for <b>{title}</b>.\nChoose a free time:",
                            chat_id=chat_id,
                            reply_markup={"inline_keyboard": keyboard},
                        )
                        asked += 1

        db.commit()
        logger.info("carryover_missed_tasks: created=%d asked=%d", created, asked)
        return {"created": created, "asked": asked}
    except Exception as exc:
        db.rollback()
        logger.exception("carryover_missed_tasks failed: %s", exc)
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()
