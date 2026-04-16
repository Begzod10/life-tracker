"""
Celery tasks for the Life Tracker backend.
"""
from datetime import date, datetime, timedelta
from sqlalchemy import or_
import logging

from app.celery_app import celery_app
from app.database import SessionLocal
from app import models
from app.bot.telegram import send_message, is_configured

logger = logging.getLogger(__name__)

# ─── Priority emoji map ───────────────────────────────────────────────────────
PRIORITY_EMOJI = {"high": "🔴", "medium": "🟡", "low": "🟢"}


@celery_app.task(name="app.tasks.copy_recurring_blocks", bind=True, max_retries=3)
def copy_recurring_blocks(self):
    """
    Copy all recurring time blocks to the same weekday in the next week.
    Runs every Sunday at 23:00 UTC so blocks are ready before Monday starts.

    Skips a block if an identical one (same person, date, start_time, title)
    already exists to prevent duplicates on retries.
    """
    db = SessionLocal()
    try:
        today = date.today()

        # Look back 7 days so we capture recurring blocks from the current week
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
            next_date = block.date + timedelta(weeks=1)

            # Idempotency check — skip if an identical block already exists
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
        logger.info(
            "copy_recurring_blocks: created=%d skipped=%d", created, skipped
        )
        return {"created": created, "skipped": skipped}

    except Exception as exc:
        db.rollback()
        logger.exception("copy_recurring_blocks failed: %s", exc)
        raise self.retry(exc=exc, countdown=60 * 10)  # retry after 10 min
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


# ─── Telegram notification helpers ───────────────────────────────────────────

def _get_upcoming_tasks(db, person_id: int, today: date, days_ahead: int = 3):
    """Return non-completed tasks due in the next `days_ahead` days (excluding today)."""
    tomorrow = today + timedelta(days=1)
    future = today + timedelta(days=days_ahead)
    not_deleted = or_(models.Task.deleted == False, models.Task.deleted.is_(None))
    return (
        db.query(models.Task)
        .join(models.Goal, models.Task.goal_id == models.Goal.id)
        .filter(
            models.Goal.person_id == person_id,
            models.Goal.deleted == False,
            not_deleted,
            models.Task.completed == False,
            models.Task.due_date >= tomorrow,
            models.Task.due_date <= future,
        )
        .order_by(models.Task.due_date.asc())
        .limit(5)
        .all()
    )


def _get_todays_tasks(db, person_id: int, today: date):
    """
    Return all non-deleted, non-completed tasks for a person that are relevant today:
    - due_date == today
    - OR is_recurring == True (daily tasks that reset every day)
    - OR task_type == 'daily' with no due_date (always show daily tasks)
    """
    from sqlalchemy import or_
    not_deleted = or_(models.Task.deleted == False, models.Task.deleted.is_(None))
    return (
        db.query(models.Task)
        .join(models.Goal, models.Task.goal_id == models.Goal.id)
        .filter(
            models.Goal.person_id == person_id,
            models.Goal.deleted == False,
            not_deleted,
            models.Task.completed == False,
            or_(
                models.Task.due_date == today,
                models.Task.is_recurring == True,
                models.Task.task_type == "daily",
            ),
        )
        .order_by(
            models.Task.priority.asc(),  # high → medium → low alphabetically? use custom sort below
        )
        .all()
    )


def _format_task_line(task) -> str:
    emoji = PRIORITY_EMOJI.get(task.priority, "⚪")
    recurring = " 🔄" if task.is_recurring else ""
    duration = f" ({task.estimated_duration}min)" if task.estimated_duration else ""
    return f"{emoji} {task.name}{recurring}{duration}"


