"""
Diagnose why the Telegram webhook is not receiving updates.

Run from /var/www/life_tracker/backend with the venv activated:

    cd /var/www/life_tracker/backend
    source venv/bin/activate
    python scripts/check_telegram.py
"""
import asyncio
import sys
from pathlib import Path

# Make `app` importable no matter which directory the script is run from
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from telegram import Bot


async def main() -> None:
    token = settings.TELEGRAM_BOT_TOKEN
    print("TOKEN tail        :", token[-8:] if token else None)
    print("WEBHOOK_BASE_URL  :", getattr(settings, "WEBHOOK_BASE_URL", None))
    print("WEBHOOK_SECRET set:", bool(getattr(settings, "TELEGRAM_WEBHOOK_SECRET", None)))

    if not token:
        print("ABORT: TELEGRAM_BOT_TOKEN is empty in .env")
        return

    bot = Bot(token)

    try:
        me = await bot.get_me()
        print("get_me OK         ->", me.username, "(id:", me.id, ")")
    except Exception as exc:
        print("get_me FAILED     :", type(exc).__name__, "-", exc)
        return

    try:
        info = await bot.get_webhook_info()
        print("---- webhook_info ----")
        print("  url                  :", info.url)
        print("  has_custom_certificate:", info.has_custom_certificate)
        print("  pending_update_count :", info.pending_update_count)
        print("  ip_address           :", info.ip_address)
        print("  last_error_date      :", info.last_error_date)
        print("  last_error_message   :", info.last_error_message)
        print("  last_synchronization_error_date:", info.last_synchronization_error_date)
        print("  max_connections      :", info.max_connections)
        print("  allowed_updates      :", info.allowed_updates)
    except Exception as exc:
        print("get_webhook_info FAILED:", type(exc).__name__, "-", exc)


if __name__ == "__main__":
    asyncio.run(main())
