from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from sqlalchemy import func

from app import models, schemas
from app.database import get_db

router = APIRouter(
    prefix="/subtasks",
    tags=["subtasks"]
)


def _reorder_subtasks(task_id: int, db: Session):
    """Recalculate order for all active subtasks of a task"""
    subtasks = (
        db.query(models.SubTasks)
        .filter(models.SubTasks.task_id == task_id, models.SubTasks.deleted == False)
        .order_by(models.SubTasks.order)
        .all()
    )
    for i, subtask in enumerate(subtasks):
        subtask.order = i
    db.commit()


@router.get('/', response_model=List[schemas.SubTask])
def get_subtasks(db: Session = Depends(get_db)):
    return db.query(models.SubTasks).filter(models.SubTasks.deleted == False).all()


@router.get('/deleted/task/{task_id}', response_model=List[schemas.SubTask])
def get_deleted_subtasks(task_id: int, db: Session = Depends(get_db)):
    """Get all soft-deleted subtasks for a specific task"""
    return db.query(models.SubTasks).filter(models.SubTasks.task_id == task_id, models.SubTasks.deleted == True).all()


@router.get('/{subtask_id}', response_model=schemas.SubTask)
def get_subtask(subtask_id: int, db: Session = Depends(get_db)):
    subtask = db.query(models.SubTasks).filter(models.SubTasks.id == subtask_id).first()
    if not subtask:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subtask not found")
    return subtask


@router.post('/', response_model=schemas.SubTask)
def create_subtask(subtask: schemas.SubTaskCreate, db: Session = Depends(get_db)):
    max_order = db.query(func.max(models.SubTasks.order)).filter(
        models.SubTasks.task_id == subtask.task_id,
        models.SubTasks.deleted == False
    ).scalar()
    new_subtask = models.SubTasks(**subtask.dict())
    new_subtask.order = (max_order + 1) if max_order is not None else 0
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
    task_id = db_subtask.task_id
    db_subtask.deleted = True
    db.commit()
    _reorder_subtasks(task_id, db)
    return


@router.get('/person/{person_id}', response_model=List[schemas.SubTask])
def get_subtasks_by_person(person_id: int, db: Session = Depends(get_db)):
    """Get all subtasks for a specific person (across all their goals and tasks)"""
    return db.query(models.SubTasks).join(models.Task).join(models.Goal).filter(
        models.Goal.person_id == person_id,
        models.SubTasks.deleted == False
    ).all()


@router.get('/task/{task_id}', response_model=List[schemas.SubTask])
def get_subtasks_by_task(task_id: int, db: Session = Depends(get_db)):
    return db.query(models.SubTasks).filter(models.SubTasks.task_id == task_id, models.SubTasks.deleted == False).all()


@router.post('/{subtask_id}/mark_subtask', response_model=schemas.SubTask)
def mark_subtask(subtask_id: int, db: Session = Depends(get_db)):
    db_subtask = db.query(models.SubTasks).filter(models.SubTasks.id == subtask_id).first()
    if not db_subtask:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subtask not found")

    if db_subtask.completed:
        db_subtask.completed = False
        db_subtask.completed_at = None
    else:
        db_subtask.completed = True
        db_subtask.completed_at = datetime.utcnow()
    db.commit()
    db.refresh(db_subtask)
    return db_subtask
