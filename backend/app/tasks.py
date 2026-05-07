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
    Runs every Saturday at 00:00 UTC so the upcoming week is ready in advance.

    Skips a block if an identical one (same person, date, start_time, title)
    already exists to prevent duplicates on retries. Also skips carry-over
    blocks (titles starting with "↩") — those are one-off by definition and
    must never propagate as recurring even if their flag was set incorrectly.
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
            # Carry-overs must never propagate forward — they are one-off by design
            if block.title and block.title.lstrip().startswith("↩"):
                skipped += 1
                continue

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
        logger.info("propagate_recurring_category: updated %d blocks for person %d", updated, person_id)
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

            # Fetch today's timetable blocks
            blocks = db.query(models.TimeBlock).filter(
                models.TimeBlock.person_id == person.id,
                models.TimeBlock.date == today,
                models.TimeBlock.deleted == False,
            ).order_by(models.TimeBlock.start_time).all()

            msg = f"🌅 <b>Good morning, {first_name}!</b>\n\n"

            # Timetable section
            if blocks:
                msg += f"🗓 <b>Today's schedule ({len(blocks)} blocks):</b>\n"
                for b in blocks:
                    msg += f"  ⏰ {b.start_time}–{b.end_time}  {b.title}\n"
                msg += "\n"

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

                # Timetable block stats
                blocks_today = db.query(models.TimeBlock).filter(
                    models.TimeBlock.person_id == person.id,
                    models.TimeBlock.date == today,
                    models.TimeBlock.deleted == False,
                ).all()
                blocks_done = [b for b in blocks_today if b.is_completed]
                blocks_missed = [b for b in blocks_today if b.is_missed]
                blocks_pending = [b for b in blocks_today if not b.is_completed and not b.is_missed]

                lines = [
                    f"🌙 <b>Good evening, {person.name.split()[0]}!</b>",
                    "",
                    f"📊 Progress: {n_done}/{total} ({completion_pct}%)",
                    f"[{bar}]",
                    "",
                ]

                if blocks_today:
                    b_total = len(blocks_today)
                    b_done = len(blocks_done)
                    b_pct = round(b_done / b_total * 100) if b_total else 0
                    lines.append(f"🗓 <b>Schedule: {b_done}/{b_total} blocks done ({b_pct}%)</b>")
                    if blocks_done:
                        lines += [f"  ✅ {b.start_time} {b.title}" for b in blocks_done]
                    if blocks_missed:
                        lines += [f"  ❌ {b.start_time} {b.title}" for b in blocks_missed]
                    if blocks_pending:
                        lines += [f"  ⏳ {b.start_time} {b.title}" for b in blocks_pending]
                    lines.append("")

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


def _call_openai(prompt: str, *, max_tokens: int = 300, temperature: float = 0.7) -> str:
    """Call OpenAI Chat Completions API and return the generated text."""
    import httpx
    from app.config import settings

    if not settings.OPENAI_API_KEY:
        return ""

    client_kwargs = {"timeout": 30}
    if settings.OPENAI_PROXY_URL:
        client_kwargs["proxy"] = settings.OPENAI_PROXY_URL
        logger.info("OpenAI request routed through proxy")

    with httpx.Client(**client_kwargs) as client:
        resp = client.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
            json={
                "model": settings.OPENAI_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": max_tokens,
                "temperature": temperature,
            },
        )
    if resp.status_code >= 400:
        logger.warning("OpenAI %s: %s", resp.status_code, resp.text[:300])
        resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


def _call_groq(prompt: str, *, max_tokens: int = 300, temperature: float = 0.7) -> str:
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
            "max_tokens": max_tokens,
            "temperature": temperature,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


def _generate_text(prompt: str, *, max_tokens: int = 300, temperature: float = 0.7) -> str:
    """Generate text using OpenAI, falling back to Groq if OpenAI is unavailable."""
    from app.config import settings

    if settings.OPENAI_API_KEY:
        try:
            text = _call_openai(prompt, max_tokens=max_tokens, temperature=temperature)
            if text:
                return text
        except Exception as e:
            logger.warning("_generate_text: OpenAI failed, falling back to Groq: %s", e)

    if settings.GROQ_API_KEY:
        return _call_groq(prompt, max_tokens=max_tokens, temperature=temperature)

    return ""


