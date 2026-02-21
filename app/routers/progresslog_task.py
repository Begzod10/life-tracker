from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app import models, schemas
from app.database import get_db

router = APIRouter(
    prefix="/progresslog_task",
    tags=["progresslog_task"]
)


@router.get('/task/{task_id}', response_model=List[schemas.ProgressLogBase])
def get_progress_logs_by_task(task_id: int, db: Session = Depends(get_db)):
    return db.query(models.ProgressLogTask).filter(models.ProgressLogTask.task_id == task_id).all()


@router.get('/{progress_log_task_id}', response_model=schemas.ProgressLogBase)
def get_progress_log_task(progress_log_task_id: int, db: Session = Depends(get_db)):
    progress_log_task = db.query(models.ProgressLogTask).filter(
        models.ProgressLogTask.id == progress_log_task_id).first()
    if not progress_log_task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Progress log task not found")
    return progress_log_task


@router.post('/', response_model=schemas.ProgressLogBase)
def create_progress_log_task(progress_log_task: schemas.ProgressLogTaskCreate, db: Session = Depends(get_db)):
    new_progress_log_task = models.ProgressLogTask(**progress_log_task.dict())
    db.add(new_progress_log_task)
    db.commit()
    db.refresh(new_progress_log_task)
    return new_progress_log_task


@router.put('/{progress_log_task_id}', response_model=schemas.ProgressLogBase)
def update_progress_log_task(progress_log_task_id: int, progress_log_task: schemas.ProgressLogTaskUpdate,
                             db: Session = Depends(get_db)):
    db_progress_log_task = db.query(models.ProgressLogTask).filter(
        models.ProgressLogTask.id == progress_log_task_id).first()
    if not db_progress_log_task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Progress log task not found")
    update_data = progress_log_task.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_progress_log_task, key, value)
    db.commit()
    db.refresh(db_progress_log_task)
    return db_progress_log_task


@router.delete('/{progress_log_task_id}', status_code=status.HTTP_200_OK)
def delete_progress_log_task(progress_log_task_id: int, db: Session = Depends(get_db)):
    db_progress_log_task = db.query(models.ProgressLogTask).filter(

        models.ProgressLogTask.id == progress_log_task_id).first()
    if not db_progress_log_task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Progress log task not found")
    db.delete(db_progress_log_task)
    db.commit()
    return {"message": "Progress log task deleted"}


@router.get('/task/{task_id}', response_model=List[schemas.ProgressLogBase])
def get_progress_logs_by_progress_log(task_id: int, db: Session = Depends(get_db)):
    return db.query(models.ProgressLogTask).filter(models.ProgressLogTask.task_id == task_id).all()
