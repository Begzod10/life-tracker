from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
from datetime import datetime

from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(
    prefix="/salary-months",
    tags=["salary-months"]
)


@router.post('/', response_model=schemas.SalaryMonth, status_code=status.HTTP_201_CREATED)
def create_salary_month(
        salary_month: schemas.SalaryMonthCreate,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Create a new salary month record"""
    # Verify the job belongs to the current user
    job = db.query(models.Job).filter(
        models.Job.id == salary_month.job_id,
        models.Job.person_id == current_user.id
    ).first()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found or doesn't belong to you"
        )

    # Check if salary month already exists for this job and month
    existing = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.job_id == salary_month.job_id,
        models.SalaryMonth.month == salary_month.month
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Salary month already exists for {salary_month.month}"
        )

    new_salary_month = models.SalaryMonth(**salary_month.model_dump())
    new_salary_month.person_id = current_user.id
    new_salary_month.remaining_amount = new_salary_month.net_amount

    db.add(new_salary_month)
    db.commit()
    db.refresh(new_salary_month)
    return new_salary_month


@router.get('/', response_model=List[schemas.SalaryMonthWithJob])
def get_salary_months(
        year: Optional[int] = Query(None, description="Filter by year"),
        month: Optional[int] = Query(None, ge=1, le=12, description="Filter by month (1-12)"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get all salary months for current user's jobs"""
    query = db.query(models.SalaryMonth).options(
        joinedload(models.SalaryMonth.job)
    ).filter(
        models.SalaryMonth.person_id == current_user.id
    )

    # Apply filters
    if year and month:
        period = f"{year}-{month:02d}"
        query = query.filter(models.SalaryMonth.month == period)
    elif year:
        query = query.filter(models.SalaryMonth.month.like(f"{year}-%"))

    salary_months = query.order_by(models.SalaryMonth.month.desc()).all()

    result = []
    for sm in salary_months:
        data = schemas.SalaryMonthWithJob.model_validate(sm)
        data = data.model_copy(update={
            'job_name': sm.job.name if sm.job else None,
            'company': sm.job.company if sm.job else None,
        })
        result.append(data)
    return result


@router.get('/current', response_model=schemas.SalaryMonth)
def get_current_month_salary(
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get salary for current month"""
    from datetime import date
    current_month = date.today().strftime("%Y-%m")

    salary = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.person_id == current_user.id,
        models.SalaryMonth.month == current_month
    ).first()

    if not salary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No salary record found for current month"
        )

    return salary


@router.get('/by-job/{job_id}', response_model=List[schemas.SalaryMonth])
def get_salary_months_by_job(
        job_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get all salary months for a specific job"""
    job = db.query(models.Job).filter(
        models.Job.id == job_id,
        models.Job.person_id == current_user.id
    ).first()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found or doesn't belong to you"
        )

    return db.query(models.SalaryMonth).filter(
        models.SalaryMonth.job_id == job_id
    ).order_by(models.SalaryMonth.month.desc()).all()


@router.get('/by-job/{job_id}/{month}', response_model=schemas.SalaryMonth)
def get_salary_month_by_job_and_month(
        job_id: int,
        month: str,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get salary month by job ID and month (format: YYYY-MM)"""
    job = db.query(models.Job).filter(
        models.Job.id == job_id,
        models.Job.person_id == current_user.id
    ).first()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found or doesn't belong to you"
        )

    salary_month = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.job_id == job_id,
        models.SalaryMonth.month == month
    ).first()

    if not salary_month:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No salary record found for job {job_id} in {month}"
        )

    return salary_month


@router.put('/by-job/{job_id}/{month}', response_model=schemas.SalaryMonth)
def update_salary_month_by_job_and_month(
        job_id: int,
        month: str,
        salary_month: schemas.SalaryMonthUpdate,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Update salary month by job ID and month (format: YYYY-MM)"""
    job = db.query(models.Job).filter(
        models.Job.id == job_id,
        models.Job.person_id == current_user.id
    ).first()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found or doesn't belong to you"
        )

    db_salary_month = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.job_id == job_id,
        models.SalaryMonth.month == month
    ).first()

    if not db_salary_month:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No salary record found for job {job_id} in {month}"
        )

    update_data = salary_month.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_salary_month, key, value)

    db.commit()
    db.refresh(db_salary_month)
    return db_salary_month


@router.delete('/by-job/{job_id}/{month}', status_code=status.HTTP_200_OK)
def delete_salary_month_by_job_and_month(
        job_id: int,
        month: str,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Delete salary month by job ID and month (format: YYYY-MM)"""
    job = db.query(models.Job).filter(
        models.Job.id == job_id,
        models.Job.person_id == current_user.id
    ).first()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found or doesn't belong to you"
        )

    db_salary_month = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.job_id == job_id,
        models.SalaryMonth.month == month
    ).first()

    if not db_salary_month:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No salary record found for job {job_id} in {month}"
        )

    db.delete(db_salary_month)
    db.commit()
    return {"message": "Salary month deleted"}


@router.get('/{salary_month_id}', response_model=schemas.SalaryMonth)
def get_salary_month(
        salary_month_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get a specific salary month by ID"""
    salary_month = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.id == salary_month_id,
        models.SalaryMonth.person_id == current_user.id
    ).first()

    if not salary_month:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Salary month not found"
        )

    return salary_month


@router.put('/{salary_month_id}', response_model=schemas.SalaryMonth)
def update_salary_month(
        salary_month_id: int,
        salary_month: schemas.SalaryMonthUpdate,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Update a salary month"""
    db_salary_month = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.id == salary_month_id,
        models.SalaryMonth.person_id == current_user.id
    ).first()

    if not db_salary_month:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Salary month not found"
        )

    update_data = salary_month.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_salary_month, key, value)

    db.commit()
    db.refresh(db_salary_month)
    return db_salary_month


@router.delete('/{salary_month_id}', status_code=status.HTTP_200_OK)
def delete_salary_month(
        salary_month_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Delete a salary month"""
    db_salary_month = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.id == salary_month_id,
        models.SalaryMonth.person_id == current_user.id
    ).first()

    if not db_salary_month:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Salary month not found"
        )

    db.delete(db_salary_month)
    db.commit()
    return {"message": "Salary month deleted"}


@router.get('/{salary_month_id}/expenses', response_model=List[schemas.Expense])
def get_salary_month_expenses(
        salary_month_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get all expenses linked to a salary month"""
    salary_month = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.id == salary_month_id,
        models.SalaryMonth.person_id == current_user.id
    ).first()

    if not salary_month:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Salary month not found"
        )

    return db.query(models.Expense).filter(
        models.Expense.salary_month_id == salary_month_id
    ).order_by(models.Expense.date.desc()).all()


@router.post('/{salary_month_id}/recalculate', response_model=schemas.SalaryMonth)
def recalculate_salary_month(
        salary_month_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Recalculate total_spent and remaining_amount for a salary month"""
    salary_month = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.id == salary_month_id,
        models.SalaryMonth.person_id == current_user.id
    ).first()

    if not salary_month:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Salary month not found"
        )

    # Calculate total spent from expenses
    expenses = db.query(models.Expense).filter(
        models.Expense.salary_month_id == salary_month_id
    ).all()

    total_spent = sum(expense.amount for expense in expenses)

    salary_month.total_spent = total_spent
    salary_month.remaining_amount = salary_month.net_amount - total_spent

    db.commit()
    db.refresh(salary_month)
    return salary_month
