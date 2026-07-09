"""
Milestone auto-trigger logic.

check_and_trigger_milestones() is called synchronously from goal routers
(not a Celery task) whenever a goal's percentage changes.
"""
from datetime import datetime

import logging

from app import models
from app.bot.telegram import send_message, is_configured

logger = logging.getLogger(__name__)

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

        existing = db.query(models.Milestone).filter(
            models.Milestone.goal_id == goal.id,
            models.Milestone.completion_percentage == float(threshold),
            models.Milestone.achieved == True,
        ).first()
        if existing:
            continue

        pending = db.query(models.Milestone).filter(
            models.Milestone.goal_id == goal.id,
            models.Milestone.completion_percentage == float(threshold),
            models.Milestone.achieved == False,
            models.Milestone.deleted == False,
        ).first()

        labels = {25: "Quarter way", 50: "Halfway", 75: "Three quarters", 100: "Completed!"}

        if pending:
            pending.achieved = True
            pending.achieved_at = datetime.utcnow()
        else:
            new_ms = models.Milestone(
                goal_id=goal.id,
                name=f"{labels[threshold]}: {goal.name}",
                completion_percentage=float(threshold),
                achieved=True,
                achieved_at=datetime.utcnow(),
            )
            db.add(new_ms)

        db.flush()

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
