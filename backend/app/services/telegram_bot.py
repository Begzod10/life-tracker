"""
Telegram bot — webhook mode.

Telegram pushes every update to POST /api/bot/webhook.
FastAPI passes the raw dict to TelegramBotService.process_update().
Celery handles scheduled morning/evening notifications (see app/tasks.py).
"""

import logging
from datetime import date, timedelta, datetime

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Task, TimeBlock
from app.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def get_db() -> Session:
    return SessionLocal()


def get_overdue_tasks(db: Session) -> list:
    yesterday = date.today() - timedelta(days=1)
    return (
        db.query(Task)
        .filter(Task.deleted == False, Task.completed == False, Task.due_date <= yesterday)
        .order_by(Task.due_date.asc())
        .all()
    )


def get_todays_tasks(db: Session) -> list:
    return (
        db.query(Task)
        .filter(Task.deleted == False, Task.completed == False, Task.due_date == date.today())
        .order_by(Task.priority.desc())
        .all()
    )


def get_upcoming_tasks(db: Session) -> list:
    tomorrow = date.today() + timedelta(days=1)
    future = date.today() + timedelta(days=4)

    # Tasks with a due_date in the next few days
    due_date_tasks = (
        db.query(Task)
        .filter(Task.deleted == False, Task.completed == False,
                Task.due_date >= tomorrow, Task.due_date <= future)
        .all()
    )

    # Tasks linked to upcoming time blocks (no due_date required)
    timetable_task_ids = {
        row.task_id
        for row in db.query(TimeBlock.task_id)
        .filter(
            TimeBlock.deleted == False,
            TimeBlock.task_id != None,
            TimeBlock.date >= tomorrow,
            TimeBlock.date <= future,
        )
        .all()
        if row.task_id
    }

    # Add timetable-linked tasks not already in due_date list
    existing_ids = {t.id for t in due_date_tasks}
    extra_ids = timetable_task_ids - existing_ids
    if extra_ids:
        extra_tasks = (
            db.query(Task)
            .filter(Task.id.in_(extra_ids), Task.deleted == False, Task.completed == False)
            .all()
        )
        due_date_tasks = due_date_tasks + extra_tasks

    return sorted(due_date_tasks, key=lambda t: (t.due_date or date.max))[:5]


def complete_task(db: Session, task_id: int) -> bool:
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        return False
    task.completed = True
    task.completed_at = datetime.utcnow()
    db.commit()
    return True


def format_task(task: Task) -> str:
    priority_emoji = {"high": "🔴", "medium": "🟡", "low": "🟢"}.get(task.priority, "⚪")
    due = f" | Due: {task.due_date}" if task.due_date else ""
    return f"{priority_emoji} *{task.name}*{due}"


