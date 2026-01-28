from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
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
    new_salary_month.remaining_amount = new_salary_month.net_amount

    db.add(new_salary_month)
    db.commit()
    db.refresh(new_salary_month)
    return new_salary_month


@router.get('/', response_model=List[schemas.SalaryMonth])
def get_salary_months(
        year: Optional[int] = Query(None, description="Filter by year"),
        month: Optional[int] = Query(None, ge=1, le=12, description="Filter by month (1-12)"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get all salary months for current user's jobs"""
    # Get all job IDs for current user
    job_ids = db.query(models.Job.id).filter(
        models.Job.person_id == current_user.id
    ).all()
    job_ids = [job_id[0] for job_id in job_ids]

    query = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.job_id.in_(job_ids)
    )

    # Apply filters
    if year and month:
        period = f"{year}-{month:02d}"
        query = query.filter(models.SalaryMonth.month == period)
    elif year:
        query = query.filter(models.SalaryMonth.month.like(f"{year}-%"))

    return query.order_by(models.SalaryMonth.month.desc()).all()


@router.get('/current', response_model=schemas.SalaryMonth)
def get_current_month_salary(
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get salary for current month"""
    from datetime import date
    current_month = date.today().strftime("%Y-%m")

    job_ids = db.query(models.Job.id).filter(
        models.Job.person_id == current_user.id
    ).all()
    job_ids = [job_id[0] for job_id in job_ids]

    salary = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.job_id.in_(job_ids),
        models.SalaryMonth.month == current_month
    ).first()

    if not salary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No salary record found for current month"
        )

    return salary


@router.get('/{salary_month_id}', response_model=schemas.SalaryMonth)
def get_salary_month(
        salary_month_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get a specific salary month by ID"""
    salary_month = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.id == salary_month_id
    ).first()

    if not salary_month:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Salary month not found"
        )

    # Verify ownership through job
    job = db.query(models.Job).filter(
        models.Job.id == salary_month.job_id,
        models.Job.person_id == current_user.id
    ).first()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
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
        models.SalaryMonth.id == salary_month_id
    ).first()

    if not db_salary_month:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Salary month not found"
        )

    # Verify ownership
    job = db.query(models.Job).filter(
        models.Job.id == db_salary_month.job_id,
        models.Job.person_id == current_user.id
    ).first()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )

    update_data = salary_month.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_salary_month, key, value)

    db.commit()
    db.refresh(db_salary_month)
    return db_salary_month


@router.delete('/{salary_month_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_salary_month(
        salary_month_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Delete a salary month"""
    db_salary_month = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.id == salary_month_id
    ).first()

    if not db_salary_month:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Salary month not found"
        )

    # Verify ownership
    job = db.query(models.Job).filter(
        models.Job.id == db_salary_month.job_id,
        models.Job.person_id == current_user.id
    ).first()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )

    db.delete(db_salary_month)
    db.commit()
    return


@router.get('/{salary_month_id}/expenses', response_model=List[schemas.Expense])
def get_salary_month_expenses(
        salary_month_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get all expenses linked to a salary month"""
    salary_month = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.id == salary_month_id
    ).first()

    if not salary_month:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Salary month not found"
        )

    # Verify ownership
    job = db.query(models.Job).filter(
        models.Job.id == salary_month.job_id,
        models.Job.person_id == current_user.id
    ).first()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
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
        models.SalaryMonth.id == salary_month_id
    ).first()

    if not salary_month:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Salary month not found"
        )

    # Verify ownership
    job = db.query(models.Job).filter(
        models.Job.id == salary_month.job_id,
        models.Job.person_id == current_user.id
    ).first()

    if not job:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
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
