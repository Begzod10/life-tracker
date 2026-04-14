import os
import logging
from datetime import datetime, date, timedelta

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Task

logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")


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
    return (
        db.query(Task)
        .filter(Task.deleted == False, Task.completed == False, Task.due_date >= tomorrow)
        .order_by(Task.due_date.asc())
        .limit(5)
        .all()
    )


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


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id
    await update.message.reply_text(
        f"👋 Life Tracker Bot ready!\n\nYour Chat ID: `{chat_id}`\n\n"
        f"/tasks — today's tasks\n/check — check overdue tasks\n/upcoming — upcoming tasks",
        parse_mode="Markdown"
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
            parse_mode="Markdown"
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

            # Ask about next overdue task
            next_overdue = get_overdue_tasks(db)
            if next_overdue:
                task = next_overdue[0]
                await context.bot.send_message(
                    chat_id=query.message.chat_id,
                    text=f"What about this one?\n\n{format_task(task)}",
                    reply_markup=task_keyboard(task.id),
                    parse_mode="Markdown"
                )
            else:
                # Show today's and upcoming tasks
                todays = get_todays_tasks(db)
                upcoming = get_upcoming_tasks(db)
                all_tasks = todays + upcoming
                if all_tasks:
                    text = "🎯 *Next tasks:*\n\n" + "\n".join(f"• {format_task(t)}" for t in all_tasks[:5])
                    await context.bot.send_message(
                        chat_id=query.message.chat_id,
                        text=text,
                        parse_mode="Markdown"
                    )

        elif data.startswith("skip_"):
            task_id = int(data.split("_")[1])
            task = db.query(Task).filter(Task.id == task_id).first()
            name = task.name if task else "task"
            await query.edit_message_text(f"👌 OK, don't forget:\n*{name}*", parse_mode="Markdown")

            # Still show today's and upcoming
            todays = get_todays_tasks(db)
            upcoming = get_upcoming_tasks(db)
            all_tasks = todays + upcoming
            if all_tasks:
                text = "🗓 *Your tasks:*\n\n" + "\n".join(f"• {format_task(t)}" for t in all_tasks[:5])
                await context.bot.send_message(
                    chat_id=query.message.chat_id,
                    text=text,
                    parse_mode="Markdown"
                )
    finally:
        db.close()


async def morning_notification(context: ContextTypes.DEFAULT_TYPE) -> None:
    if not CHAT_ID:
        return
    db = get_db()
    try:
        # Ask about previous unfinished tasks first
        overdue = get_overdue_tasks(db)
        if overdue:
            task = overdue[0]
            await context.bot.send_message(
                chat_id=CHAT_ID,
                text=f"🌅 Good morning!\n\nDid you finish this task?\n\n{format_task(task)}",
                reply_markup=task_keyboard(task.id),
                parse_mode="Markdown"
            )

        # Then show today's tasks
        todays = get_todays_tasks(db)
        if todays:
            text = "📋 *Today's tasks:*\n\n" + "\n".join(f"• {format_task(t)}" for t in todays)
            await context.bot.send_message(chat_id=CHAT_ID, text=text, parse_mode="Markdown")
        elif not overdue:
            await context.bot.send_message(chat_id=CHAT_ID, text="✅ Good morning! No tasks for today!")
    finally:
        db.close()


async def evening_notification(context: ContextTypes.DEFAULT_TYPE) -> None:
    if not CHAT_ID:
        return
    db = get_db()
    try:
        todays = get_todays_tasks(db)
        if not todays:
            await context.bot.send_message(chat_id=CHAT_ID, text="🌙 Good evening! All tasks done today! 🎉")
            return

        task = todays[0]
        text = f"🌙 Evening check-in! *{len(todays)}* unfinished tasks.\n\nDid you finish:\n{format_task(task)}?"
        await context.bot.send_message(
            chat_id=CHAT_ID,
            text=text,
            reply_markup=task_keyboard(task.id),
            parse_mode="Markdown"
        )
    finally:
        db.close()


class TelegramBot:
    def __init__(self):
        if not BOT_TOKEN:
            logger.warning("TELEGRAM_BOT_TOKEN not set — bot disabled")
            self._app = None
            return

        self._app = (
            Application.builder()
            .token(BOT_TOKEN)
            .build()
        )
        self._app.add_handler(CommandHandler("start", start))
        self._app.add_handler(CommandHandler("tasks", tasks_command))
        self._app.add_handler(CommandHandler("upcoming", upcoming_command))
        self._app.add_handler(CommandHandler("check", check_command))
        self._app.add_handler(CallbackQueryHandler(button_callback))

        self._app.job_queue.run_daily(
            morning_notification,
            time=datetime.strptime("08:00", "%H:%M").time(),
        )
        self._app.job_queue.run_daily(
            evening_notification,
            time=datetime.strptime("20:00", "%H:%M").time(),
        )

    async def start(self):
        if not self._app:
            return
        await self._app.initialize()
        await self._app.start()
        await self._app.updater.start_polling(allowed_updates=Update.ALL_TYPES)
        logger.info("Telegram bot started")

    async def stop(self):
        if not self._app:
            return
        await self._app.updater.stop()
        await self._app.stop()
        await self._app.shutdown()
        logger.info("Telegram bot stopped")
