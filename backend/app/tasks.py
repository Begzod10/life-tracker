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
    - OR (is_recurring OR task_type == 'daily') AND has a timetable block scheduled for today
    Recurring tasks without a block today are excluded — they may not be on today's schedule.
    """
    from sqlalchemy import or_
    not_deleted = or_(models.Task.deleted == False, models.Task.deleted.is_(None))

    # Task IDs that have a non-deleted block scheduled for today
    block_task_ids = set(
        row[0]
        for row in db.query(models.TimeBlock.task_id)
        .filter(
            models.TimeBlock.person_id == person_id,
            models.TimeBlock.date == today,
            models.TimeBlock.deleted == False,
            models.TimeBlock.task_id.isnot(None),
        )
        .all()
    )

    all_tasks = (
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
        .order_by(models.Task.priority.asc())
        .all()
    )

    result = []
    for task in all_tasks:
        if task.due_date == today:
            result.append(task)
        elif task.id in block_task_ids:
            result.append(task)
    return result


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
    Runs every 5 minutes. Asks about any incomplete blocks that have already ended today
    and haven't been notified yet. Uses notified_at to prevent duplicate messages.
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
        now_str = now_tashkent.strftime("%H:%M")

        # All incomplete blocks for today that have already ended and not yet notified
        blocks = (
            db.query(models.TimeBlock)
            .filter(
                models.TimeBlock.date == today_tashkent,
                models.TimeBlock.deleted == False,
                models.TimeBlock.is_completed == False,
                models.TimeBlock.notified_at.is_(None),
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

            if send_message(
                f"⏰ Time's up! Did you complete: <b>{block.title}</b> ({block.start_time}–{block.end_time})?",
                chat_id=chat_id,
                reply_markup={
                    "inline_keyboard": [[
                        {"text": "✅ Yes!", "callback_data": f"block_done_{block.id}"},
                        {"text": "❌ No", "callback_data": f"block_skip_{block.id}"},
                    ]]
                },
            ):
                block.notified_at = datetime.utcnow()
                sent += 1

        db.commit()
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

                # Check if any linked timetable block was completed today
                block_done_today = set(
                    b.task_id
                    for b in db.query(models.TimeBlock).filter(
                        models.TimeBlock.date == today,
                        models.TimeBlock.deleted == False,
                        models.TimeBlock.is_completed == True,
                        models.TimeBlock.task_id.in_([t.id for t in all_today]),
                    ).all()
                    if b.task_id is not None
                )

                # A task counts as "done today" if:
                # - non-recurring: task.completed OR its timetable block was checked off
                # - recurring: has a ProgressLogTask entry OR its timetable block was checked off
                def task_done(t) -> bool:
                    if t.id in block_done_today:
                        return True
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


@celery_app.task(name="app.tasks.send_daily_summary", bind=True, max_retries=2)
def send_daily_summary(self):
    """
    Daily 22:00 Tashkent (17:00 UTC) — send full summary of today's blocks and tasks.
    """
    if not is_configured():
        return {"skipped": True}

    db = SessionLocal()
    sent = 0
    try:
        TASHKENT = timedelta(hours=5)
        today = (datetime.utcnow() + TASHKENT).date()
        not_deleted = or_(models.Task.deleted == False, models.Task.deleted.is_(None))

        persons = db.query(models.Person).filter(models.Person.is_active == True).all()

        for person in persons:
            chat_id = person.telegram_chat_id
            if not chat_id:
                from app.config import settings
                chat_id = settings.TELEGRAM_CHAT_ID
            if not chat_id:
                continue

            lines = [f"📋 <b>Daily Summary — {today.strftime('%d %b %Y')}</b>", ""]

            # ── Timetable blocks ──────────────────────────────────────────────
            blocks = (
                db.query(models.TimeBlock)
                .filter(
                    models.TimeBlock.person_id == person.id,
                    models.TimeBlock.date == today,
                    models.TimeBlock.deleted == False,
                )
                .order_by(models.TimeBlock.start_time.asc())
                .all()
            )

            if blocks:
                total_blocks = len(blocks)
                done_blocks = [b for b in blocks if b.is_completed]
                missed_blocks = [b for b in blocks if b.is_missed]
                pending_blocks = [b for b in blocks if not b.is_completed and not b.is_missed]

                lines.append(f"🗓 <b>Timetable Blocks</b> ({len(done_blocks)}/{total_blocks} done)")
                for b in blocks:
                    if b.is_completed:
                        icon = "✅"
                    elif b.is_missed:
                        icon = "❌"
                    else:
                        icon = "⏳"
                    lines.append(f"  {icon} {b.start_time}–{b.end_time}  {b.title}")
                lines.append("")

            # ── Tasks ─────────────────────────────────────────────────────────
            all_tasks = (
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

            if all_tasks:
                recurring_done_today = set(
                    row.task_id
                    for row in db.query(models.ProgressLogTask).filter(
                        models.ProgressLogTask.log_date == today,
                        models.ProgressLogTask.task_id.in_([t.id for t in all_tasks]),
                    ).all()
                )

                def task_done(t) -> bool:
                    return t.id in recurring_done_today if t.is_recurring else t.completed

                done_tasks = [t for t in all_tasks if task_done(t)]
                lines.append(f"✅ <b>Tasks</b> ({len(done_tasks)}/{len(all_tasks)} done)")
                for t in all_tasks:
                    icon = "✅" if task_done(t) else "❌"
                    lines.append(f"  {icon} {t.name}")
                lines.append("")

            if not blocks and not all_tasks:
                lines.append("Nothing scheduled for today.")
            else:
                # Overall completion rate
                total = len(blocks) + len(all_tasks) if all_tasks else len(blocks)
                completed = (
                    len([b for b in blocks if b.is_completed]) +
                    (len([t for t in all_tasks if task_done(t)]) if all_tasks else 0)
                )
                pct = round(completed / total * 100) if total else 0
                filled = round(pct / 10)
                bar = "█" * filled + "░" * (10 - filled)
                lines.append(f"📊 Overall: {completed}/{total} ({pct}%)")
                lines.append(f"[{bar}]")

            if send_message("\n".join(lines), chat_id=chat_id):
                sent += 1

        logger.info("send_daily_summary: sent to %d users", sent)
        return {"sent": sent}

    except Exception as exc:
        db.rollback()
        logger.exception("send_daily_summary failed: %s", exc)
        raise self.retry(exc=exc, countdown=60 * 5)
    finally:
        db.close()


def _call_groq(prompt: str) -> str:
    """Call Groq API and return the generated text."""
    import httpx
    from app.config import settings

    if not settings.GROQ_API_KEY:
        return ""

    resp = httpx.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
        json={
            "model": "llama-3.1-8b-instant",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 300,
            "temperature": 0.7,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


@celery_app.task(name="app.tasks.generate_daily_conclusion", bind=True, max_retries=2)
def generate_daily_conclusion(self):
    """
    22:30 Tashkent (17:30 UTC) — generate AI conclusion for each user's day.
    Summarises completed/missed blocks and tasks, saves to daily_conclusions.
    """
    from app.config import settings

    if not settings.GROQ_API_KEY:
        logger.info("generate_daily_conclusion: GROQ_API_KEY not set, skipping")
        return {"skipped": True}

    db = SessionLocal()
    generated = 0
    try:
        TASHKENT = timedelta(hours=5)
        today = (datetime.utcnow() + TASHKENT).date()
        not_deleted_task = or_(models.Task.deleted == False, models.Task.deleted.is_(None))

        persons = db.query(models.Person).filter(models.Person.is_active == True).all()

        for person in persons:
            # Skip if already generated today
            existing = db.query(models.DailyConclusion).filter(
                models.DailyConclusion.person_id == person.id,
                models.DailyConclusion.date == today,
            ).first()
            if existing:
                continue

            # Collect today's blocks
            blocks = (
                db.query(models.TimeBlock)
                .filter(
                    models.TimeBlock.person_id == person.id,
                    models.TimeBlock.date == today,
                    models.TimeBlock.deleted == False,
                )
                .order_by(models.TimeBlock.start_time.asc())
                .all()
            )

            # Collect today's tasks
            all_tasks = (
                db.query(models.Task)
                .join(models.Goal, models.Task.goal_id == models.Goal.id)
                .filter(
                    models.Goal.person_id == person.id,
                    models.Goal.deleted == False,
                    not_deleted_task,
                    or_(
                        models.Task.due_date == today,
                        models.Task.is_recurring == True,
                        models.Task.task_type == "daily",
                    ),
                )
                .all()
            )

            if not blocks and not all_tasks:
                continue

            # Build prompt
            lines = [f"Date: {today.strftime('%A, %B %d %Y')}", ""]

            if blocks:
                done_b = sum(1 for b in blocks if b.is_completed)
                lines.append(f"Timetable blocks ({done_b}/{len(blocks)} completed):")
                for b in blocks:
                    status = "✅ done" if b.is_completed else "❌ not finished"
                    lines.append(f"  - {b.title} ({b.start_time}–{b.end_time}): {status}")
                lines.append("")

            if all_tasks:
                recurring_done = set(
                    row.task_id for row in db.query(models.ProgressLogTask).filter(
                        models.ProgressLogTask.log_date == today,
                        models.ProgressLogTask.task_id.in_([t.id for t in all_tasks]),
                    ).all()
                )
                def task_done(t) -> bool:
                    return t.id in recurring_done if t.is_recurring else t.completed

                done_t = sum(1 for t in all_tasks if task_done(t))
                lines.append(f"Tasks ({done_t}/{len(all_tasks)} completed):")
                for t in all_tasks:
                    status = "✅ done" if task_done(t) else "❌ not done"
                    lines.append(f"  - {t.name}: {status}")
                lines.append("")

            day_data = "\n".join(lines)
            prompt = (
                f"You are a personal productivity coach. Here is the user's day:\n\n"
                f"{day_data}\n"
                f"Write a brief 2-3 sentence conclusion about this day. "
                f"Be honest about what was missed but stay motivating. "
                f"Mention one specific thing they did well and one improvement for tomorrow. "
                f"Be concise and personal."
            )

            try:
                conclusion_text = _call_groq(prompt)
                if not conclusion_text:
                    continue

                conclusion = models.DailyConclusion(
                    person_id=person.id,
                    date=today,
                    conclusion=conclusion_text,
                )
                db.add(conclusion)
                db.commit()
                generated += 1

                # Send to Telegram if configured
                chat_id = person.telegram_chat_id
                if not chat_id:
                    chat_id = settings.TELEGRAM_CHAT_ID
                if chat_id:
                    send_message(
                        f"🤖 <b>AI Daily Conclusion</b>\n\n{conclusion_text}",
                        chat_id=chat_id,
                    )
            except Exception as e:
                logger.exception("generate_daily_conclusion: failed for person %d: %s", person.id, e)
                db.rollback()
                continue

        logger.info("generate_daily_conclusion: generated %d conclusions", generated)
        return {"generated": generated}

    except Exception as exc:
        db.rollback()
        logger.exception("generate_daily_conclusion failed: %s", exc)
        raise self.retry(exc=exc, countdown=60 * 5)
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# 2. Weekly Review (Sunday 20:00 Tashkent = 15:00 UTC)
# ─────────────────────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.send_weekly_review", bind=True, max_retries=2)
def send_weekly_review(self):
    """Sunday 20:00 Tashkent — weekly summary: goal progress, task ratio, top category, AI tip."""
    if not is_configured():
        return {"skipped": True}

    db = SessionLocal()
    sent = 0
    try:
        TASHKENT = timedelta(hours=5)
        today = (datetime.utcnow() + TASHKENT).date()
        week_start = today - timedelta(days=today.weekday())  # Monday
        not_deleted_task = or_(models.Task.deleted == False, models.Task.deleted.is_(None))

        persons = db.query(models.Person).filter(models.Person.is_active == True).all()

        for person in persons:
            chat_id = person.telegram_chat_id
            if not chat_id:
                from app.config import settings as cfg
                chat_id = cfg.TELEGRAM_CHAT_ID
            if not chat_id:
                continue

            # Goals summary
            goals = db.query(models.Goal).filter(
                models.Goal.person_id == person.id,
                models.Goal.deleted == False,
                models.Goal.status == "active",
            ).all()

            # This week's blocks
            blocks = db.query(models.TimeBlock).filter(
                models.TimeBlock.person_id == person.id,
                models.TimeBlock.date >= week_start,
                models.TimeBlock.date <= today,
                models.TimeBlock.deleted == False,
            ).all()

            total_b = len(blocks)
            done_b  = sum(1 for b in blocks if b.is_completed)
            missed_b = sum(1 for b in blocks if b.date < today and not b.is_completed)

            # Category hours
            from collections import defaultdict as _dd
            cat_hours = _dd(float)
            for b in blocks:
                h, m = b.start_time.split(":"); eh, em = b.end_time.split(":")
                cat_hours[b.category or "other"] += max(0, (int(eh)*60+int(em) - int(h)*60-int(m))) / 60
            top_cat = max(cat_hours, key=cat_hours.get) if cat_hours else "—"

            # This week's tasks
            all_tasks = (
                db.query(models.Task)
                .join(models.Goal, models.Task.goal_id == models.Goal.id)
                .filter(
                    models.Goal.person_id == person.id,
                    models.Goal.deleted == False,
                    not_deleted_task,
                    or_(
                        models.Task.due_date >= week_start,
                        models.Task.is_recurring == True,
                        models.Task.task_type == "daily",
                    ),
                ).all()
            )
            recurring_done = set(
                r.task_id for r in db.query(models.ProgressLogTask).filter(
                    models.ProgressLogTask.log_date >= week_start,
                    models.ProgressLogTask.task_id.in_([t.id for t in all_tasks]),
                ).all()
            )
            def tdone(t):
                return t.id in recurring_done if t.is_recurring else t.completed
            done_t = sum(1 for t in all_tasks if tdone(t))

            lines = [
                f"📊 <b>Weekly Review — {week_start.strftime('%b %d')} to {today.strftime('%b %d')}</b>",
                "",
                f"🗓 <b>Timetable:</b> {done_b}/{total_b} blocks done"
                + (f", {missed_b} missed" if missed_b else ""),
                f"✅ <b>Tasks:</b> {done_t}/{len(all_tasks)} completed",
                f"💼 <b>Top category:</b> {top_cat.capitalize()} ({cat_hours.get(top_cat, 0):.1f}h)",
                "",
            ]

            if goals:
                lines.append("🎯 <b>Goals progress:</b>")
                for g in goals[:5]:
                    bar_filled = round(g.percentage / 10)
                    bar = "█" * bar_filled + "░" * (10 - bar_filled)
                    lines.append(f"  • {g.name}: {g.percentage:.0f}% [{bar}]")
                lines.append("")

            # AI tip via Groq
            from app.config import settings as cfg2
            if cfg2.GROQ_API_KEY and (total_b > 0 or all_tasks):
                prompt = (
                    f"User's week: {done_b}/{total_b} timetable blocks done, "
                    f"{done_t}/{len(all_tasks)} tasks completed, "
                    f"top category: {top_cat}. "
                    f"Give ONE specific, actionable improvement tip for next week in 1-2 sentences. Be direct."
                )
                try:
                    tip = _call_groq(prompt)
                    if tip:
                        lines += ["💡 <b>AI tip for next week:</b>", tip, ""]
                except Exception:
                    pass

            completion_pct = round(done_b / total_b * 100) if total_b else 0
            if completion_pct == 100:
                lines.append("🏆 Perfect week! Outstanding!")
            elif completion_pct >= 70:
                lines.append("🌟 Great week! Keep the momentum.")
            else:
                lines.append("💪 New week, new chance. You've got this!")

            if send_message("\n".join(lines), chat_id=chat_id):
                sent += 1

        logger.info("send_weekly_review: sent to %d users", sent)
        return {"sent": sent}
    except Exception as exc:
        db.rollback()
        logger.exception("send_weekly_review failed: %s", exc)
        raise self.retry(exc=exc, countdown=60 * 5)
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# 3. Carry-over missed recurring tasks → next-day block (runs at 00:10 UTC)
# ─────────────────────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.carryover_missed_tasks", bind=True, max_retries=2)
def carryover_missed_tasks(self):
    """
    00:10 UTC daily — for each recurring task that had no completion log yesterday,
    create a timetable block today as a reminder (if one doesn't already exist).
    """
    db = SessionLocal()
    created = 0
    try:
        TASHKENT = timedelta(hours=5)
        today = (datetime.utcnow() + TASHKENT).date()
        yesterday = today - timedelta(days=1)

        persons = db.query(models.Person).filter(models.Person.is_active == True).all()
        for person in persons:
            recurring_tasks = (
                db.query(models.Task)
                .join(models.Goal, models.Task.goal_id == models.Goal.id)
                .filter(
                    models.Goal.person_id == person.id,
                    models.Goal.deleted == False,
                    models.Task.deleted == False,
                    models.Task.is_recurring == True,
                )
                .all()
            )

            task_ids = [t.id for t in recurring_tasks]
            done_yesterday = set(
                r.task_id for r in db.query(models.ProgressLogTask).filter(
                    models.ProgressLogTask.log_date == yesterday,
                    models.ProgressLogTask.task_id.in_(task_ids),
                ).all()
            )
            # Also count tasks whose timetable block was completed via UI yesterday
            done_yesterday |= set(
                b.task_id
                for b in db.query(models.TimeBlock).filter(
                    models.TimeBlock.person_id == person.id,
                    models.TimeBlock.date == yesterday,
                    models.TimeBlock.deleted == False,
                    models.TimeBlock.is_completed == True,
                    models.TimeBlock.task_id.in_(task_ids),
                ).all()
                if b.task_id is not None
            )

            for task in recurring_tasks:
                if task.id in done_yesterday:
                    continue  # completed yesterday, no carry-over needed

                # Check if a block already exists for today linked to this task
                existing = db.query(models.TimeBlock).filter(
                    models.TimeBlock.person_id == person.id,
                    models.TimeBlock.task_id == task.id,
                    models.TimeBlock.date == today,
                    models.TimeBlock.deleted == False,
                ).first()
                if existing:
                    continue

                # Create a carry-over block (default 08:00, duration from task or 30 min)
                dur = task.estimated_duration or 30
                start = "08:00"
                eh = 8 + dur // 60; em = dur % 60
                end = f"{eh:02d}:{em:02d}"

                block = models.TimeBlock(
                    person_id=person.id,
                    title=f"↩ {task.name}",
                    date=today,
                    start_time=start,
                    end_time=end,
                    category="work",
                    task_id=task.id,
                    is_recurring=False,
                )
                db.add(block)
                created += 1

        db.commit()
        logger.info("carryover_missed_tasks: created %d carry-over blocks", created)
        return {"created": created}
    except Exception as exc:
        db.rollback()
        logger.exception("carryover_missed_tasks failed: %s", exc)
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# 4. Goal deadline warnings (weekly, Monday 08:00 Tashkent = 03:00 UTC)
# ─────────────────────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.goal_deadline_warnings", bind=True, max_retries=2)
def goal_deadline_warnings(self):
    """
    Monday 08:00 Tashkent — warn if a goal's deadline is within 14 days and progress < 50%.
    """
    if not is_configured():
        return {"skipped": True}

    db = SessionLocal()
    warned = 0
    try:
        TASHKENT = timedelta(hours=5)
        today = (datetime.utcnow() + TASHKENT).date()
        deadline_threshold = today + timedelta(days=14)

        persons = db.query(models.Person).filter(models.Person.is_active == True).all()
        for person in persons:
            chat_id = person.telegram_chat_id
            if not chat_id:
                from app.config import settings as cfg
                chat_id = cfg.TELEGRAM_CHAT_ID
            if not chat_id:
                continue

            at_risk = db.query(models.Goal).filter(
                models.Goal.person_id == person.id,
                models.Goal.deleted == False,
                models.Goal.status == "active",
                models.Goal.target_date <= deadline_threshold,
                models.Goal.target_date >= today,
                models.Goal._stored_percentage < 50,
            ).all()

            for goal in at_risk:
                days_left = (goal.target_date - today).days
                msg = (
                    f"⚠️ <b>Goal deadline approaching!</b>\n\n"
                    f"<b>{goal.name}</b>\n"
                    f"Progress: {goal.percentage:.0f}% — only {days_left} days left!\n\n"
                    f"You need to accelerate to hit this goal. "
                    f"Consider scheduling more blocks this week."
                )
                if send_message(msg, chat_id=chat_id):
                    warned += 1

        logger.info("goal_deadline_warnings: warned %d goals", warned)
        return {"warned": warned}
    except Exception as exc:
        db.rollback()
        logger.exception("goal_deadline_warnings failed: %s", exc)
        raise self.retry(exc=exc, countdown=60)
    finally:
        db.close()


# ─────────────────────────────────────────────────────────────────────────────
# 5. Auto-trigger milestone at 25 / 50 / 75 / 100 %
# ─────────────────────────────────────────────────────────────────────────────

MILESTONE_THRESHOLDS = [25, 50, 75, 100]

def check_and_trigger_milestones(db, goal: "models.Goal") -> None:
    """
    Called whenever a goal's percentage changes.
    Creates auto-milestones at 25/50/75/100% if not already achieved,
    and sends a Telegram congratulation.
    """
    pct = goal.percentage
    for threshold in MILESTONE_THRESHOLDS:
        if pct < threshold:
            continue

        # Check if we already have an auto-milestone for this threshold
        existing = db.query(models.Milestone).filter(
            models.Milestone.goal_id == goal.id,
            models.Milestone.completion_percentage == float(threshold),
            models.Milestone.achieved == True,
        ).first()
        if existing:
            continue

        # Mark any existing unachieved milestone at this threshold as achieved
        pending = db.query(models.Milestone).filter(
            models.Milestone.goal_id == goal.id,
            models.Milestone.completion_percentage == float(threshold),
            models.Milestone.achieved == False,
            models.Milestone.deleted == False,
        ).first()

        if pending:
            pending.achieved = True
            pending.achieved_at = datetime.utcnow()
        else:
            # Create auto-milestone
            labels = {25: "Quarter way", 50: "Halfway", 75: "Three quarters", 100: "Completed!"}
            new_ms = models.Milestone(
                goal_id=goal.id,
                name=f"{labels[threshold]}: {goal.name}",
                completion_percentage=float(threshold),
                achieved=True,
                achieved_at=datetime.utcnow(),
            )
            db.add(new_ms)

        db.flush()

        # Send Telegram congratulation
        if not is_configured():
            continue
        person = goal.person
        chat_id = getattr(person, "telegram_chat_id", None)
        if not chat_id:
            from app.config import settings as cfg
            chat_id = cfg.TELEGRAM_CHAT_ID
        if not chat_id:
            continue

        emojis = {25: "🌱", 50: "⚡", 75: "🔥", 100: "🏆"}
        msg = (
            f"{emojis[threshold]} <b>Milestone reached!</b>\n\n"
            f"Goal: <b>{goal.name}</b>\n"
            f"Progress: <b>{threshold}%</b> — {labels[threshold]}!\n\n"
            + ("🎉 You completed this goal! Amazing work!" if threshold == 100
               else "Keep going, you're making great progress!")
        )
        try:
            send_message(msg, chat_id=chat_id)
        except Exception:
            pass
