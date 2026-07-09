"""
Scheduled Telegram notification tasks:
  - send_morning_tasks    : 08:00 Tashkent — today's schedule + tasks
  - send_evening_checkup  : 21:00 Tashkent — completion summary
  - send_daily_summary    : 22:00 Tashkent — full block + task summary
  - send_weekly_review    : Sunday 20:00 Tashkent — weekly stats + wrapped card
  - send_word_of_the_day  : 09:00 Tashkent — SRS word prompt
  - goal_deadline_warnings: Monday 08:00 Tashkent — goals approaching deadline
"""
from datetime import date, datetime, timedelta

import logging
from sqlalchemy import or_

from app.celery_app import celery_app
from app.database import SessionLocal
from app import models
from app.bot.telegram import send_message, send_photo, is_configured

logger = logging.getLogger(__name__)

PRIORITY_EMOJI = {"high": "🔴", "medium": "🟡", "low": "🟢"}


# ─── Query helpers ────────────────────────────────────────────────────────────

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
    not_deleted = or_(models.Task.deleted == False, models.Task.deleted.is_(None))

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


# ─── Tasks ───────────────────────────────────────────────────────────────────

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

            blocks = db.query(models.TimeBlock).filter(
                models.TimeBlock.person_id == person.id,
                models.TimeBlock.date == today,
                models.TimeBlock.deleted == False,
            ).order_by(models.TimeBlock.start_time).all()

            msg = f"🌅 <b>Good morning, {first_name}!</b>\n\n"

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
        not_deleted = or_(models.Task.deleted == False, models.Task.deleted.is_(None))

        persons = db.query(models.Person).filter(models.Person.is_active == True).all()

        for person in persons:
            chat_id = person.telegram_chat_id
            if not chat_id:
                from app.config import settings
                chat_id = settings.TELEGRAM_CHAT_ID
            if not chat_id:
                continue

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
                recurring_done_today = set(
                    row.task_id
                    for row in db.query(models.ProgressLogTask).filter(
                        models.ProgressLogTask.log_date == today,
                        models.ProgressLogTask.task_id.in_([t.id for t in all_today]),
                    ).all()
                )

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

                filled = round(completion_pct / 10)
                bar = "█" * filled + "░" * (10 - filled)

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

            block_task_ids_summary = set(
                row[0]
                for row in db.query(models.TimeBlock.task_id)
                .filter(
                    models.TimeBlock.person_id == person.id,
                    models.TimeBlock.date == today,
                    models.TimeBlock.deleted == False,
                    models.TimeBlock.task_id.isnot(None),
                )
                .all()
            )

            candidate_tasks = (
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
            all_tasks = [t for t in candidate_tasks if t.id in block_task_ids_summary]

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
        week_start = today - timedelta(days=today.weekday())
        not_deleted_task = or_(models.Task.deleted == False, models.Task.deleted.is_(None))

        persons = db.query(models.Person).filter(models.Person.is_active == True).all()

        for person in persons:
            chat_id = person.telegram_chat_id
            if not chat_id:
                from app.config import settings as cfg
                chat_id = cfg.TELEGRAM_CHAT_ID
            if not chat_id:
                continue

            goals = db.query(models.Goal).filter(
                models.Goal.person_id == person.id,
                models.Goal.deleted == False,
                models.Goal.status == "active",
            ).all()

            frozen_this_week = {
                row.date
                for row in db.query(models.FrozenDay).filter(
                    models.FrozenDay.person_id == person.id,
                    models.FrozenDay.date >= week_start,
                    models.FrozenDay.date <= today,
                ).all()
            }
            blocks = [
                b for b in db.query(models.TimeBlock).filter(
                    models.TimeBlock.person_id == person.id,
                    models.TimeBlock.date >= week_start,
                    models.TimeBlock.date <= today,
                    models.TimeBlock.deleted == False,
                ).all()
                if b.date not in frozen_this_week
            ]

            total_b = len(blocks)
            done_b = sum(1 for b in blocks if b.is_completed)
            missed_b = sum(1 for b in blocks if b.date < today and not b.is_completed)

            from collections import defaultdict as _dd
            cat_hours = _dd(float)
            for b in blocks:
                h, m = b.start_time.split(":"); eh, em = b.end_time.split(":")
                cat_hours[b.category or "other"] += max(0, (int(eh)*60+int(em) - int(h)*60-int(m))) / 60
            top_cat = max(cat_hours, key=cat_hours.get) if cat_hours else "—"

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

            from app.config import settings as cfg2
            if (cfg2.OPENAI_API_KEY or cfg2.GROQ_API_KEY) and (total_b > 0 or all_tasks):
                from app.tasks.ai_providers import _generate_text
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

            try:
                from app.services.weekly_card import (
                    compute_weekly_stats,
                    generate_uzbek_motivation_line,
                    render_weekly_card,
                )
                stats = compute_weekly_stats(db, person, week_start, today)
                ai_line = generate_uzbek_motivation_line(stats)
                png_bytes = render_weekly_card(stats, ai_line)
                caption = (
                    f"<b>{ai_line}</b>\n"
                    f"{stats['completed_blocks']}/{stats['total_blocks']} blocks · "
                    f"streak {stats['streak_days']}"
                )
                send_photo(
                    png_bytes,
                    chat_id=chat_id,
                    caption=caption,
                    filename=f"weekly-{week_start.isoformat()}.png",
                )
            except Exception as card_exc:
                logger.exception(
                    "send_weekly_review: card render failed for person %s: %s",
                    person.id, card_exc,
                )

        logger.info("send_weekly_review: sent to %d users", sent)
        return {"sent": sent}
    except Exception as exc:
        db.rollback()
        logger.exception("send_weekly_review failed: %s", exc)
        raise self.retry(exc=exc, countdown=60 * 5)
    finally:
        db.close()


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
                logger.warning(
                    "send_word_of_the_day: telegram send failed for person %d: %s",
                    person.id, e,
                )

        logger.info("send_word_of_the_day: sent to %d users", sent)
        return {"sent": sent}

    except Exception as exc:
        db.rollback()
        logger.exception("send_word_of_the_day failed: %s", exc)
        raise self.retry(exc=exc, countdown=60 * 5)
    finally:
        db.close()


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
