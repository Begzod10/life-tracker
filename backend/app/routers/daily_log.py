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
