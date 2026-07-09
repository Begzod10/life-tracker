"""
AI daily conclusion tasks:
  - generate_conclusion_for_person : shared helper (also called by the router)
  - generate_daily_conclusion       : 22:30 Tashkent scheduled task
  - retry_undelivered_conclusions   : every 10 min — resend rows with telegram_sent_at IS NULL
"""
from datetime import datetime, timedelta

import logging
from sqlalchemy import or_

from app.celery_app import celery_app
from app.database import SessionLocal
from app import models
from app.bot.telegram import send_message

logger = logging.getLogger(__name__)


def generate_conclusion_for_person(
    db, person, target_date, *, force: bool = False, send_telegram: bool = True
) -> dict:
    """
    Generate (or regenerate) a daily conclusion for a single person.
    Returns {"status": "generated"|"skipped_existing"|"skipped_empty"|"skipped_no_text", "conclusion": str|None}.
    Caller manages the session.
    """
    from app.config import settings
    from app.tasks.ai_providers import _generate_text

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
                existing.telegram_sent_at = datetime.utcnow()
                db.commit()
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

    if not (settings.GEMINI_API_KEY or settings.OPENAI_API_KEY or settings.GROQ_API_KEY):
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
                logger.exception(
                    "generate_daily_conclusion: failed for person %d: %s", person.id, e
                )
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


@celery_app.task(name="app.tasks.retry_undelivered_conclusions", bind=True)
def retry_undelivered_conclusions(self):
    """Resend AI daily conclusions whose row exists but telegram_sent_at is
    NULL (i.e. the worker was killed mid-send, the Telegram API blipped, or
    the chat_id was missing when the row was first written). Only looks at
    the last 2 days so we never re-deliver ancient messages."""
    from app.config import settings

    db = SessionLocal()
    sent = 0
    failed = 0
    try:
        TASHKENT = timedelta(hours=5)
        now_tashkent = datetime.utcnow() + TASHKENT
        today = now_tashkent.date()
        cutoff = today - timedelta(days=1)

        # Don't retry today's conclusion before the scheduled send time (22:30 Tashkent).
        CONCLUSION_HOUR = 22
        CONCLUSION_MINUTE = 30
        today_eligible = now_tashkent.hour > CONCLUSION_HOUR or (
            now_tashkent.hour == CONCLUSION_HOUR and now_tashkent.minute >= CONCLUSION_MINUTE
        )

        rows = (
            db.query(models.DailyConclusion)
            .filter(
                models.DailyConclusion.telegram_sent_at.is_(None),
                models.DailyConclusion.date >= cutoff,
            )
            .all()
        )

        for row in rows:
            if row.date == today and not today_eligible:
                continue
            person = db.query(models.Person).filter(models.Person.id == row.person_id).first()
            if not person:
                continue
            chat_id = person.telegram_chat_id or settings.TELEGRAM_CHAT_ID
            if not chat_id:
                continue
            try:
                send_message(
                    f"🤖 <b>AI Daily Conclusion</b>\n\n{row.conclusion}",
                    chat_id=chat_id,
                )
                row.telegram_sent_at = datetime.utcnow()
                db.commit()
                sent += 1
            except Exception as e:
                db.rollback()
                logger.warning(
                    "retry_undelivered_conclusions: failed for person %d: %s",
                    person.id, e,
                )
                failed += 1

        if sent or failed:
            logger.info("retry_undelivered_conclusions: sent=%d failed=%d", sent, failed)
        return {"sent": sent, "failed": failed}
    finally:
        db.close()
