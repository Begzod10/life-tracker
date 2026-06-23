from datetime import date as date_type
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app import models
from app.dependencies import get_current_user, get_db

router = APIRouter(prefix="/daily-log", tags=["daily-log"])


class DailyLogIn(BaseModel):
    date: date_type
    mood: Optional[int] = Field(None, ge=1, le=10)
    energy: Optional[int] = Field(None, ge=1, le=10)
    journal: Optional[str] = None
    wins: Optional[str] = None
    challenges: Optional[str] = None
    improvements: Optional[str] = None
    intention_1: Optional[str] = None
    intention_2: Optional[str] = None
    intention_3: Optional[str] = None


class DailyLogOut(BaseModel):
    id: int
    person_id: int
    date: date_type
    mood: Optional[int] = None
    energy: Optional[int] = None
    journal: Optional[str] = None
    wins: Optional[str] = None
    challenges: Optional[str] = None
    improvements: Optional[str] = None
    intention_1: Optional[str] = None
    intention_2: Optional[str] = None
    intention_3: Optional[str] = None
    ai_reflection: Optional[str] = None
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


def _to_out(log: models.DailyLog) -> DailyLogOut:
    return DailyLogOut(
        id=log.id,
        person_id=log.person_id,
        date=log.date,
        mood=log.mood,
        energy=log.energy,
        journal=log.journal,
        wins=log.wins,
        challenges=log.challenges,
        improvements=log.improvements,
        intention_1=log.intention_1,
        intention_2=log.intention_2,
        intention_3=log.intention_3,
        ai_reflection=log.ai_reflection,
        created_at=str(log.created_at),
        updated_at=str(log.updated_at),
    )


@router.get("/", response_model=List[DailyLogOut])
def list_logs(
    limit: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    logs = (
        db.query(models.DailyLog)
        .filter(models.DailyLog.person_id == current_user.id)
        .order_by(models.DailyLog.date.desc())
        .limit(limit)
        .all()
    )
    return [_to_out(l) for l in logs]


@router.get("/{log_date}", response_model=DailyLogOut)
def get_log(
    log_date: date_type,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    log = db.query(models.DailyLog).filter(
        models.DailyLog.person_id == current_user.id,
        models.DailyLog.date == log_date,
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="No log for this date")
    return _to_out(log)


@router.put("/{log_date}", response_model=DailyLogOut)
def upsert_log(
    log_date: date_type,
    payload: DailyLogIn,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    log = db.query(models.DailyLog).filter(
        models.DailyLog.person_id == current_user.id,
        models.DailyLog.date == log_date,
    ).first()
    if log:
        for k, v in payload.model_dump(exclude={'date'}).items():
            setattr(log, k, v)
    else:
        log = models.DailyLog(person_id=current_user.id, **payload.model_dump())
        db.add(log)
    db.commit()
    db.refresh(log)
    return _to_out(log)


@router.post("/{log_date}/analyze", response_model=DailyLogOut)
def analyze_log(
    log_date: date_type,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Generate an AI reflection for the day's log and save it."""
    log = db.query(models.DailyLog).filter(
        models.DailyLog.person_id == current_user.id,
        models.DailyLog.date == log_date,
    ).first()
    if not log:
        raise HTTPException(status_code=404, detail="No log for this date. Save your log first.")

    parts = []
    if log.mood:
        parts.append(f"Mood: {log.mood}/10, Energy: {log.energy}/10" if log.energy else f"Mood: {log.mood}/10")
    if log.journal:
        parts.append(f"Journal:\n{log.journal}")
    if log.wins:
        parts.append(f"Wins:\n{log.wins}")
    if log.challenges:
        parts.append(f"Challenges:\n{log.challenges}")
    if log.improvements:
        parts.append(f"Improvements:\n{log.improvements}")
    intentions = [i for i in [log.intention_1, log.intention_2, log.intention_3] if i]
    if intentions:
        parts.append("Tomorrow's intentions:\n" + "\n".join(f"- {i}" for i in intentions))

    if not parts:
        raise HTTPException(status_code=400, detail="Log has no content to analyze.")

    prompt = (
        f"You are a warm, insightful personal life coach. The user wrote their evening reflection for {log_date}.\n\n"
        + "\n\n".join(parts)
        + "\n\nWrite a short, personal response (3–5 sentences max). "
        "Acknowledge their day honestly, highlight one key pattern or strength you notice, "
        "and give a brief encouraging thought for tomorrow based on their intentions. "
        "Be direct and human — not generic or overly positive. No bullet points."
    )

    from app.tasks import _generate_text
    reflection = _generate_text(prompt, max_tokens=250, temperature=0.75)

    if not reflection:
        raise HTTPException(status_code=503, detail="AI service unavailable. Try again later.")

    log.ai_reflection = reflection
    db.commit()
    db.refresh(log)
    return _to_out(log)
