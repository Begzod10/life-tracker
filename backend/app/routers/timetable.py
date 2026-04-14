from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date

from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(prefix="/timetable", tags=["timetable"])


@router.get("/", response_model=List[schemas.TimeBlock])
def get_time_blocks(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Get time blocks for current user, optionally filtered by date range."""
    q = db.query(models.TimeBlock).filter(
        models.TimeBlock.person_id == current_user.id,
        models.TimeBlock.deleted == False,
    )
    if date_from:
        q = q.filter(models.TimeBlock.date >= date_from)
    if date_to:
        q = q.filter(models.TimeBlock.date <= date_to)
    return q.order_by(models.TimeBlock.date, models.TimeBlock.start_time).all()


@router.get("/day/{day}", response_model=List[schemas.TimeBlock])
def get_time_blocks_by_day(
    day: date,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Get all time blocks for a specific day."""
    return (
        db.query(models.TimeBlock)
        .filter(
            models.TimeBlock.person_id == current_user.id,
            models.TimeBlock.date == day,
            models.TimeBlock.deleted == False,
        )
        .order_by(models.TimeBlock.start_time)
        .all()
    )


@router.post("/", response_model=schemas.TimeBlock, status_code=status.HTTP_201_CREATED)
def create_time_block(
    block: schemas.TimeBlockCreate,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Create a new time block."""
    if block.start_time >= block.end_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_time must be before end_time",
        )
    new_block = models.TimeBlock(**block.model_dump(by_alias=True), person_id=current_user.id)
    db.add(new_block)
    db.commit()
    db.refresh(new_block)
    return new_block


@router.put("/{block_id}", response_model=schemas.TimeBlock)
def update_time_block(
    block_id: int,
    block: schemas.TimeBlockUpdate,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Update a time block."""
    db_block = db.query(models.TimeBlock).filter(
        models.TimeBlock.id == block_id,
        models.TimeBlock.person_id == current_user.id,
        models.TimeBlock.deleted == False,
    ).first()
    if not db_block:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time block not found")

    update_data = block.model_dump(exclude_unset=True, by_alias=True)
    start = update_data.get("start_time", db_block.start_time)
    end = update_data.get("end_time", db_block.end_time)
    if start >= end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_time must be before end_time",
        )
    for key, value in update_data.items():
        setattr(db_block, key, value)
    db.commit()
    db.refresh(db_block)
    return db_block


@router.delete("/{block_id}", status_code=status.HTTP_200_OK)
def delete_time_block(
    block_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Soft-delete a time block."""
    db_block = db.query(models.TimeBlock).filter(
        models.TimeBlock.id == block_id,
        models.TimeBlock.person_id == current_user.id,
        models.TimeBlock.deleted == False,
    ).first()
    if not db_block:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time block not found")
    db_block.deleted = True
    db.commit()
    return {"message": "Time block deleted"}


@router.patch("/{block_id}/toggle", response_model=schemas.TimeBlock)
def toggle_time_block(
    block_id: int,
    db: Session = Depends(get_db),
    current_user: models.Person = Depends(get_current_user),
):
    """Toggle completion status of a time block."""
    db_block = db.query(models.TimeBlock).filter(
        models.TimeBlock.id == block_id,
        models.TimeBlock.person_id == current_user.id,
        models.TimeBlock.deleted == False,
    ).first()
    if not db_block:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Time block not found")
    db_block.is_completed = not db_block.is_completed
    db.commit()
    db.refresh(db_block)
    return db_block