@celery_app.task(name="app.tasks.send_morning_tasks", bind=True, max_retries=2)
def send_morning_tasks(self):
    """
    Morning notification: send today's pending tasks to each user.
    Scheduled at 03:00 UTC = 08:00 Tashkent (UTC+5).
    """
    if not is_configured():
        logger.info("send_morning_tasks: Telegram not configured, skipping")
        return {"skipped": True}

    db = SessionLocal()
    sent = 0
    try:
        today = date.today()
        persons = db.query(models.Person).filter(models.Person.is_active == True).all()

        for person in persons:
            chat_id = person.telegram_chat_id
            if not chat_id:
                from app.config import settings
                chat_id = settings.TELEGRAM_CHAT_ID
            if not chat_id:
                continue

            tasks = _get_todays_tasks(db, person.id, today)
            upcoming = _get_upcoming_tasks(db, person.id, today)
            priority_order = {"high": 0, "medium": 1, "low": 2}
            first_name = person.name.split()[0]

            msg = f"🌅 <b>Good morning, {first_name}!</b>\n\n"

            if not tasks:
                msg += "No tasks scheduled for today. Enjoy your day! 🎉"
            else:
                tasks_sorted = sorted(tasks, key=lambda t: priority_order.get(t.priority, 3))
                task_list = "\n".join(_format_task_line(t) for t in tasks_sorted)
                msg += f"📋 <b>Today's tasks ({len(tasks)}):</b>\n{task_list}"

            if upcoming:
                msg += "\n\n📅 <b>Upcoming (next 3 days):</b>\n"
                for t in upcoming:
                    due_label = t.due_date.strftime("%b %d") if t.due_date else ""
                    emoji = PRIORITY_EMOJI.get(t.priority, "⚪")
                    msg += f"  {emoji} {t.name} <i>({due_label})</i>\n"

            msg += "\n\nLet's have a productive day! 💪"

            if send_message(msg, chat_id=chat_id):
                sent += 1

        logger.info("send_morning_tasks: sent to %d users", sent)
        return {"sent": sent}

    except Exception as exc:
        db.rollback()
        logger.exception("send_morning_tasks failed: %s", exc)
        raise self.retry(exc=exc, countdown=60 * 5)
    finally:
        db.close()


@celery_app.task(name="app.tasks.check_block_completions", bind=True, max_retries=2)
def check_block_completions(self):
    """
    Runs every 5 minutes. Asks users about timetable blocks that just ended.
    Tashkent = UTC+5, blocks store times as "HH:MM" strings.
    """
    if not is_configured():
        return {"skipped": True}

    db = SessionLocal()
    sent = 0
    try:
        TASHKENT = timedelta(hours=5)
        now_tashkent = datetime.utcnow() + TASHKENT
        today_tashkent = now_tashkent.date()

        # Check blocks whose end_time falls in the last 5 minutes
        now_str = now_tashkent.strftime("%H:%M")
        window_start_str = (now_tashkent - timedelta(minutes=5)).strftime("%H:%M")

        blocks = (
            db.query(models.TimeBlock)
            .filter(
                models.TimeBlock.date == today_tashkent,
                models.TimeBlock.deleted == False,
                models.TimeBlock.is_completed == False,
                models.TimeBlock.end_time > window_start_str,
                models.TimeBlock.end_time <= now_str,
            )
            .all()
        )

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

            send_message(
                f"⏰ Time's up! Did you complete: <b>{block.title}</b> ({block.start_time}–{block.end_time})?",
                chat_id=chat_id,
                reply_markup={
                    "inline_keyboard": [[
                        {"text": "✅ Yes!", "callback_data": f"block_done_{block.id}"},
                        {"text": "❌ No", "callback_data": f"block_skip_{block.id}"},
                    ]]
                },
            )
            sent += 1

        logger.info("check_block_completions: sent %d notifications", sent)
        return {"sent": sent}

    except Exception as exc:
        db.rollback()
        logger.exception("check_block_completions failed: %s", exc)
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()


