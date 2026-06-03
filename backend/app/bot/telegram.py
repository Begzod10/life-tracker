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

    proxies = None
    if settings.TELEGRAM_PROXY_URL:
        proxies = {"http": settings.TELEGRAM_PROXY_URL, "https": settings.TELEGRAM_PROXY_URL}

    # Disable trust_env so the server's HTTP_PROXY/HTTPS_PROXY env vars do not
    # silently route this request through a broken corporate proxy (407 errors).
    session = requests.Session()
    session.trust_env = False
    try:
        resp = session.post(url, json=payload, timeout=15, proxies=proxies)
        resp.raise_for_status()
        return True
    except requests.RequestException as exc:
        logger.error("Failed to send Telegram message: %s", exc)
        return False
    finally:
        session.close()


def is_configured() -> bool:
    """Return True if the bot token is set (safe to call send_message)."""
    return bool(_token())


def send_photo(
    image_bytes: bytes,
    chat_id: Optional[str] = None,
    caption: Optional[str] = None,
    parse_mode: str = "HTML",
    filename: str = "card.png",
    disable_notification: bool = False,
) -> bool:
    """Send an in-memory PNG to a Telegram chat as a photo.

    Mirrors send_message's contract: returns True on success, False (with a
    warning logged) on any non-2xx response or transport failure. Used by the
    weekly wrapped card so a Pillow render failure or Telegram outage never
    propagates into a Celery retry storm.
    """
    token = _token()
    if not token:
        logger.warning("TELEGRAM_BOT_TOKEN not configured — skipping photo send")
        return False

    target_chat = chat_id or settings.TELEGRAM_CHAT_ID
    if not target_chat:
        logger.warning("No chat_id available — skipping photo send")
        return False

    url = TELEGRAM_API.format(token=token, method="sendPhoto")
    data = {
        "chat_id": str(target_chat),
        "disable_notification": str(disable_notification).lower(),
    }
    if caption:
        # Telegram caps captions at 1024 chars; clamp defensively so a
        # too-long caption never aborts the whole send.
        data["caption"] = caption[:1024]
        data["parse_mode"] = parse_mode

    files = {"photo": (filename, image_bytes, "image/png")}

    proxies = None
    if settings.TELEGRAM_PROXY_URL:
        proxies = {"http": settings.TELEGRAM_PROXY_URL, "https": settings.TELEGRAM_PROXY_URL}

    session = requests.Session()
    session.trust_env = False
    try:
        resp = session.post(url, data=data, files=files, timeout=30, proxies=proxies)
        resp.raise_for_status()
        return True
    except requests.RequestException as exc:
        logger.error("Failed to send Telegram photo: %s", exc)
        return False
    finally:
        session.close()
