from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime

from app import models, schemas
from app.database import get_db

router = APIRouter(
    prefix="/milestones",
    tags=["milestones"]
)


@router.get('/', response_model=List[schemas.Milestone])
def get_milestones(db: Session = Depends(get_db)):
    """Get all milestones"""
    return db.query(models.Milestone).all()


@router.get('/{milestone_id}', response_model=schemas.Milestone)
def get_milestone(milestone_id: int, db: Session = Depends(get_db)):
    """Get a specific milestone by ID"""
    milestone = db.query(models.Milestone).filter(models.Milestone.id == milestone_id).first()
    if not milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")
    return milestone


@router.get('/goal/{goal_id}', response_model=List[schemas.Milestone])
def get_milestones_by_goal(goal_id: int, db: Session = Depends(get_db)):
    """Get all milestones for a specific goal"""
    return db.query(models.Milestone).filter(
        models.Milestone.goal_id == goal_id
    ).order_by(models.Milestone.order_index).all()


@router.get('/person/{person_id}', response_model=List[schemas.Milestone])
def get_milestones_by_person(person_id: int, db: Session = Depends(get_db)):
    """Get all milestones for a specific person (across all their goals)"""
    return db.query(models.Milestone).join(models.Goal).filter(
        models.Goal.person_id == person_id
    ).order_by(models.Milestone.order_index).all()


@router.post('/', response_model=schemas.Milestone)
def create_milestone(milestone: schemas.MilestoneCreate, db: Session = Depends(get_db)):
    """Create a new milestone"""
    goal = db.query(models.Goal).filter(models.Goal.id == milestone.goal_id).first()
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Goal with id {milestone.goal_id} not found"
        )

    new_milestone = models.Milestone(**milestone.dict())
    db.add(new_milestone)
    db.commit()
    db.refresh(new_milestone)
    return new_milestone


@router.put('/{milestone_id}', response_model=schemas.Milestone)
def update_milestone(milestone_id: int, milestone: schemas.MilestoneUpdate, db: Session = Depends(get_db)):
    """Update a milestone"""
    db_milestone = db.query(models.Milestone).filter(models.Milestone.id == milestone_id).first()
    if not db_milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")

    update_data = milestone.dict(exclude_unset=True)

    if 'achieved' in update_data:
        if update_data['achieved'] and not db_milestone.achieved:
            update_data['achieved_at'] = datetime.utcnow()
        elif not update_data['achieved']:
            update_data['achieved_at'] = None

    for key, value in update_data.items():
        setattr(db_milestone, key, value)

    db.commit()
    db.refresh(db_milestone)
    return db_milestone


@router.delete('/{milestone_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_milestone(milestone_id: int, db: Session = Depends(get_db)):
    """Delete a milestone"""
    db_milestone = db.query(models.Milestone).filter(models.Milestone.id == milestone_id).first()
    if not db_milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")

    db.delete(db_milestone)
    db.commit()
    return


@router.post('/{milestone_id}/mark', response_model=schemas.Milestone)
def mark_milestone(milestone_id: int, db: Session = Depends(get_db)):
    """Toggle milestone achieved status"""
    db_milestone = db.query(models.Milestone).filter(models.Milestone.id == milestone_id).first()
    if not db_milestone:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Milestone not found")

    if db_milestone.achieved:
        db_milestone.achieved = False
        db_milestone.achieved_at = None
    else:
        db_milestone.achieved = True
        db_milestone.achieved_at = datetime.utcnow()

    db.commit()
    db.refresh(db_milestone)
    return db_milestone