@celery_app.task(name="app.tasks.send_evening_checkup", bind=True, max_retries=2)
def send_evening_checkup(self):
    """
    Evening check-in: show completion summary for each user.
    Scheduled at 16:00 UTC = 21:00 Tashkent (UTC+5).
    """
    if not is_configured():
        logger.info("send_evening_checkup: Telegram not configured, skipping")
        return {"skipped": True}

    db = SessionLocal()
    sent = 0
    try:
        today = date.today()
        from sqlalchemy import or_
        not_deleted = or_(models.Task.deleted == False, models.Task.deleted.is_(None))

        persons = db.query(models.Person).filter(models.Person.is_active == True).all()

        for person in persons:
            chat_id = person.telegram_chat_id
            if not chat_id:
                from app.config import settings
                chat_id = settings.TELEGRAM_CHAT_ID
            if not chat_id:
                continue

            # All tasks relevant today
            all_today = (
                db.query(models.Task)
                .join(models.Goal, models.Task.goal_id == models.Goal.id)
                .filter(
                    models.Goal.person_id == person.id,
                    models.Goal.deleted == False,
                    not_deleted,
                    or_(
                        models.Task.due_date == today,
                        models.Task.is_recurring == True,
                        models.Task.task_type == "daily",
                    ),
                )
                .all()
            )

            if not all_today:
                msg = (
                    f"🌙 <b>Good evening, {person.name.split()[0]}!</b>\n\n"
                    "You had no tasks today. Rest well! 🌟"
                )
            else:
                done = [t for t in all_today if t.completed]
                pending = [t for t in all_today if not t.completed]

                # For recurring tasks — check today's ProgressLogTask
                recurring_done_today = set(
                    row.task_id
                    for row in db.query(models.ProgressLogTask).filter(
                        models.ProgressLogTask.log_date == today,
                        models.ProgressLogTask.task_id.in_([t.id for t in all_today]),
                    ).all()
                )

                # A recurring task counts as "done today" if it has a log entry
                def task_done(t) -> bool:
                    if t.is_recurring:
                        return t.id in recurring_done_today
                    return t.completed

                done_list = [t for t in all_today if task_done(t)]
                pending_list = [t for t in all_today if not task_done(t)]

                total = len(all_today)
                n_done = len(done_list)
                completion_pct = round(n_done / total * 100) if total else 0

                # Progress bar
                filled = round(completion_pct / 10)
                bar = "█" * filled + "░" * (10 - filled)

                lines = [
                    f"🌙 <b>Good evening, {person.name.split()[0]}!</b>",
                    "",
                    f"📊 Progress: {n_done}/{total} ({completion_pct}%)",
                    f"[{bar}]",
                    "",
                ]

                if done_list:
                    lines.append("✅ <b>Completed:</b>")
                    lines += [f"  • {t.name}" for t in done_list]
                    lines.append("")

                if pending_list:
                    lines.append("❌ <b>Still pending:</b>")
                    lines += [f"  • {_format_task_line(t)}" for t in pending_list]
                    lines.append("")

                if completion_pct == 100:
                    lines.append("🏆 Perfect day! All tasks done!")
                elif completion_pct >= 70:
                    lines.append("🌟 Great work today! Keep it up!")
                elif completion_pct >= 40:
                    lines.append("💪 Good effort! Finish the rest tomorrow.")
                else:
                    lines.append("🎯 Tomorrow is a new chance. You've got this!")

                msg = "\n".join(lines)

            if not send_message(msg, chat_id=chat_id):
                continue
            sent += 1

            # Ask about each pending task with Yes/No inline buttons
            if all_today:
                for task in pending_list:
                    send_message(
                        f"❓ Did you finish: <b>{task.name}</b>?",
                        chat_id=chat_id,
                        reply_markup={
                            "inline_keyboard": [[
                                {"text": "✅ Yes, done!", "callback_data": f"done_{task.id}"},
                                {"text": "❌ Not yet", "callback_data": f"skip_{task.id}"},
                            ]]
                        },
                    )

        logger.info("send_evening_checkup: sent to %d users", sent)
        return {"sent": sent}

    except Exception as exc:
        db.rollback()
        logger.exception("send_evening_checkup failed: %s", exc)
        raise self.retry(exc=exc, countdown=60 * 5)
    finally:
        db.close()
