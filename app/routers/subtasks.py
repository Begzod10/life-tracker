from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app import models, schemas
from app.database import get_db

router = APIRouter(
    prefix="/subtasks",
    tags=["subtasks"]
)


@router.get('/', response_model=List[schemas.SubTask])
def get_subtasks(db: Session = Depends(get_db)):
    return db.query(models.SubTasks).all()


@router.get('/{subtask_id}', response_model=schemas.SubTask)
def get_subtask(subtask_id: int, db: Session = Depends(get_db)):
    subtask = db.query(models.SubTasks).filter(models.SubTasks.id == subtask_id).first()
    if not subtask:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subtask not found")
    return subtask


@router.post('/', response_model=schemas.SubTask)
def create_subtask(subtask: schemas.SubTaskCreate, db: Session = Depends(get_db)):
    new_subtask = models.SubTasks(**subtask.dict())
    db.add(new_subtask)
    db.commit()
    db.refresh(new_subtask)
    return new_subtask


@router.put('/{subtask_id}', response_model=schemas.SubTask)
def update_subtask(subtask_id: int, subtask: schemas.SubTaskUpdate, db: Session = Depends(get_db)):
    db_subtask = db.query(models.SubTasks).filter(models.SubTasks.id == subtask_id).first()
    if not db_subtask:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subtask not found")
    update_data = subtask.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_subtask, key, value)
    db.commit()
    db.refresh(db_subtask)
    return db_subtask


@router.delete('/{subtask_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_subtask(subtask_id: int, db: Session = Depends(get_db)):
    db_subtask = db.query(models.SubTasks).filter(models.SubTasks.id == subtask_id).first()
    if not db_subtask:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subtask not found")
    db.delete(db_subtask)
    db.commit()
    return


@router.get('/task/{task_id}', response_model=List[schemas.SubTask])
def get_subtasks_by_task(task_id: int, db: Session = Depends(get_db)):
    return db.query(models.SubTasks).filter(models.SubTasks.task_id == task_id).all()
