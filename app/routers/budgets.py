from fastapi import APIRouter, Depends, HTTPException, status, Query, Body
from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from datetime import datetime, date

from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(
    prefix="/budgets",
    tags=["budgets"]
)


@router.post('/', response_model=schemas.Budget, status_code=status.HTTP_201_CREATED)
def create_budget(
        budget: schemas.BudgetCreate,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Create a new budget"""
    # Verify budget belongs to current user
    if budget.person_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only create budgets for yourself"
        )

    # Check if budget already exists for this period and category
    existing = db.query(models.Budget).filter(
        models.Budget.person_id == current_user.id,
        models.Budget.period == budget.period,
        models.Budget.category == budget.category
    ).first()

    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Budget already exists for {budget.category} in {budget.period}"
        )

    new_budget = models.Budget(**budget.model_dump())
    new_budget.remaining_amount = new_budget.allocated_amount

    db.add(new_budget)
    db.commit()
    db.refresh(new_budget)

    # Calculate actual spending
    _update_budget_totals(new_budget.id, db)
    db.refresh(new_budget)

    return new_budget


@router.get('/', response_model=List[schemas.Budget])
def get_budgets(
        period: Optional[str] = Query(None, description="Filter by period (YYYY-MM or YYYY-WW)"),
        category: Optional[str] = Query(None, description="Filter by category"),
        period_type: Optional[str] = Query(None, description="Filter by period type (monthly/weekly)"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get all budgets for current user"""
    query = db.query(models.Budget).filter(
        models.Budget.person_id == current_user.id
    )

    if period:
        query = query.filter(models.Budget.period == period)

    if category:
        query = query.filter(models.Budget.category == category)

    if period_type:
        query = query.filter(models.Budget.period_type == period_type)

    budgets = query.order_by(models.Budget.period.desc(), models.Budget.category).all()

    # Update all budgets with current spending
    for budget in budgets:
        _update_budget_totals(budget.id, db)

    db.commit()

    return budgets


@router.get('/current-month', response_model=List[schemas.Budget])
def get_current_month_budgets(
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get budgets for the current month"""
    current_period = date.today().strftime("%Y-%m")

    budgets = db.query(models.Budget).filter(
        models.Budget.person_id == current_user.id,
        models.Budget.period == current_period,
        models.Budget.period_type == "monthly"
    ).order_by(models.Budget.category).all()

    # Update all budgets with current spending
    for budget in budgets:
        _update_budget_totals(budget.id, db)

    db.commit()

    return budgets


@router.get('/period/{period}', response_model=List[schemas.Budget])
def get_budgets_by_period(
        period: str,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get all budgets for a specific period"""
    budgets = db.query(models.Budget).filter(
        models.Budget.person_id == current_user.id,
        models.Budget.period == period
    ).order_by(models.Budget.category).all()

    # Update all budgets with current spending
    for budget in budgets:
        _update_budget_totals(budget.id, db)

    db.commit()

    return budgets


@router.get('/{budget_id}', response_model=schemas.Budget)
def get_budget(
        budget_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get a specific budget by ID"""
    budget = db.query(models.Budget).filter(
        models.Budget.id == budget_id,
        models.Budget.person_id == current_user.id
    ).first()

    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )

    # Update with current spending
    _update_budget_totals(budget_id, db)
    db.commit()
    db.refresh(budget)

    return budget


@router.put('/{budget_id}', response_model=schemas.Budget)
def update_budget(
        budget_id: int,
        budget: schemas.BudgetUpdate,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Update a budget"""
    db_budget = db.query(models.Budget).filter(
        models.Budget.id == budget_id,
        models.Budget.person_id == current_user.id
    ).first()

    if not db_budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )

    update_data = budget.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_budget, key, value)

    db.commit()

    # Recalculate remaining amount
    _update_budget_totals(budget_id, db)
    db.commit()
    db.refresh(db_budget)

    return db_budget


@router.delete('/{budget_id}', status_code=status.HTTP_200_OK)
def delete_budget(
        budget_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Delete a budget"""
    db_budget = db.query(models.Budget).filter(
        models.Budget.id == budget_id,
        models.Budget.person_id == current_user.id
    ).first()

    if not db_budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )

    db.delete(db_budget)
    db.commit()
    return {"message": "Budget deleted"}


@router.get('/{budget_id}/adherence', response_model=dict)
def get_budget_adherence(
        budget_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get detailed budget adherence report"""
    budget = db.query(models.Budget).filter(
        models.Budget.id == budget_id,
        models.Budget.person_id == current_user.id
    ).first()

    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )

    # Update with latest data
    _update_budget_totals(budget_id, db)
    db.commit()
    db.refresh(budget)

    adherence_percentage = (budget.spent_amount / budget.allocated_amount * 100) if budget.allocated_amount > 0 else 0

    status_text = "on_track"
    if adherence_percentage > 100:
        status_text = "over_budget"
    elif adherence_percentage > 90:
        status_text = "warning"
    elif adherence_percentage > 75:
        status_text = "good"
    else:
        status_text = "excellent"

    return {
        "budget_id": budget_id,
        "category": budget.category,
        "period": budget.period,
        "allocated_amount": budget.allocated_amount,
        "spent_amount": budget.spent_amount,
        "remaining_amount": budget.remaining_amount,
        "adherence_percentage": round(adherence_percentage, 2),
        "status": status_text,
        "is_over_budget": adherence_percentage > 100
    }


@router.post('/{budget_id}/recalculate', response_model=schemas.Budget)
def recalculate_budget(
        budget_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Manually trigger budget recalculation"""
    budget = db.query(models.Budget).filter(
        models.Budget.id == budget_id,
        models.Budget.person_id == current_user.id
    ).first()

    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )

    _update_budget_totals(budget_id, db)
    db.commit()
    db.refresh(budget)

    return budget


@router.get('/summary/period/{period}', response_model=dict)
def get_period_budget_summary(
        period: str,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get summary of all budgets for a period"""
    budgets = db.query(models.Budget).filter(
        models.Budget.person_id == current_user.id,
        models.Budget.period == period
    ).all()

    # Update all budgets
    for budget in budgets:
        _update_budget_totals(budget.id, db)
    db.commit()

    total_allocated = sum(b.allocated_amount for b in budgets)
    total_spent = sum(b.spent_amount for b in budgets)
    total_remaining = sum(b.remaining_amount for b in budgets)

    by_category = {}
    over_budget_categories = []

    for budget in budgets:
        adherence = (budget.spent_amount / budget.allocated_amount * 100) if budget.allocated_amount > 0 else 0
        by_category[budget.category] = {
            "allocated": budget.allocated_amount,
            "spent": budget.spent_amount,
            "remaining": budget.remaining_amount,
            "adherence_percentage": round(adherence, 2),
            "status": "over_budget" if adherence > 100 else "on_track"
        }

        if adherence > 100:
            over_budget_categories.append(budget.category)

    overall_adherence = (total_spent / total_allocated * 100) if total_allocated > 0 else 0

    return {
        "period": period,
        "total_allocated": total_allocated,
        "total_spent": total_spent,
        "total_remaining": total_remaining,
        "overall_adherence_percentage": round(overall_adherence, 2),
        "by_category": by_category,
        "over_budget_categories": over_budget_categories,
        "budget_count": len(budgets)
    }


@router.post('/create-monthly-template', response_model=List[schemas.Budget])
def create_monthly_budget_template(
        period: str,
        categories: Dict[str, float] = Body(..., description="Dictionary of category: amount"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Create budgets for multiple categories at once

    Example request body:
    {
        "period": "2026-01",
        "categories": {
            "food": 1000000,
            "transport": 500000,
            "bills": 2000000
        }
    }
    """
    created_budgets = []

    for category, amount in categories.items():
        # Check if already exists
        existing = db.query(models.Budget).filter(
            models.Budget.person_id == current_user.id,
            models.Budget.period == period,
            models.Budget.category == category
        ).first()

        if not existing:
            new_budget = models.Budget(
                person_id=current_user.id,
                period=period,
                period_type="monthly",
                category=category,
                allocated_amount=amount,
                remaining_amount=amount
            )
            db.add(new_budget)
            created_budgets.append(new_budget)

    db.commit()

    # Update all with current spending
    for budget in created_budgets:
        db.refresh(budget)
        _update_budget_totals(budget.id, db)

    db.commit()

    return created_budgets


# Helper function
def _update_budget_totals(budget_id: int, db: Session):
    """Update spent_amount and remaining_amount for a budget"""
    budget = db.query(models.Budget).filter(
        models.Budget.id == budget_id
    ).first()

    if not budget:
        return

    # Parse period to get date range
    if budget.period_type == "monthly":
        # Format: YYYY-MM
        year, month = map(int, budget.period.split('-'))
        start = date(year, month, 1)
        if month == 12:
            end = date(year + 1, 1, 1)
        else:
            end = date(year, month + 1, 1)
    else:
        # For weekly budgets, would need different logic
        return

    # Get expenses for this category and period
    expenses = db.query(models.Expense).filter(
        models.Expense.person_id == budget.person_id,
        models.Expense.category == budget.category,
        models.Expense.date >= start,
        models.Expense.date < end
    ).all()

    spent = sum(expense.amount for expense in expenses)
    budget.spent_amount = spent
    budget.remaining_amount = budget.allocated_amount - spent