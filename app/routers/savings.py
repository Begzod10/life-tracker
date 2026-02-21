from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, date

from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(
    prefix="/savings",
    tags=["savings"]
)


@router.post('/', response_model=schemas.Saving, status_code=status.HTTP_201_CREATED)
def create_saving(
        saving: schemas.SavingCreate,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Create a new savings account"""
    # Verify saving belongs to current user
    if saving.person_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only create savings for yourself"
        )

    new_saving = models.Saving(**saving.model_dump())
    db.add(new_saving)
    db.commit()
    db.refresh(new_saving)
    return new_saving


@router.get('/', response_model=List[schemas.Saving])
def get_savings(
        account_type: Optional[str] = Query(None, description="Filter by account type"),
        active_only: bool = Query(False, description="Only show accounts with positive balance"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get all savings accounts for current user"""
    query = db.query(models.Saving).filter(
        models.Saving.person_id == current_user.id
    )

    if account_type:
        query = query.filter(models.Saving.account_type == account_type)

    if active_only:
        query = query.filter(models.Saving.current_balance > 0)

    return query.order_by(models.Saving.created_at.desc()).all()


@router.get('/total-balance', response_model=dict)
def get_total_balance(
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get total balance across all savings accounts"""
    savings = db.query(models.Saving).filter(
        models.Saving.person_id == current_user.id
    ).all()

    total = sum(saving.current_balance for saving in savings)
    by_type = {}

    for saving in savings:
        account_type = saving.account_type
        if account_type not in by_type:
            by_type[account_type] = 0
        by_type[account_type] += saving.current_balance

    return {
        "total_balance": total,
        "by_type": by_type,
        "account_count": len(savings)
    }


@router.get('/{saving_id}', response_model=schemas.Saving)
def get_saving(
        saving_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get a specific savings account by ID"""
    saving = db.query(models.Saving).filter(
        models.Saving.id == saving_id,
        models.Saving.person_id == current_user.id
    ).first()

    if not saving:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saving account not found"
        )
    return saving


@router.put('/{saving_id}', response_model=schemas.Saving)
def update_saving(
        saving_id: int,
        saving: schemas.SavingUpdate,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Update a savings account"""
    db_saving = db.query(models.Saving).filter(
        models.Saving.id == saving_id,
        models.Saving.person_id == current_user.id
    ).first()

    if not db_saving:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saving account not found"
        )

    update_data = saving.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_saving, key, value)

    db.commit()
    db.refresh(db_saving)
    return db_saving


@router.delete('/{saving_id}', status_code=status.HTTP_200_OK)
def delete_saving(
        saving_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Delete a savings account"""
    db_saving = db.query(models.Saving).filter(
        models.Saving.id == saving_id,
        models.Saving.person_id == current_user.id
    ).first()

    if not db_saving:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saving account not found"
        )

    db.delete(db_saving)
    db.commit()
    return {"message": "Saving deleted"}


@router.get('/{saving_id}/transactions', response_model=List[schemas.SavingTransaction])
def get_saving_transactions(
        saving_id: int,
        limit: int = Query(100, ge=1, le=1000),
        offset: int = Query(0, ge=0),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get transaction history for a savings account"""
    # Verify ownership
    saving = db.query(models.Saving).filter(
        models.Saving.id == saving_id,
        models.Saving.person_id == current_user.id
    ).first()

    if not saving:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saving account not found"
        )

    return db.query(models.SavingTransaction).filter(
        models.SavingTransaction.saving_id == saving_id
    ).order_by(models.SavingTransaction.transaction_date.desc()).offset(offset).limit(limit).all()


@router.post('/{saving_id}/transactions', response_model=schemas.SavingTransaction, status_code=status.HTTP_201_CREATED)
def create_saving_transaction(
        saving_id: int,
        transaction: schemas.SavingTransactionCreate,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Create a new transaction for a savings account"""
    # Verify ownership and get saving account
    saving = db.query(models.Saving).filter(
        models.Saving.id == saving_id,
        models.Saving.person_id == current_user.id
    ).first()

    if not saving:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saving account not found"
        )

    # Verify the transaction's saving_id matches the URL parameter
    if transaction.saving_id != saving_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Transaction saving_id doesn't match URL parameter"
        )

    # Validate transaction
    if transaction.transaction_type == "withdrawal" and transaction.amount > saving.current_balance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Insufficient balance for withdrawal"
        )

    # Create transaction
    new_transaction = models.SavingTransaction(**transaction.model_dump())
    db.add(new_transaction)

    # Update saving account balance
    if transaction.transaction_type == "deposit" or transaction.transaction_type == "interest":
        saving.current_balance += transaction.amount
    elif transaction.transaction_type == "withdrawal":
        saving.current_balance -= transaction.amount

    db.commit()
    db.refresh(new_transaction)
    db.refresh(saving)

    return new_transaction


