from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app import models, schemas
from app.database import get_db

router = APIRouter(
    prefix="/progresslog",
    tags=["progresslog"]
)


@router.post('/', response_model=schemas.ProgressLog, status_code=status.HTTP_201_CREATED)
def create_progress_log(progress_log: schemas.ProgressLogCreate, db: Session = Depends(get_db)):
    new_progress_log = models.ProgressLog(**progress_log.dict())
    db.add(new_progress_log)
    db.commit()
    db.refresh(new_progress_log)
    return new_progress_log


@router.get('/{progress_log_id}', response_model=schemas.ProgressLog)
def get_progress_log(progress_log_id: int, db: Session = Depends(get_db)):
    progress_log = db.query(models.ProgressLog).filter(models.ProgressLog.id == progress_log_id).first()
    if not progress_log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Progress log not found")
    return progress_log


@router.get('/', response_model=List[schemas.ProgressLog])
def get_progress_logs(db: Session = Depends(get_db)):
    return db.query(models.ProgressLog).all()


@router.put('/{progress_log_id}', response_model=schemas.ProgressLog)
def update_progress_log(progress_log_id: int, progress_log: schemas.ProgressLogUpdate, db: Session = Depends(get_db)):
    db_progress_log = db.query(models.ProgressLog).filter(models.ProgressLog.id == progress_log_id).first()
    if not db_progress_log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Progress log not found")
    update_data = progress_log.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_progress_log, key, value)
    db.commit()
    db.refresh(db_progress_log)
    return db_progress_log


@router.delete('/{progress_log_id}', status_code=status.HTTP_200_OK)
def delete_progress_log(progress_log_id: int, db: Session = Depends(get_db)):
    db_progress_log = db.query(models.ProgressLog).filter(models.ProgressLog.id == progress_log_id).first()
    if not db_progress_log:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Progress log not found")
    db.delete(db_progress_log)
    db.commit()
    return {"message": "Progress log deleted"}


@router.get('/goal/{goal_id}', response_model=List[schemas.ProgressLog])
def get_progress_logs_by_goal(goal_id: int, db: Session = Depends(get_db)):
    return db.query(models.ProgressLog).filter(models.ProgressLog.goal_id == goal_id).all()
