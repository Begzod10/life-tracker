from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(
    prefix="/jobs",
    tags=["jobs"]
)


@router.post('/', response_model=schemas.Job, status_code=status.HTTP_201_CREATED)
def create_job(
        job: schemas.JobCreate,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Create a new job for the current user"""
    # Verify the job belongs to the current user
    if job.person_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only create jobs for yourself"
        )

    new_job = models.Job(**job.model_dump())
    db.add(new_job)
    db.commit()
    db.refresh(new_job)
    return new_job


@router.get('/', response_model=List[schemas.Job])
def get_jobs(
        active_only: bool = Query(False, description="Filter only active jobs"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get all jobs for the current user"""
    query = db.query(models.Job).filter(models.Job.person_id == current_user.id)

    if active_only:
        query = query.filter(models.Job.active == True)

    return query.order_by(models.Job.start_date.desc()).all()


@router.get('/active', response_model=List[schemas.Job])
def get_active_jobs(
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get only active jobs for the current user"""
    return db.query(models.Job).filter(
        models.Job.person_id == current_user.id,
        models.Job.active == True
    ).order_by(models.Job.start_date.desc()).all()


@router.get('/{job_id}', response_model=schemas.Job)
def get_job(
        job_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get a specific job by ID"""
    job = db.query(models.Job).filter(
        models.Job.id == job_id,
        models.Job.person_id == current_user.id
    ).first()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )
    return job


@router.put('/{job_id}', response_model=schemas.Job)
def update_job(
        job_id: int,
        job: schemas.JobUpdate,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Update a job"""
    db_job = db.query(models.Job).filter(
        models.Job.id == job_id,
        models.Job.person_id == current_user.id
    ).first()

    if not db_job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )

    update_data = job.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_job, key, value)

    db.commit()
    db.refresh(db_job)
    return db_job


@router.delete('/{job_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
        job_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Delete a job"""
    db_job = db.query(models.Job).filter(
        models.Job.id == job_id,
        models.Job.person_id == current_user.id
    ).first()

    if not db_job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )

    db.delete(db_job)
    db.commit()
    return


@router.get('/{job_id}/salary-months', response_model=List[schemas.SalaryMonth])
def get_job_salary_months(
        job_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get all salary months for a specific job"""
    # Verify job ownership
    job = db.query(models.Job).filter(
        models.Job.id == job_id,
        models.Job.person_id == current_user.id
    ).first()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )

    return db.query(models.SalaryMonth).filter(
        models.SalaryMonth.job_id == job_id
    ).order_by(models.SalaryMonth.month.desc()).all()


@router.post('/{job_id}/deactivate', response_model=schemas.Job)
def deactivate_job(
        job_id: int,
        end_date: Optional[str] = Query(None, description="End date in YYYY-MM-DD format"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Mark a job as inactive (ended)"""
    db_job = db.query(models.Job).filter(
        models.Job.id == job_id,
        models.Job.person_id == current_user.id
    ).first()

    if not db_job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )

    db_job.active = False
    if end_date:
        from datetime import datetime
        db_job.end_date = datetime.strptime(end_date, "%Y-%m-%d").date()

    db.commit()
    db.refresh(db_job)
    return db_job