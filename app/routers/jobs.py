from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, date

from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user
from app.services.job_service import JobService

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

    # Auto-generate a SalaryMonth record for every month the job covers
    JobService.generate_salary_months(new_job, db)

    return new_job


@router.get('/', response_model=List[schemas.Job])
def get_jobs(
        active_only: bool = Query(False, description="Filter only active jobs"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get all jobs for the current user"""
    query = db.query(models.Job).filter(
        models.Job.person_id == current_user.id,
        models.Job.deleted == False
    )

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
        models.Job.active == True,
        models.Job.deleted == False
    ).order_by(models.Job.start_date.desc()).all()


@router.get('/by-person/{person_id}', response_model=List[schemas.Job])
def get_jobs_by_person(
        person_id: int,
        active_only: bool = Query(False, description="Filter only active jobs"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get all jobs for a specific person"""
    if person_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view jobs for yourself"
        )

    query = db.query(models.Job).filter(
        models.Job.person_id == person_id,
        models.Job.deleted == False
    )

    if active_only:
        query = query.filter(models.Job.active == True)

    return query.order_by(models.Job.start_date.desc()).all()


@router.get('/deleted/by-person/{person_id}', response_model=List[schemas.Job])
def get_deleted_jobs_by_person(
        person_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get all soft-deleted jobs for a specific person"""
    if person_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view jobs for yourself"
        )

    return db.query(models.Job).filter(
        models.Job.person_id == person_id,
        models.Job.deleted == True
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
        models.Job.person_id == current_user.id,
        models.Job.deleted == False
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
        models.Job.person_id == current_user.id,
        models.Job.deleted == False
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


@router.delete('/{job_id}', status_code=status.HTTP_200_OK)
def delete_job(
        job_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Soft-delete a job"""
    db_job = db.query(models.Job).filter(
        models.Job.id == job_id,
        models.Job.person_id == current_user.id,
        models.Job.deleted == False
    ).first()

    if not db_job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )

    db_job.deleted = True if db_job.deleted == False else False
    db.commit()
    return {"message": "Job deleted"}


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
        models.Job.person_id == current_user.id,
        models.Job.deleted == False
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
        models.Job.person_id == current_user.id,
        models.Job.deleted == False
    ).first()

    if not db_job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )

    db_job.active = True if db_job.active == False else False

    if end_date:
        db_job.end_date = datetime.strptime(end_date, "%Y-%m-%d").date()

    db.commit()
    db.refresh(db_job)
    return db_job


@router.post('/{job_id}/generate-salary-months', response_model=schemas.SalaryMonthGenerateResponse,
             status_code=status.HTTP_201_CREATED)
def generate_salary_months(
        job_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Re-run salary month generation for an existing job.

    Delegates to JobService.generate_salary_months — the same function
    that runs automatically when a job is created.
    Already-existing months are skipped without error.
    """
    job = db.query(models.Job).filter(
        models.Job.id == job_id,
        models.Job.person_id == current_user.id,
        models.Job.deleted == False
    ).first()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found"
        )

    created, skipped = JobService.generate_salary_months(job, db)

    return schemas.SalaryMonthGenerateResponse(
        created_count=len(created),
        skipped_count=len(skipped),
        created=created,
        skipped_months=skipped,
    )
