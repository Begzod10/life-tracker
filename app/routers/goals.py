from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app import models, schemas
from app.database import get_db

router = APIRouter(
    prefix="/goals",
    tags=["goals"]
)


@router.post('/', response_model=schemas.Goal, status_code=status.HTTP_201_CREATED)
def create_goal(goal: schemas.GoalCreate, db: Session = Depends(get_db)):
    new_goal = models.Goal(**goal.dict())
    db.add(new_goal)
    db.commit()
    db.refresh(new_goal)
    return new_goal


@router.get('/', response_model=List[schemas.Goal])
def get_goals(db: Session = Depends(get_db)):
    return db.query(models.Goal).all()


@router.get('/{goal_id}', response_model=schemas.Goal)
def get_goal(goal_id: int, db: Session = Depends(get_db)):
    goal = db.query(models.Goal).filter(models.Goal.id == goal_id).first()
    if not goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    return goal


@router.put('/{goal_id}', response_model=schemas.Goal)
def update_goal(goal_id: int, goal: schemas.GoalUpdate, db: Session = Depends(get_db)):
    db_goal = db.query(models.Goal).filter(models.Goal.id == goal_id).first()
    if not db_goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    update_data = goal.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_goal, key, value)
    db.commit()
    db.refresh(db_goal)
    return db_goal


@router.delete('/{goal_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(goal_id: int, db: Session = Depends(get_db)):
    db_goal = db.query(models.Goal).filter(models.Goal.id == goal_id).first()
    if not db_goal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found")
    db.delete(db_goal)
    db.commit()
    return