def task_keyboard(task_id: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup([[
        InlineKeyboardButton("✅ Yes, done!", callback_data=f"done_{task_id}"),
        InlineKeyboardButton("❌ Not yet", callback_data=f"skip_{task_id}"),
    ]])


# ---------------------------------------------------------------------------
# Command handlers
# ---------------------------------------------------------------------------

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = str(update.effective_chat.id)

    # /start TOKEN — account linking flow
    if context.args:
        token = context.args[0]
        from app.services.link_tokens import consume_token
        user_id = consume_token(token)
        if user_id:
            db = get_db()
            try:
                from app.models import Person
                person = db.query(Person).filter(Person.id == user_id).first()
                if person:
                    person.telegram_chat_id = chat_id
                    db.commit()
                    await update.message.reply_text(
                        f"✅ <b>Connected!</b>\n\n"
                        f"Your Telegram is now linked to Life Tracker, {person.name}.\n"
                        f"You'll receive daily task reminders here.\n\n"
                        f"Commands:\n"
                        f"/tasks — today's tasks\n"
                        f"/check — overdue tasks\n"
                        f"/upcoming — upcoming tasks",
                        parse_mode="HTML",
                    )
                    return
            finally:
                db.close()
        # Token expired or invalid
        await update.message.reply_text(
            "⚠️ <b>Link expired.</b>\n\n"
            "Please open your profile page and click <b>Connect Telegram</b> again.",
            parse_mode="HTML",
        )
        return

    # Normal /start
    await update.message.reply_text(
        f"👋 <b>Life Tracker Bot</b>\n\n"
        f"Your Chat ID: <code>{chat_id}</code>\n\n"
        f"Commands:\n"
        f"/tasks — today's tasks\n"
        f"/check — overdue tasks\n"
        f"/upcoming — upcoming tasks",
        parse_mode="HTML",
    )


async def tasks_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    db = get_db()
    try:
        tasks = get_todays_tasks(db)
        if not tasks:
            await update.message.reply_text("✅ No tasks for today!")
            return
        text = "📋 *Today's Tasks:*\n\n" + "\n".join(f"• {format_task(t)}" for t in tasks)
        await update.message.reply_text(text, parse_mode="Markdown")
    finally:
        db.close()


async def upcoming_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    db = get_db()
    try:
        tasks = get_upcoming_tasks(db)
        if not tasks:
            await update.message.reply_text("✅ No upcoming tasks!")
            return
        text = "🗓 *Upcoming Tasks:*\n\n" + "\n".join(f"• {format_task(t)}" for t in tasks)
        await update.message.reply_text(text, parse_mode="Markdown")
    finally:
        db.close()


async def check_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    db = get_db()
    try:
        tasks = get_overdue_tasks(db)
        if not tasks:
            await update.message.reply_text("✅ No overdue tasks!")
            return
        task = tasks[0]
        await update.message.reply_text(
            f"Did you finish this task?\n\n{format_task(task)}",
            reply_markup=task_keyboard(task.id),
            parse_mode="Markdown",
        )
    finally:
        db.close()


async def button_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    await query.answer()
    data = query.data
    db = get_db()
    try:
        if data.startswith("done_"):
            task_id = int(data.split("_")[1])
            complete_task(db, task_id)
            await query.edit_message_text("✅ Great job! Task marked as done!")

            next_overdue = get_overdue_tasks(db)
            if next_overdue:
                task = next_overdue[0]
                await context.bot.send_message(
                    chat_id=query.message.chat_id,
                    text=f"What about this one?\n\n{format_task(task)}",
                    reply_markup=task_keyboard(task.id),
                    parse_mode="Markdown",
                )
            else:
                todays = get_todays_tasks(db)
                upcoming = get_upcoming_tasks(db)
                all_tasks = todays + upcoming
                if all_tasks:
                    text = "🎯 *Next tasks:*\n\n" + "\n".join(f"• {format_task(t)}" for t in all_tasks[:5])
                    await context.bot.send_message(
                        chat_id=query.message.chat_id,
                        text=text,
                        parse_mode="Markdown",
                    )

        elif data.startswith("skip_"):
            task_id = int(data.split("_")[1])
            task = db.query(Task).filter(Task.id == task_id).first()
            name = task.name if task else "task"
            await query.edit_message_text(f"👌 OK, don't forget:\n*{name}*", parse_mode="Markdown")

            todays = get_todays_tasks(db)
            upcoming = get_upcoming_tasks(db)
            all_tasks = todays + upcoming
            if all_tasks:
                text = "🗓 *Your tasks:*\n\n" + "\n".join(f"• {format_task(t)}" for t in all_tasks[:5])
                await context.bot.send_message(
                    chat_id=query.message.chat_id,
                    text=text,
                    parse_mode="Markdown",
                )
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Bot service singleton
# ---------------------------------------------------------------------------

class TelegramBotService:
    """
    Webhook-mode bot service.

    Lifecycle (called from main.py lifespan):
      await bot_service.initialize()   # startup
      await bot_service.shutdown()     # shutdown

    Update processing (called from /api/bot/webhook endpoint):
      await bot_service.process_update(json_dict)
    """

    def __init__(self):
        if not settings.TELEGRAM_BOT_TOKEN:
            logger.warning("TELEGRAM_BOT_TOKEN not set — bot disabled")
            self._app = None
            return

        self._app = (
            Application.builder()
            .token(settings.TELEGRAM_BOT_TOKEN)
            .updater(None)          # disable built-in polling updater
            .build()
        )
        self._app.add_handler(CommandHandler("start", start))
        self._app.add_handler(CommandHandler("tasks", tasks_command))
        self._app.add_handler(CommandHandler("upcoming", upcoming_command))
        self._app.add_handler(CommandHandler("check", check_command))
        self._app.add_handler(CallbackQueryHandler(button_callback))

    @property
    def configured(self) -> bool:
        return self._app is not None

    async def initialize(self):
        if not self._app:
            return
        await self._app.initialize()
        await self._app.start()

        if settings.WEBHOOK_BASE_URL:
            webhook_url = f"{settings.WEBHOOK_BASE_URL.rstrip('/')}/api/bot/webhook"
            await self._app.bot.set_webhook(
                url=webhook_url,
                secret_token=settings.TELEGRAM_WEBHOOK_SECRET or None,
                allowed_updates=Update.ALL_TYPES,
            )
            logger.info("Telegram webhook registered: %s", webhook_url)
        else:
            logger.info("WEBHOOK_BASE_URL not set — webhook not registered (use polling or set the URL)")

    async def shutdown(self):
        if not self._app:
            return
        await self._app.stop()
        await self._app.shutdown()
        logger.info("Telegram bot stopped")

    async def process_update(self, data: dict):
        if not self._app:
            return
        update = Update.de_json(data, self._app.bot)
        await self._app.process_update(update)


# Module-level singleton imported by main.py and bot.py router
bot_service = TelegramBotService()