@router.post('/{saving_id}/deposit', response_model=schemas.SavingTransaction)
def deposit_to_saving(
        saving_id: int,
        amount: float = Query(..., gt=0, description="Deposit amount"),
        transaction_date: Optional[str] = Query(None, description="Transaction date (YYYY-MM-DD)"),
        description: Optional[str] = Query(None, description="Transaction description"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Make a deposit to a savings account"""
    saving = db.query(models.Saving).filter(
        models.Saving.id == saving_id,
        models.Saving.person_id == current_user.id
    ).first()

    if not saving:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saving account not found"
        )

    trans_date = datetime.strptime(transaction_date, "%Y-%m-%d").date() if transaction_date else date.today()
    balance_before = saving.current_balance
    balance_after = balance_before + amount

    transaction = models.SavingTransaction(
        saving_id=saving_id,
        transaction_type="deposit",
        amount=amount,
        transaction_date=trans_date,
        balance_before=balance_before,
        balance_after=balance_after,
        description=description
    )

    db.add(transaction)
    saving.current_balance = balance_after

    db.commit()
    db.refresh(transaction)

    return transaction


@router.post('/{saving_id}/withdraw', response_model=schemas.SavingTransaction)
def withdraw_from_saving(
        saving_id: int,
        amount: float = Query(..., gt=0, description="Withdrawal amount"),
        transaction_date: Optional[str] = Query(None, description="Transaction date (YYYY-MM-DD)"),
        description: Optional[str] = Query(None, description="Transaction description"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Make a withdrawal from a savings account"""
    saving = db.query(models.Saving).filter(
        models.Saving.id == saving_id,
        models.Saving.person_id == current_user.id
    ).first()

    if not saving:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saving account not found"
        )

    if amount > saving.current_balance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient balance. Available: {saving.current_balance}"
        )

    trans_date = datetime.strptime(transaction_date, "%Y-%m-%d").date() if transaction_date else date.today()
    balance_before = saving.current_balance
    balance_after = balance_before - amount

    transaction = models.SavingTransaction(
        saving_id=saving_id,
        transaction_type="withdrawal",
        amount=amount,
        transaction_date=trans_date,
        balance_before=balance_before,
        balance_after=balance_after,
        description=description
    )

    db.add(transaction)
    saving.current_balance = balance_after

    db.commit()
    db.refresh(transaction)

    return transaction


@router.get('/{saving_id}/progress', response_model=dict)
def get_saving_progress(
        saving_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get progress towards savings goal"""
    saving = db.query(models.Saving).filter(
        models.Saving.id == saving_id,
        models.Saving.person_id == current_user.id
    ).first()

    if not saving:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saving account not found"
        )

    if not saving.target_amount:
        return {
            "message": "No target amount set",
            "current_balance": saving.current_balance
        }

    progress_percentage = (saving.current_balance / saving.target_amount * 100) if saving.target_amount > 0 else 0
    remaining = saving.target_amount - saving.current_balance

    return {
        "account_name": saving.account_name,
        "current_balance": saving.current_balance,
        "target_amount": saving.target_amount,
        "progress_percentage": round(progress_percentage, 2),
        "remaining_amount": remaining,
        "status": "achieved" if saving.current_balance >= saving.target_amount else "in_progress"
    }


@router.delete('/{saving_id}/transactions/{transaction_id}', status_code=status.HTTP_200_OK)
def delete_saving_transaction(
        saving_id: int,
        transaction_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Delete a transaction (and reverse its effect on balance)"""
    # Verify saving ownership
    saving = db.query(models.Saving).filter(
        models.Saving.id == saving_id,
        models.Saving.person_id == current_user.id
    ).first()

    if not saving:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saving account not found"
        )

    # Get transaction
    transaction = db.query(models.SavingTransaction).filter(
        models.SavingTransaction.id == transaction_id,
        models.SavingTransaction.saving_id == saving_id
    ).first()

    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )

    # Reverse the transaction effect
    if transaction.transaction_type == "deposit" or transaction.transaction_type == "interest":
        saving.current_balance -= transaction.amount
    elif transaction.transaction_type == "withdrawal":
        saving.current_balance += transaction.amount

    db.delete(transaction)
    db.commit()

    return {"message": "Transaction deleted"}
