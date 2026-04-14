"""
Bot endpoints:

  POST /bot/webhook            — Telegram pushes every update here (webhook mode)
  POST /bot/trigger/morning    — manually queue morning notification (Celery)
  POST /bot/trigger/evening    — manually queue evening notification (Celery)
"""

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status

from app import models
from app.config import settings
from app.dependencies import get_current_user
from app.services.telegram_bot import bot_service

router = APIRouter(prefix="/bot", tags=["bot"])


# ---------------------------------------------------------------------------
# Telegram webhook (no auth — Telegram calls this)
# ---------------------------------------------------------------------------

@router.post("/webhook", include_in_schema=False)
async def telegram_webhook(
    request: Request,
    x_telegram_bot_api_secret_token: Optional[str] = Header(None),
):
    """Receive updates from Telegram. Validates secret token if configured."""
    if settings.TELEGRAM_WEBHOOK_SECRET:
        if x_telegram_bot_api_secret_token != settings.TELEGRAM_WEBHOOK_SECRET:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid secret token")

    data = await request.json()
    await bot_service.process_update(data)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Manual triggers (authenticated)
# ---------------------------------------------------------------------------

@router.post("/trigger/morning")
def trigger_morning(current_user: models.Person = Depends(get_current_user)):
    """Manually trigger the morning task notification right now."""
    from app.tasks import send_morning_tasks
    task = send_morning_tasks.delay()
    return {"message": "Morning notification queued", "task_id": task.id}


@router.post("/trigger/evening")
def trigger_evening(current_user: models.Person = Depends(get_current_user)):
    """Manually trigger the evening check-in notification right now."""
    from app.tasks import send_evening_checkup
    task = send_evening_checkup.delay()
    return {"message": "Evening check-in queued", "task_id": task.id}