def generate_conclusion_for_person(db, person, target_date, *, force: bool = False, send_telegram: bool = True) -> dict:
    """
    Generate (or regenerate) a daily conclusion for a single person.
    Returns {"status": "generated" | "skipped_existing" | "skipped_empty" | "skipped_no_text", "conclusion": str | None}.
    Caller manages the session.
    """
    from app.config import settings

    not_deleted_task = or_(models.Task.deleted == False, models.Task.deleted.is_(None))

    existing = db.query(models.DailyConclusion).filter(
        models.DailyConclusion.person_id == person.id,
        models.DailyConclusion.date == target_date,
    ).first()
    if existing and not force:
        return {"status": "skipped_existing", "conclusion": existing.conclusion}

    blocks = (
        db.query(models.TimeBlock)
        .filter(
            models.TimeBlock.person_id == person.id,
            models.TimeBlock.date == target_date,
            models.TimeBlock.deleted == False,
        )
        .order_by(models.TimeBlock.start_time.asc())
        .all()
    )
    all_tasks = (
        db.query(models.Task)
        .join(models.Goal, models.Task.goal_id == models.Goal.id)
        .filter(
            models.Goal.person_id == person.id,
            models.Goal.deleted == False,
            not_deleted_task,
            or_(
                models.Task.due_date == target_date,
                models.Task.is_recurring == True,
                models.Task.task_type == "daily",
            ),
        )
        .all()
    )

    if not blocks and not all_tasks:
        return {"status": "skipped_empty", "conclusion": None}

    lines = [f"Date: {target_date.strftime('%A, %B %d %Y')}", ""]

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
                models.ProgressLogTask.log_date == target_date,
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

    prompt = (
        f"You are a personal productivity coach. Here is the user's day:\n\n"
        f"{chr(10).join(lines)}\n"
        f"Write a brief 2-3 sentence conclusion about this day. "
        f"Be honest about what was missed but stay motivating. "
        f"Mention one specific thing they did well and one improvement for tomorrow. "
        f"Be concise and personal."
    )

    conclusion_text = _generate_text(prompt)
    if not conclusion_text:
        return {"status": "skipped_no_text", "conclusion": None}

    if existing:
        existing.conclusion = conclusion_text
    else:
        existing = models.DailyConclusion(
            person_id=person.id,
            date=target_date,
            conclusion=conclusion_text,
        )
        db.add(existing)
    db.commit()

    if send_telegram:
        chat_id = person.telegram_chat_id or settings.TELEGRAM_CHAT_ID
        if chat_id:
            try:
                send_message(
                    f"🤖 <b>AI Daily Conclusion</b>\n\n{conclusion_text}",
                    chat_id=chat_id,
                )
            except Exception as e:
                logger.warning("Failed to send conclusion to Telegram: %s", e)

    return {"status": "generated", "conclusion": conclusion_text}


