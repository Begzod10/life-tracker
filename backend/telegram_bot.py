#!/usr/bin/env python3
import os
import asyncio
import logging
from datetime import datetime, date, timedelta
from dotenv import load_dotenv

from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (
    Application, CommandHandler, CallbackQueryHandler,
    ContextTypes, JobQueue
)
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Task, Person

load_dotenv()

BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "8723444730:AAEGb51AJqKrYmqtnFJT9W8fh_xUzHaQ_CI")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")

logging.basicConfig(
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    level=logging.INFO
)
logger = logging.getLogger(__name__)


def get_db() -> Session:
    return SessionLocal()


def get_incomplete_tasks(db: Session) -> list[Task]:
    today = date.today()
    return (
        db.query(Task)
        .filter(
            Task.deleted == False,
            Task.completed == False,
            (Task.due_date == None) | (Task.due_date >= today)
        )
        .order_by(Task.due_date.asc().nullslast(), Task.priority.desc())
        .limit(10)
        .all()
    )


def get_previous_incomplete_task(db: Session) -> Task | None:
    yesterday = date.today() - timedelta(days=1)
    return (
        db.query(Task)
        .filter(
            Task.deleted == False,
            Task.completed == False,
            Task.due_date <= yesterday
        )
        .order_by(Task.due_date.asc())
        .first()
    )


