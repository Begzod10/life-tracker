"""
Telegram notification helper.

Uses the Telegram Bot API directly via `requests` (no async required).
Called from Celery tasks — keeps the interface synchronous and simple.
"""
import logging
from typing import Optional

import requests

from app.config import settings

logger = logging.getLogger(__name__)

TELEGRAM_API = "https://api.telegram.org/bot{token}/{method}"


def _token() -> Optional[str]:
    return settings.TELEGRAM_BOT_TOKEN


def send_message(
    text: str,
    chat_id: Optional[str] = None,
    parse_mode: str = "HTML",
    disable_notification: bool = False,
    reply_markup: Optional[dict] = None,
) -> bool:
    """
    Send a message to a Telegram chat.

    Args:
        text: Message text. Supports HTML formatting.
        chat_id: Target chat ID. Falls back to settings.TELEGRAM_CHAT_ID.
        parse_mode: "HTML" or "Markdown".
        disable_notification: Send silently.

    Returns:
        True if the message was sent successfully, False otherwise.
    """
    token = _token()
    if not token:
        logger.warning("TELEGRAM_BOT_TOKEN not configured — skipping notification")
        return False

    target_chat = chat_id or settings.TELEGRAM_CHAT_ID
    if not target_chat:
        logger.warning("No chat_id available — skipping notification")
        return False

    url = TELEGRAM_API.format(token=token, method="sendMessage")
    payload = {
        "chat_id": target_chat,
        "text": text,
        "parse_mode": parse_mode,
        "disable_notification": disable_notification,
    }
    if reply_markup:
        payload["reply_markup"] = reply_markup

    try:
        resp = requests.post(url, json=payload, timeout=10)
        resp.raise_for_status()
        return True
    except requests.RequestException as exc:
        logger.error("Failed to send Telegram message: %s", exc)
        return False


def is_configured() -> bool:
    """Return True if the bot token is set (safe to call send_message)."""
    return bool(_token())
