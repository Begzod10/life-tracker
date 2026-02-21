from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, date

from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(
    prefix="/expenses",
    tags=["expenses"]
)


@router.post('/', response_model=schemas.Expense, status_code=status.HTTP_201_CREATED)
def create_expense(
        expense: schemas.ExpenseCreate,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Create a new expense"""
    # Verify expense belongs to current user
    if expense.person_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only create expenses for yourself"
        )

    # If salary_month_id is provided, verify ownership
    if expense.salary_month_id:
        salary_month = db.query(models.SalaryMonth).filter(
            models.SalaryMonth.id == expense.salary_month_id
        ).first()

        if salary_month:
            job = db.query(models.Job).filter(
                models.Job.id == salary_month.job_id,
                models.Job.person_id == current_user.id
            ).first()

            if not job:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Salary month doesn't belong to you"
                )

    new_expense = models.Expense(**expense.model_dump())
    db.add(new_expense)
    db.commit()
    db.refresh(new_expense)

    # Update salary month if linked
    if new_expense.salary_month_id:
        _update_salary_month_totals(new_expense.salary_month_id, db)

    return new_expense


@router.get('/', response_model=List[schemas.Expense])
def get_expenses(
        category: Optional[str] = Query(None, description="Filter by category"),
        start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
        end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
        is_recurring: Optional[bool] = Query(None, description="Filter recurring expenses"),
        is_essential: Optional[bool] = Query(None, description="Filter essential expenses"),
        min_amount: Optional[float] = Query(None, description="Minimum amount"),
        max_amount: Optional[float] = Query(None, description="Maximum amount"),
        limit: int = Query(100, ge=1, le=1000, description="Limit results"),
        offset: int = Query(0, ge=0, description="Offset for pagination"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get all expenses for current user with filters"""
    query = db.query(models.Expense).filter(
        models.Expense.person_id == current_user.id
    )

    # Apply filters
    if category:
        query = query.filter(models.Expense.category == category)

    if start_date:
        start = datetime.strptime(start_date, "%Y-%m-%d").date()
        query = query.filter(models.Expense.date >= start)

    if end_date:
        end = datetime.strptime(end_date, "%Y-%m-%d").date()
        query = query.filter(models.Expense.date <= end)

    if is_recurring is not None:
        query = query.filter(models.Expense.is_recurring == is_recurring)

    if is_essential is not None:
        query = query.filter(models.Expense.is_essential == is_essential)

    if min_amount is not None:
        query = query.filter(models.Expense.amount >= min_amount)

    if max_amount is not None:
        query = query.filter(models.Expense.amount <= max_amount)

    return query.order_by(models.Expense.date.desc()).offset(offset).limit(limit).all()


@router.get('/current-month', response_model=List[schemas.Expense])
def get_current_month_expenses(
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get expenses for the current month"""
    today = date.today()
    start_of_month = today.replace(day=1)

    # Calculate end of month
    if today.month == 12:
        end_of_month = today.replace(year=today.year + 1, month=1, day=1)
    else:
        end_of_month = today.replace(month=today.month + 1, day=1)

    return db.query(models.Expense).filter(
        models.Expense.person_id == current_user.id,
        models.Expense.date >= start_of_month,
        models.Expense.date < end_of_month
    ).order_by(models.Expense.date.desc()).all()


@router.get('/by-category/{category}', response_model=List[schemas.Expense])
def get_expenses_by_category(
        category: str,
        year: Optional[int] = Query(None, description="Filter by year"),
        month: Optional[int] = Query(None, ge=1, le=12, description="Filter by month"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get expenses by category"""
    query = db.query(models.Expense).filter(
        models.Expense.person_id == current_user.id,
        models.Expense.category == category
    )

    if year and month:
        start = date(year, month, 1)
        if month == 12:
            end = date(year + 1, 1, 1)
        else:
            end = date(year, month + 1, 1)
        query = query.filter(
            models.Expense.date >= start,
            models.Expense.date < end
        )
    elif year:
        query = query.filter(
            models.Expense.date >= date(year, 1, 1),
            models.Expense.date < date(year + 1, 1, 1)
        )

    return query.order_by(models.Expense.date.desc()).all()


@router.get('/recurring', response_model=List[schemas.Expense])
def get_recurring_expenses(
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get all recurring expenses"""
    return db.query(models.Expense).filter(
        models.Expense.person_id == current_user.id,
        models.Expense.is_recurring == True
    ).order_by(models.Expense.date.desc()).all()


@router.get('/{expense_id}', response_model=schemas.Expense)
def get_expense(
        expense_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get a specific expense by ID"""
    expense = db.query(models.Expense).filter(
        models.Expense.id == expense_id,
        models.Expense.person_id == current_user.id
    ).first()

    if not expense:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense not found"
        )
    return expense


@router.put('/{expense_id}', response_model=schemas.Expense)
def update_expense(
        expense_id: int,
        expense: schemas.ExpenseUpdate,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Update an expense"""
    db_expense = db.query(models.Expense).filter(
        models.Expense.id == expense_id,
        models.Expense.person_id == current_user.id
    ).first()

    if not db_expense:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense not found"
        )

    old_salary_month_id = db_expense.salary_month_id

    update_data = expense.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_expense, key, value)

    db.commit()
    db.refresh(db_expense)

    # Update salary month totals if changed
    if old_salary_month_id:
        _update_salary_month_totals(old_salary_month_id, db)
    if db_expense.salary_month_id and db_expense.salary_month_id != old_salary_month_id:
        _update_salary_month_totals(db_expense.salary_month_id, db)

    return db_expense


@router.delete('/{expense_id}', status_code=status.HTTP_200_OK)
def delete_expense(
        expense_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Delete an expense"""
    db_expense = db.query(models.Expense).filter(
        models.Expense.id == expense_id,
        models.Expense.person_id == current_user.id
    ).first()

    if not db_expense:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense not found"
        )

    salary_month_id = db_expense.salary_month_id

    db.delete(db_expense)
    db.commit()

    # Update salary month totals if linked
    if salary_month_id:
        _update_salary_month_totals(salary_month_id, db)

    return {"message": "Expense deleted"}


@router.get('/summary/by-category', response_model=dict)
def get_expense_summary_by_category(
        year: Optional[int] = Query(None, description="Filter by year"),
        month: Optional[int] = Query(None, ge=1, le=12, description="Filter by month"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get expense summary grouped by category"""
    query = db.query(models.Expense).filter(
        models.Expense.person_id == current_user.id
    )

    # Apply date filters
    if year and month:
        start = date(year, month, 1)
        if month == 12:
            end = date(year + 1, 1, 1)
        else:
            end = date(year, month + 1, 1)
        query = query.filter(
            models.Expense.date >= start,
            models.Expense.date < end
        )
    elif year:
        query = query.filter(
            models.Expense.date >= date(year, 1, 1),
            models.Expense.date < date(year + 1, 1, 1)
        )

    expenses = query.all()

    # Group by category
    summary = {}
    total = 0

    for expense in expenses:
        category = expense.category or "uncategorized"
        if category not in summary:
            summary[category] = {
                "total": 0,
                "count": 0,
                "average": 0
            }
        summary[category]["total"] += expense.amount
        summary[category]["count"] += 1
        total += expense.amount

    # Calculate averages and percentages
    for category in summary:
        summary[category]["average"] = summary[category]["total"] / summary[category]["count"]
        summary[category]["percentage"] = (summary[category]["total"] / total * 100) if total > 0 else 0

    return {
        "summary": summary,
        "total": total,
        "period": f"{year}-{month:02d}" if year and month else str(year) if year else "all-time"
    }


@router.get('/top/{limit}', response_model=List[schemas.Expense])
def get_top_expenses(
        limit: int = 10,
        year: Optional[int] = Query(None),
        month: Optional[int] = Query(None, ge=1, le=12),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get top N expenses by amount"""
    query = db.query(models.Expense).filter(
        models.Expense.person_id == current_user.id
    )

    if year and month:
        start = date(year, month, 1)
        if month == 12:
            end = date(year + 1, 1, 1)
        else:
            end = date(year, month + 1, 1)
        query = query.filter(
            models.Expense.date >= start,
            models.Expense.date < end
        )
    elif year:
        query = query.filter(
            models.Expense.date >= date(year, 1, 1),
            models.Expense.date < date(year + 1, 1, 1)
        )

    return query.order_by(models.Expense.amount.desc()).limit(limit).all()


# Helper function
def _update_salary_month_totals(salary_month_id: int, db: Session):
    """Update total_spent and remaining_amount for a salary month"""
    salary_month = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.id == salary_month_id
    ).first()

    if salary_month:
        expenses = db.query(models.Expense).filter(
            models.Expense.salary_month_id == salary_month_id
        ).all()

        total_spent = sum(expense.amount for expense in expenses)
        salary_month.total_spent = total_spent
        salary_month.remaining_amount = salary_month.net_amount - total_spent
        db.commit()