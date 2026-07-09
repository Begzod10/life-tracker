"""
Celery tasks for the Life Tracker backend.

Modules:
  ai_providers  — LLM provider chain (Gemini → OpenAI → Groq)
  timetable     — recurring blocks, carry-over, missed tracking
  notifications — morning/evening/daily/weekly Telegram messages
  conclusions   — AI daily conclusion generation and delivery
  milestones    — auto-milestone triggering on goal progress
  news          — daily news fetch pipeline

All public symbols are re-exported here so existing
`from app.tasks import X` imports in routers and services continue to work.
"""

from app.tasks.ai_providers import (
    _generate_text,
    _call_gemini,
    _call_openai,
    _call_groq,
)

from app.tasks.timetable import (
    copy_recurring_blocks,
    propagate_recurring_category,
    mark_missed_blocks,
    check_block_completions,
    send_block_checkin,
    carryover_missed_tasks,
)

from app.tasks.notifications import (
    PRIORITY_EMOJI,
    send_morning_tasks,
    send_evening_checkup,
    send_daily_summary,
    send_weekly_review,
    send_word_of_the_day,
    goal_deadline_warnings,
)

from app.tasks.conclusions import (
    generate_conclusion_for_person,
    generate_daily_conclusion,
    retry_undelivered_conclusions,
)

from app.tasks.milestones import (
    MILESTONE_THRESHOLDS,
    check_and_trigger_milestones,
)

from app.tasks.news import fetch_daily_news

__all__ = [
    # ai providers
    "_generate_text",
    "_call_gemini",
    "_call_openai",
    "_call_groq",
    # timetable
    "copy_recurring_blocks",
    "propagate_recurring_category",
    "mark_missed_blocks",
    "check_block_completions",
    "send_block_checkin",
    "carryover_missed_tasks",
    # notifications
    "PRIORITY_EMOJI",
    "send_morning_tasks",
    "send_evening_checkup",
    "send_daily_summary",
    "send_weekly_review",
    "send_word_of_the_day",
    "goal_deadline_warnings",
    # conclusions
    "generate_conclusion_for_person",
    "generate_daily_conclusion",
    "retry_undelivered_conclusions",
    # milestones
    "MILESTONE_THRESHOLDS",
    "check_and_trigger_milestones",
    # news
    "fetch_daily_news",
]
