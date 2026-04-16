from celery import Celery
from celery.schedules import crontab
from app.config import settings

celery_app = Celery(
    "life_tracker",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
)

# ─── Beat schedule ─────────────────────────────────────────────────────────────
celery_app.conf.beat_schedule = {
    # Every 5 minutes — ask about timetable blocks that just ended
    "check-block-completions": {
        "task": "app.tasks.check_block_completions",
        "schedule": crontab(minute="*/5"),
    },

    # Daily 00:05 UTC — mark incomplete blocks from previous days as missed
    "mark-missed-blocks": {
        "task": "app.tasks.mark_missed_blocks",
        "schedule": crontab(hour=0, minute=5),
    },

    # Every Saturday 00:00 UTC — copy recurring timetable blocks to next week
    "copy-recurring-timetable-blocks": {
        "task": "app.tasks.copy_recurring_blocks",
        "schedule": crontab(hour=0, minute=0, day_of_week=6),
    },

    # Daily 03:00 UTC = 08:00 Tashkent — send today's tasks
    "send-morning-tasks": {
        "task": "app.tasks.send_morning_tasks",
        "schedule": crontab(
            hour=settings.NOTIFY_MORNING_HOUR_UTC,
            minute=0,
        ),
    },

    # Daily 17:00 UTC = 22:00 Tashkent — full day summary (blocks + tasks)
    "send-daily-summary": {
        "task": "app.tasks.send_daily_summary",
        "schedule": crontab(hour=17, minute=0),
    },

    # Daily 16:00 UTC = 21:00 Tashkent — evening completion check-in
    "send-evening-checkup": {
        "task": "app.tasks.send_evening_checkup",
        "schedule": crontab(
            hour=settings.NOTIFY_EVENING_HOUR_UTC,
            minute=0,
        ),
    },
}
