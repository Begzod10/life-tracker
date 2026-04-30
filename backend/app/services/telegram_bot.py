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
from telegram.request import HTTPXRequest
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Task, TimeBlock, Person
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
                        f"/today — today's timetable blocks\n"
                        f"/check — overdue tasks\n"
                        f"/upcoming — upcoming schedule\n"
                        f"/summary — daily summary",
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
        f"👋 <b>Life Tracker Bot ready!</b>\n\n"
        f"Your Chat ID: <code>{chat_id}</code>\n\n"
        f"/tasks — today's tasks\n"
        f"/today — today's timetable blocks\n"
        f"/check — check overdue tasks\n"
        f"/upcoming — upcoming schedule\n"
        f"/summary — daily summary",
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
    chat_id = str(update.effective_chat.id)
    db = get_db()
    try:
        person = db.query(Person).filter(Person.telegram_chat_id == chat_id).first()
        if not person:
            await update.message.reply_text("❌ Account not linked. Use /start to connect.")
            return

        tomorrow = date.today() + timedelta(days=1)
        future = date.today() + timedelta(days=4)

        blocks = (
            db.query(TimeBlock)
            .filter(
                TimeBlock.person_id == person.id,
                TimeBlock.deleted == False,
                TimeBlock.date >= tomorrow,
                TimeBlock.date <= future,
            )
            .order_by(TimeBlock.date.asc(), TimeBlock.start_time.asc())
            .all()
        )

        if not blocks:
            await update.message.reply_text("📭 No upcoming blocks in the next 3 days!")
            return

        # Group by date
        from collections import defaultdict
        by_day: dict = defaultdict(list)
        for b in blocks:
            by_day[b.date].append(b)

        cat_emoji = {
            "work": "💼", "personal": "🧍", "health": "💪",
            "learning": "📚", "social": "👥", "other": "📌",
        }

        lines = ["🗓 *Upcoming Schedule:*\n"]
        for day in sorted(by_day):
            day_label = day.strftime("%A, %b %d")
            lines.append(f"*{day_label}*")
            for b in by_day[day]:
                emoji = cat_emoji.get(b.category, "📌")
                status = "✅" if b.is_completed else emoji
                dur = (
                    (int(b.end_time[:2]) * 60 + int(b.end_time[3:]))
                    - (int(b.start_time[:2]) * 60 + int(b.start_time[3:]))
                )
                lines.append(f"  {status} {b.start_time}–{b.end_time} ({dur}m) {b.title}")
            lines.append("")

        await update.message.reply_text("\n".join(lines).strip(), parse_mode="Markdown")
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


async def today_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Show today's timetable blocks with completion status."""
    chat_id = str(update.effective_chat.id)
    db = get_db()
    try:
        person = db.query(Person).filter(Person.telegram_chat_id == chat_id).first()
        if not person:
            await update.message.reply_text("❌ Account not linked. Use /start to connect.")
            return

        today = date.today()
        blocks = (
            db.query(TimeBlock)
            .filter(
                TimeBlock.person_id == person.id,
                TimeBlock.date == today,
                TimeBlock.deleted == False,
            )
            .order_by(TimeBlock.start_time.asc())
            .all()
        )

        if not blocks:
            await update.message.reply_text("📭 No blocks scheduled for today!")
            return

        cat_emoji = {
            "work": "💼", "personal": "🧍", "health": "💪",
            "learning": "📚", "social": "👥", "other": "📌",
        }
        done = sum(1 for b in blocks if b.is_completed)
        lines = [f"🗓 *Today's Schedule ({done}/{len(blocks)} done):*\n"]
        for b in blocks:
            if b.is_completed:
                icon = "✅"
            elif b.is_missed:
                icon = "❌"
            else:
                icon = cat_emoji.get(b.category, "📌")
            lines.append(f"{icon} {b.start_time}–{b.end_time}  {b.title}")

        await update.message.reply_text("\n".join(lines), parse_mode="Markdown")
    finally:
        db.close()


async def summary_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Trigger the daily summary for this user right now."""
    from app.tasks import send_daily_summary
    send_daily_summary.delay()
    await update.message.reply_text("📋 Sending your daily summary…")


async def focus_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Show the current active timetable block and its linked task."""
    chat_id = str(update.effective_chat.id)
    db = get_db()
    try:
        person = db.query(Person).filter(Person.telegram_chat_id == chat_id).first()
        if not person:
            await update.message.reply_text("❌ Account not linked. Use /start to connect.")
            return

        now_tashkent = datetime.utcnow() + timedelta(hours=5)
        today = now_tashkent.date()
        now_str = now_tashkent.strftime("%H:%M")

        # Find block active right now
        blocks = (
            db.query(TimeBlock)
            .filter(
                TimeBlock.person_id == person.id,
                TimeBlock.date == today,
                TimeBlock.deleted == False,
                TimeBlock.is_completed == False,
                TimeBlock.start_time <= now_str,
                TimeBlock.end_time > now_str,
            )
            .all()
        )

        if not blocks:
            # Find next upcoming block today
            next_block = (
                db.query(TimeBlock)
                .filter(
                    TimeBlock.person_id == person.id,
                    TimeBlock.date == today,
                    TimeBlock.deleted == False,
                    TimeBlock.is_completed == False,
                    TimeBlock.start_time > now_str,
                )
                .order_by(TimeBlock.start_time.asc())
                .first()
            )
            if next_block:
                await update.message.reply_text(
                    f"⏳ No active block right now.\n\n"
                    f"📌 *Next:* {next_block.title}\n"
                    f"🕐 {next_block.start_time}–{next_block.end_time}",
                    parse_mode="Markdown",
                )
            else:
                await update.message.reply_text("✅ No more blocks scheduled for today!")
            return

        block = blocks[0]
        # Calculate time remaining
        eh, em = block.end_time.split(":")
        nh, nm = now_str.split(":")
        remaining = (int(eh) * 60 + int(em)) - (int(nh) * 60 + int(nm))

        lines = [
            f"🎯 *Current block:* {block.title}",
            f"🕐 {block.start_time}–{block.end_time} ({remaining}m remaining)",
        ]
        if block.task:
            lines.append(f"📋 *Linked task:* {block.task.name}")

        lines += ["", "How's it going?"]

        await update.message.reply_text(
            "\n".join(lines),
            parse_mode="Markdown",
            reply_markup=InlineKeyboardMarkup([[
                InlineKeyboardButton("✅ Done early!", callback_data=f"block_done_{block.id}"),
                InlineKeyboardButton("🔄 Still going", callback_data=f"block_focus_{block.id}"),
            ]]),
        )
    finally:
        db.close()