@celery_app.task(name="app.tasks.generate_daily_conclusion", bind=True, max_retries=2)
def generate_daily_conclusion(self):
    """
    22:30 Tashkent (17:30 UTC) — generate AI conclusion for each user's day.
    Summarises completed/missed blocks and tasks, saves to daily_conclusions.
    """
    from app.config import settings

    if not (settings.OPENAI_API_KEY or settings.GROQ_API_KEY):
        logger.info("generate_daily_conclusion: no AI provider configured, skipping")
        return {"skipped": True}

    db = SessionLocal()
    generated = 0
    try:
        TASHKENT = timedelta(hours=5)
        today = (datetime.utcnow() + TASHKENT).date()

        persons = db.query(models.Person).filter(models.Person.is_active == True).all()

        for person in persons:
            try:
                result = generate_conclusion_for_person(db, person, today, force=False)
                if result["status"] == "generated":
                    generated += 1
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

            # AI tip via OpenAI (with Groq fallback)
            from app.config import settings as cfg2
            if (cfg2.OPENAI_API_KEY or cfg2.GROQ_API_KEY) and (total_b > 0 or all_tasks):
                prompt = (
                    f"User's week: {done_b}/{total_b} timetable blocks done, "
                    f"{done_t}/{len(all_tasks)} tasks completed, "
                    f"top category: {top_cat}. "
                    f"Give ONE specific, actionable improvement tip for next week in 1-2 sentences. Be direct."
                )
                try:
                    tip = _generate_text(prompt)
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
# 3. Carry-over missed recurring blocks → tomorrow (runs at 17:05 UTC = 22:05 Tashkent)
# ─────────────────────────────────────────────────────────────────────────────

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

            # Missed blocks today: not completed, end_time has passed, linked to recurring task or block is recurring
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

            # Tomorrow's existing blocks for slot conflict check
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
                # Skip if already has a carry-over block for tomorrow for this task
                if block.task_id:
                    existing = db.query(models.TimeBlock).filter(
                        models.TimeBlock.person_id == person.id,
                        models.TimeBlock.task_id == block.task_id,
                        models.TimeBlock.date == tomorrow,
                        models.TimeBlock.deleted == False,
                    ).first()
                    if existing:
                        continue

                dur = block.end_time and block.start_time and (
                    _to_minutes(block.end_time) - _to_minutes(block.start_time)
                ) or 30

                # Try before 22:00 first, then extend to midnight if needed
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
                    # Truly no slot in the whole day — ask user to pick a free time
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
                            free_options = candidates[-8:]  # last resort: show late slots
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


def _is_recurring_task(db, task_id: int) -> bool:
    task = db.query(models.Task).filter(models.Task.id == task_id).first()
    return bool(task and task.is_recurring)


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


# ─────────────────────────────────────────────────────────────────────────────
# Word of the Day (09:00 Tashkent / 04:00 UTC)
# ─────────────────────────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.send_word_of_the_day", bind=True, max_retries=2)
def send_word_of_the_day(self):
    """For each active user with a Telegram chat configured, pick one word
    from their due-review pool and send a quick prompt."""
    from app.config import settings

    if not is_configured():
        return {"skipped": "telegram_not_configured"}

    import json as _json
    import random as _random

    db = SessionLocal()
    sent = 0
    try:
        persons = db.query(models.Person).filter(models.Person.is_active == True).all()
        for person in persons:
            chat_id = person.telegram_chat_id or settings.TELEGRAM_CHAT_ID
            if not chat_id:
                continue

            # Prefer due/never-reviewed words; fall back to any word.
            candidates = (
                db.query(models.DictionaryWord)
                .filter(
                    models.DictionaryWord.person_id == person.id,
                    models.DictionaryWord.deleted == False,
                    or_(
                        models.DictionaryWord.next_review_at.is_(None),
                        models.DictionaryWord.next_review_at <= datetime.utcnow(),
                    ),
                )
                .all()
            )
            if not candidates:
                candidates = (
                    db.query(models.DictionaryWord)
                    .filter(
                        models.DictionaryWord.person_id == person.id,
                        models.DictionaryWord.deleted == False,
                    )
                    .all()
                )
            if not candidates:
                continue

            word = _random.choice(candidates)
            examples = []
            if word.examples:
                try:
                    examples = _json.loads(word.examples)
                except Exception:
                    examples = []

            lines = [f"🌅 <b>Word of the day:</b> <code>{word.word}</code>"]
            if word.phonetic:
                lines.append(f"<i>{word.phonetic}</i>")
            lines.append("")
            lines.append(word.definition)
            if word.translation:
                lines.append(f"\n🇺🇿 / 🇷🇺 {word.translation}")
            if examples:
                lines.append("")
                lines.append(f"<i>e.g.</i> {examples[0]}")

            try:
                if send_message("\n".join(lines), chat_id=chat_id):
                    sent += 1
            except Exception as e:
                logger.warning("send_word_of_the_day: telegram send failed for person %d: %s", person.id, e)

        logger.info("send_word_of_the_day: sent to %d users", sent)
        return {"sent": sent}

    except Exception as exc:
        db.rollback()
        logger.exception("send_word_of_the_day failed: %s", exc)
        raise self.retry(exc=exc, countdown=60 * 5)
    finally:
        db.close()
