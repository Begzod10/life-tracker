"""
Short-lived in-memory tokens for linking a Telegram account to a user.

Flow:
  1. Backend generates a token tied to user_id (10-min TTL).
  2. Frontend opens t.me/bot?start=TOKEN.
  3. Bot receives /start TOKEN, calls consume_token(), saves chat_id.
"""

import threading
import uuid
from datetime import datetime, timedelta

_store: dict[str, tuple[int, datetime]] = {}
_lock = threading.Lock()

TTL_MINUTES = 10


def create_token(user_id: int) -> str:
    token = uuid.uuid4().hex
    expires_at = datetime.utcnow() + timedelta(minutes=TTL_MINUTES)
    with _lock:
        _store[token] = (user_id, expires_at)
    return token


def consume_token(token: str) -> int | None:
    """Return user_id if token is valid and unused; None otherwise."""
    with _lock:
        entry = _store.pop(token, None)
    if not entry:
        return None
    user_id, expires_at = entry
    if datetime.utcnow() > expires_at:
        return None
    return user_id
