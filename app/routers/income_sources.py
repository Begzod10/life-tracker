from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, date

from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(
    prefix="/income-sources",
    tags=["income-sources"]
)


@router.post('/', response_model=schemas.IncomeSource, status_code=status.HTTP_201_CREATED)
def create_income_source(
        income_source: schemas.IncomeSourceCreate,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Create a new income source"""
    # Verify income source belongs to current user
    if income_source.person_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only create income sources for yourself"
        )

    new_income_source = models.IncomeSource(**income_source.model_dump())
    db.add(new_income_source)
    db.commit()
    db.refresh(new_income_source)
    return new_income_source


@router.get('/', response_model=List[schemas.IncomeSource])
def get_income_sources(
        source_type: Optional[str] = Query(None, description="Filter by source type"),
        start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD)"),
        end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD)"),
        frequency: Optional[str] = Query(None, description="Filter by frequency"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get all income sources for current user"""
    query = db.query(models.IncomeSource).filter(
        models.IncomeSource.person_id == current_user.id
    )

    # Apply filters
    if source_type:
        query = query.filter(models.IncomeSource.source_type == source_type)

    if start_date:
        start = datetime.strptime(start_date, "%Y-%m-%d").date()
        query = query.filter(models.IncomeSource.received_date >= start)

    if end_date:
        end = datetime.strptime(end_date, "%Y-%m-%d").date()
        query = query.filter(models.IncomeSource.received_date <= end)

    if frequency:
        query = query.filter(models.IncomeSource.frequency == frequency)

    return query.order_by(models.IncomeSource.received_date.desc()).all()


@router.get('/current-month', response_model=List[schemas.IncomeSource])
def get_current_month_income(
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get income sources for the current month"""
    today = date.today()
    start_of_month = today.replace(day=1)

    # Calculate end of month
    if today.month == 12:
        end_of_month = today.replace(year=today.year + 1, month=1, day=1)
    else:
        end_of_month = today.replace(month=today.month + 1, day=1)

    return db.query(models.IncomeSource).filter(
        models.IncomeSource.person_id == current_user.id,
        models.IncomeSource.received_date >= start_of_month,
        models.IncomeSource.received_date < end_of_month
    ).order_by(models.IncomeSource.received_date.desc()).all()


@router.get('/by-type/{source_type}', response_model=List[schemas.IncomeSource])
def get_income_by_type(
        source_type: str,
        year: Optional[int] = Query(None, description="Filter by year"),
        month: Optional[int] = Query(None, ge=1, le=12, description="Filter by month"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get income sources by type"""
    query = db.query(models.IncomeSource).filter(
        models.IncomeSource.person_id == current_user.id,
        models.IncomeSource.source_type == source_type
    )

    if year and month:
        start = date(year, month, 1)
        if month == 12:
            end = date(year + 1, 1, 1)
        else:
            end = date(year, month + 1, 1)
        query = query.filter(
            models.IncomeSource.received_date >= start,
            models.IncomeSource.received_date < end
        )
    elif year:
        query = query.filter(
            models.IncomeSource.received_date >= date(year, 1, 1),
            models.IncomeSource.received_date < date(year + 1, 1, 1)
        )

    return query.order_by(models.IncomeSource.received_date.desc()).all()


@router.get('/{income_source_id}', response_model=schemas.IncomeSource)
def get_income_source(
        income_source_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get a specific income source by ID"""
    income_source = db.query(models.IncomeSource).filter(
        models.IncomeSource.id == income_source_id,
        models.IncomeSource.person_id == current_user.id
    ).first()

    if not income_source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Income source not found"
        )
    return income_source


@router.put('/{income_source_id}', response_model=schemas.IncomeSource)
def update_income_source(
        income_source_id: int,
        income_source: schemas.IncomeSourceUpdate,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Update an income source"""
    db_income_source = db.query(models.IncomeSource).filter(
        models.IncomeSource.id == income_source_id,
        models.IncomeSource.person_id == current_user.id
    ).first()

    if not db_income_source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Income source not found"
        )

    update_data = income_source.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_income_source, key, value)

    db.commit()
    db.refresh(db_income_source)
    return db_income_source


@router.delete('/{income_source_id}', status_code=status.HTTP_200_OK)
def delete_income_source(
        income_source_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Delete an income source"""
    db_income_source = db.query(models.IncomeSource).filter(
        models.IncomeSource.id == income_source_id,
        models.IncomeSource.person_id == current_user.id
    ).first()

    if not db_income_source:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Income source not found"
        )

    db.delete(db_income_source)
    db.commit()
    return {"message": "Income source deleted"}


@router.get('/summary/by-type', response_model=dict)
def get_income_summary_by_type(
        year: Optional[int] = Query(None, description="Filter by year"),
        month: Optional[int] = Query(None, ge=1, le=12, description="Filter by month"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get income summary grouped by source type"""
    query = db.query(models.IncomeSource).filter(
        models.IncomeSource.person_id == current_user.id
    )

    # Apply date filters
    if year and month:
        start = date(year, month, 1)
        if month == 12:
            end = date(year + 1, 1, 1)
        else:
            end = date(year, month + 1, 1)
        query = query.filter(
            models.IncomeSource.received_date >= start,
            models.IncomeSource.received_date < end
        )
    elif year:
        query = query.filter(
            models.IncomeSource.received_date >= date(year, 1, 1),
            models.IncomeSource.received_date < date(year + 1, 1, 1)
        )

    income_sources = query.all()

    # Group by source type
    summary = {}
    total = 0

    for income in income_sources:
        source_type = income.source_type or "uncategorized"
        if source_type not in summary:
            summary[source_type] = {
                "total": 0,
                "count": 0,
                "average": 0
            }
        summary[source_type]["total"] += income.amount
        summary[source_type]["count"] += 1
        total += income.amount

    # Calculate averages and percentages
    for source_type in summary:
        summary[source_type]["average"] = summary[source_type]["total"] / summary[source_type]["count"]
        summary[source_type]["percentage"] = (summary[source_type]["total"] / total * 100) if total > 0 else 0

    return {
        "summary": summary,
        "total": total,
        "period": f"{year}-{month:02d}" if year and month else str(year) if year else "all-time"
    }


@router.get('/total/period', response_model=dict)
def get_total_income_for_period(
        year: int = Query(..., description="Year"),
        month: Optional[int] = Query(None, ge=1, le=12, description="Month (optional)"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get total income for a specific period"""
    query = db.query(models.IncomeSource).filter(
        models.IncomeSource.person_id == current_user.id
    )

    if month:
        start = date(year, month, 1)
        if month == 12:
            end = date(year + 1, 1, 1)
        else:
            end = date(year, month + 1, 1)
        query = query.filter(
            models.IncomeSource.received_date >= start,
            models.IncomeSource.received_date < end
        )
        period = f"{year}-{month:02d}"
    else:
        query = query.filter(
            models.IncomeSource.received_date >= date(year, 1, 1),
            models.IncomeSource.received_date < date(year + 1, 1, 1)
        )
        period = str(year)

    income_sources = query.all()
    total = sum(inc.amount for inc in income_sources)

    return {
        "period": period,
        "total_income": total,
        "count": len(income_sources)
    }