async def button_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    from telegram.error import TimedOut as TelegramTimedOut
    query = update.callback_query
    try:
        await query.answer()
    except TelegramTimedOut:
        logger.warning("query.answer() timed out for callback %s — continuing", query.data)
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

        elif data.startswith("block_done_"):
            block_id = int(data.split("_")[2])
            block = db.query(TimeBlock).filter(TimeBlock.id == block_id).first()
            if block:
                block.is_completed = True
                db.commit()
                name = block.title
            else:
                name = "block"
            await query.edit_message_text(f"✅ Marked as done: *{name}*", parse_mode="Markdown")

        elif data.startswith("block_focus_"):
            await query.edit_message_text("💪 Keep going! You've got this.", parse_mode="Markdown")

        elif data.startswith("block_skip_"):
            block_id = int(data.split("_")[2])
            block = db.query(TimeBlock).filter(TimeBlock.id == block_id).first()
            if block:
                block.is_missed = True
                db.commit()
                name = block.title
            else:
                name = "block"
            await query.edit_message_text(f"❌ Marked as missed: *{name}*", parse_mode="Markdown")

        elif data.startswith("carryover_"):
            # carryover_{original_block_id}_{YYYYMMDD}_{HHMM}
            parts = data.split("_")
            orig_block_id = int(parts[1])
            date_str = parts[2]       # e.g. 20260418
            time_str = parts[3]       # e.g. 0800

            orig = db.query(TimeBlock).filter(TimeBlock.id == orig_block_id).first()
            if orig:
                target_date = date(int(date_str[:4]), int(date_str[4:6]), int(date_str[6:8]))
                start_h = int(time_str[:2])
                start_m = int(time_str[2:4])
                dur = 30
                if orig.start_time and orig.end_time:
                    try:
                        sh, sm = map(int, orig.start_time.split(":"))
                        eh, em = map(int, orig.end_time.split(":"))
                        dur = (eh * 60 + em) - (sh * 60 + sm)
                    except Exception:
                        pass
                end_total = start_h * 60 + start_m + dur
                start = f"{start_h:02d}:{start_m:02d}"
                end = f"{end_total // 60:02d}:{end_total % 60:02d}"

                new_block = TimeBlock(
                    person_id=orig.person_id,
                    title=f"↩ {orig.title.lstrip('↩ ')}",
                    date=target_date,
                    start_time=start,
                    end_time=end,
                    category=orig.category or "work",
                    task_id=orig.task_id,
                    is_recurring=False,
                )
                db.add(new_block)
                db.commit()
                title = orig.title.lstrip("↩ ")
                await query.edit_message_text(
                    f"✅ Scheduled *{title}* for {target_date.strftime('%b %d')} at {start}",
                    parse_mode="Markdown",
                )
            else:
                await query.edit_message_text("Block not found.", parse_mode="Markdown")

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

        builder = (
            Application.builder()
            .token(settings.TELEGRAM_BOT_TOKEN)
            .updater(None)          # disable built-in polling updater
        )

        # Route Telegram traffic through a proxy when set (e.g. for filtered networks)
        proxy_url = settings.TELEGRAM_PROXY_URL
        if proxy_url:
            logger.info("Telegram bot using proxy: %s", proxy_url)
            builder = builder.request(
                HTTPXRequest(proxy=proxy_url, connect_timeout=30, read_timeout=30)
            ).get_updates_request(
                HTTPXRequest(proxy=proxy_url, connect_timeout=30, read_timeout=30)
            )

        self._app = builder.build()
        self._app.add_handler(CommandHandler("start", start))
        self._app.add_handler(CommandHandler("tasks", tasks_command))
        self._app.add_handler(CommandHandler("today", today_command))
        self._app.add_handler(CommandHandler("upcoming", upcoming_command))
        self._app.add_handler(CommandHandler("check", check_command))
        self._app.add_handler(CommandHandler("summary", summary_command))
        self._app.add_handler(CommandHandler("focus", focus_command))
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

        # Register command list so they appear in Telegram's "/" menu
        from telegram import BotCommand
        await self._app.bot.set_my_commands([
            BotCommand("tasks",    "Today's tasks"),
            BotCommand("today",    "Today's timetable blocks"),
            BotCommand("focus",    "Current active block + progress check"),
            BotCommand("check",    "Check overdue tasks"),
            BotCommand("upcoming", "Upcoming schedule (next 3 days)"),
            BotCommand("summary",  "Daily summary — blocks & tasks"),
        ])
        logger.info("Telegram bot commands registered")

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