def get_todays_tasks(db: Session) -> list[Task]:
    today = date.today()
    return (
        db.query(Task)
        .filter(
            Task.deleted == False,
            Task.completed == False,
            Task.due_date == today
        )
        .order_by(Task.priority.desc())
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


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    chat_id = update.effective_chat.id
    logger.info(f"Chat ID: {chat_id}")
    await update.message.reply_text(
        f"👋 Life Tracker Bot is ready!\n\n"
        f"Your Chat ID: `{chat_id}`\n\n"
        f"Commands:\n"
        f"/tasks — show today's tasks\n"
        f"/check — check previous unfinished tasks\n"
        f"/upcoming — show upcoming tasks",
        parse_mode="Markdown"
    )


async def tasks_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    db = get_db()
    try:
        tasks = get_todays_tasks(db)
        if not tasks:
            await update.message.reply_text("✅ No tasks for today!")
            return

        text = "📋 *Today's Tasks:*\n\n"
        for task in tasks:
            text += f"• {format_task(task)}\n"

        await update.message.reply_text(text, parse_mode="Markdown")
    finally:
        db.close()


async def upcoming_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    db = get_db()
    try:
        tasks = get_incomplete_tasks(db)
        if not tasks:
            await update.message.reply_text("✅ No upcoming tasks!")
            return

        text = "🗓 *Upcoming Tasks:*\n\n"
        for task in tasks:
            text += f"• {format_task(task)}\n"

        await update.message.reply_text(text, parse_mode="Markdown")
    finally:
        db.close()


async def check_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    db = get_db()
    try:
        task = get_previous_incomplete_task(db)
        if not task:
            await update.message.reply_text("✅ No overdue tasks!")
            return

        keyboard = [
            [
                InlineKeyboardButton("✅ Yes, done!", callback_data=f"done_{task.id}"),
                InlineKeyboardButton("❌ Not yet", callback_data=f"skip_{task.id}"),
            ]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await update.message.reply_text(
            f"Did you finish this task?\n\n{format_task(task)}",
            reply_markup=reply_markup,
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

            # Show next task
            next_task = get_previous_incomplete_task(db)
            await query.edit_message_text("✅ Great job! Task marked as done!")

            if next_task:
                keyboard = [
                    [
                        InlineKeyboardButton("✅ Yes, done!", callback_data=f"done_{next_task.id}"),
                        InlineKeyboardButton("❌ Not yet", callback_data=f"skip_{next_task.id}"),
                    ]
                ]
                reply_markup = InlineKeyboardMarkup(keyboard)
                await context.bot.send_message(
                    chat_id=query.message.chat_id,
                    text=f"What about this one?\n\n{format_task(next_task)}",
                    reply_markup=reply_markup,
                    parse_mode="Markdown"
                )
            else:
                upcoming = get_incomplete_tasks(db)
                if upcoming:
                    text = "🎯 *Next upcoming tasks:*\n\n"
                    for t in upcoming[:3]:
                        text += f"• {format_task(t)}\n"
                    await context.bot.send_message(
                        chat_id=query.message.chat_id,
                        text=text,
                        parse_mode="Markdown"
                    )

        elif data.startswith("skip_"):
            task_id = int(data.split("_")[1])
            task = db.query(Task).filter(Task.id == task_id).first()
            await query.edit_message_text(f"👌 OK, don't forget to finish:\n*{task.name}*", parse_mode="Markdown")

            # Still show upcoming tasks
            upcoming = get_incomplete_tasks(db)
            if upcoming:
                text = "🗓 *Upcoming tasks:*\n\n"
                for t in upcoming[:3]:
                    text += f"• {format_task(t)}\n"
                await context.bot.send_message(
                    chat_id=query.message.chat_id,
                    text=text,
                    parse_mode="Markdown"
                )
    finally:
        db.close()


async def send_morning_notification(context: ContextTypes.DEFAULT_TYPE) -> None:
    if not CHAT_ID:
        logger.warning("TELEGRAM_CHAT_ID not set")
        return

    db = get_db()
    try:
        # First ask about previous unfinished task
        prev_task = get_previous_incomplete_task(db)
        if prev_task:
            keyboard = [
                [
                    InlineKeyboardButton("✅ Yes, done!", callback_data=f"done_{prev_task.id}"),
                    InlineKeyboardButton("❌ Not yet", callback_data=f"skip_{prev_task.id}"),
                ]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)
            await context.bot.send_message(
                chat_id=CHAT_ID,
                text=f"🌅 Good morning!\n\nDid you finish this task?\n\n{format_task(prev_task)}",
                reply_markup=reply_markup,
                parse_mode="Markdown"
            )

        # Then show today's tasks
        todays_tasks = get_todays_tasks(db)
        if todays_tasks:
            text = "📋 *Today's tasks:*\n\n"
            for t in todays_tasks:
                text += f"• {format_task(t)}\n"
            await context.bot.send_message(
                chat_id=CHAT_ID,
                text=text,
                parse_mode="Markdown"
            )
        elif not prev_task:
            await context.bot.send_message(
                chat_id=CHAT_ID,
                text="✅ Good morning! No tasks for today!"
            )
    finally:
        db.close()


async def send_evening_notification(context: ContextTypes.DEFAULT_TYPE) -> None:
    if not CHAT_ID:
        return

    db = get_db()
    try:
        tasks = get_todays_tasks(db)
        if not tasks:
            await context.bot.send_message(
                chat_id=CHAT_ID,
                text="🌙 Good evening! All tasks completed today! 🎉"
            )
            return

        text = f"🌙 Evening check-in! You have *{len(tasks)}* unfinished tasks:\n\n"
        for t in tasks:
            text += f"• {format_task(t)}\n"

        first_task = tasks[0]
        keyboard = [
            [
                InlineKeyboardButton("✅ Yes, done!", callback_data=f"done_{first_task.id}"),
                InlineKeyboardButton("❌ Not yet", callback_data=f"skip_{first_task.id}"),
            ]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)
        await context.bot.send_message(
            chat_id=CHAT_ID,
            text=text + f"\nDid you finish *{first_task.name}*?",
            reply_markup=reply_markup,
            parse_mode="Markdown"
        )
    finally:
        db.close()


def main() -> None:
    app = Application.builder().token(BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("tasks", tasks_command))
    app.add_handler(CommandHandler("upcoming", upcoming_command))
    app.add_handler(CommandHandler("check", check_command))
    app.add_handler(CallbackQueryHandler(button_callback))

    # Schedule morning notification at 08:00
    app.job_queue.run_daily(
        send_morning_notification,
        time=datetime.strptime("08:00", "%H:%M").time(),
        name="morning_notification"
    )

    # Schedule evening check at 20:00
    app.job_queue.run_daily(
        send_evening_notification,
        time=datetime.strptime("20:00", "%H:%M").time(),
        name="evening_notification"
    )

    logger.info("Bot started...")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
