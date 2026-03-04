from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, date
from calendar import monthrange

from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(
    prefix="/savings",
    tags=["savings"]
)


def _sync_balance(saving: models.Saving, db: Session) -> float:
    """
    Compute the true balance from the transaction log, backfill any missing
    withdrawal transactions for orphaned savings-funded expenses, and sync
    current_balance if it has drifted.
    """
    # Authoritative starting point: last committed transaction
    last_tx = db.query(models.SavingTransaction).filter(
        models.SavingTransaction.saving_id == saving.id
    ).order_by(models.SavingTransaction.id.desc()).first()

    running_balance = last_tx.balance_after if last_tx else saving.initial_amount

    # Find active savings expenses that have no withdrawal transaction (orphaned)
    orphaned = db.query(models.Expense).filter(
        models.Expense.saving_id == saving.id,
        models.Expense.saving_transaction_id == None,
        models.Expense.source == "savings",
        models.Expense.deleted == False
    ).order_by(models.Expense.id).all()

    for expense in orphaned:
        balance_after = running_balance - expense.amount
        saving_tx = models.SavingTransaction(
            saving_id=saving.id,
            transaction_type="withdrawal",
            amount=expense.amount,
            transaction_date=expense.date,
            balance_before=running_balance,
            balance_after=balance_after,
            description=f"Expense: {expense.name} (expense_id={expense.id}) [backfilled]"
        )
        db.add(saving_tx)
        db.flush()
        expense.saving_transaction_id = saving_tx.id
        running_balance = balance_after

    if saving.current_balance != running_balance:
        saving.current_balance = running_balance
        db.add(saving)

    return running_balance


@router.post('/', response_model=schemas.Saving, status_code=status.HTTP_201_CREATED)
def create_saving(
        saving: schemas.SavingCreate,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Create a new savings account"""
    new_saving = models.Saving(
        **saving.model_dump(),
        person_id=current_user.id,
        current_balance=saving.initial_amount
    )
    db.add(new_saving)
    db.flush()  # get new_saving.id before creating transaction

    if saving.initial_amount > 0:
        initial_transaction = models.SavingTransaction(
            saving_id=new_saving.id,
            transaction_type="deposit",
            amount=saving.initial_amount,
            transaction_date=saving.start_date,
            balance_before=0.0,
            balance_after=saving.initial_amount,
            description="Initial deposit"
        )
        db.add(initial_transaction)

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
        models.Saving.person_id == current_user.id,
        models.Saving.deleted == False
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
    """Get total balance across all active savings accounts"""
    savings = db.query(models.Saving).filter(
        models.Saving.person_id == current_user.id,
        models.Saving.deleted == False
    ).all()

    total = 0.0
    by_type = {}
    any_synced = False

    for saving in savings:
        balance = _sync_balance(saving, db)
        if saving in db.dirty:
            any_synced = True
        total += balance
        by_type[saving.account_type] = by_type.get(saving.account_type, 0) + balance

    if any_synced:
        db.commit()

    return {
        "total_balance": total,
        "by_type": by_type,
        "account_count": len(savings)
    }


@router.get('/monthly-summary', response_model=schemas.SavingsAggregatedMonthlySummary)
def get_aggregated_monthly_summary(
        months: int = Query(6, ge=1, le=24, description="Number of months to analyze"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get monthly savings summary aggregated across all accounts"""
    savings_accounts = db.query(models.Saving).filter(
        models.Saving.person_id == current_user.id,
        models.Saving.deleted == False
    ).all()

    today = date.today()
    result = []

    for i in range(months - 1, -1, -1):  # oldest to newest
        target_month = today.month - i
        target_year = today.year

        while target_month <= 0:
            target_month += 12
            target_year -= 1

        period = f"{target_year}-{target_month:02d}"
        start_date = date(target_year, target_month, 1)
        end_date = date(target_year + 1, 1, 1) if target_month == 12 else date(target_year, target_month + 1, 1)

        total_deposited = 0.0
        total_withdrawn = 0.0
        interest_earned = 0.0
        total_closing_balance = 0.0
        by_account = {}

        for saving in savings_accounts:
            month_transactions = db.query(models.SavingTransaction).filter(
                models.SavingTransaction.saving_id == saving.id,
                models.SavingTransaction.transaction_date >= start_date,
                models.SavingTransaction.transaction_date < end_date
            ).all()

            total_deposited += sum(t.amount for t in month_transactions if t.transaction_type == "deposit")
            total_withdrawn += sum(t.amount for t in month_transactions if t.transaction_type == "withdrawal")
            interest_earned += sum(t.amount for t in month_transactions if t.transaction_type == "interest")

            last_tx = db.query(models.SavingTransaction).filter(
                models.SavingTransaction.saving_id == saving.id,
                models.SavingTransaction.transaction_date < end_date
            ).order_by(
                models.SavingTransaction.transaction_date.desc(),
                models.SavingTransaction.id.desc()
            ).first()

            closing = last_tx.balance_after if last_tx else saving.initial_amount
            total_closing_balance += closing
            by_account[saving.account_name] = closing

        result.append(schemas.SavingsAggregatedMonthlySummaryItem(
            period=period,
            total_deposited=total_deposited,
            total_withdrawn=total_withdrawn,
            interest_earned=interest_earned,
            net_change=total_deposited + interest_earned - total_withdrawn,
            total_closing_balance=total_closing_balance,
            by_account=by_account
        ))

    return schemas.SavingsAggregatedMonthlySummary(
        months_analyzed=months,
        summaries=result
    )


@router.get('/by-person/{person_id}', response_model=List[schemas.Saving])
def get_savings_by_person(
        person_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get all active savings accounts for a specific person"""
    if person_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own savings"
        )

    return db.query(models.Saving).filter(
        models.Saving.person_id == person_id,
        models.Saving.deleted == False
    ).order_by(models.Saving.created_at.desc()).all()


@router.get('/by-person/{person_id}/deleted', response_model=List[schemas.Saving])
def get_deleted_savings_by_person(
        person_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get all deleted savings accounts for a specific person"""
    if person_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own savings"
        )

    return db.query(models.Saving).filter(
        models.Saving.person_id == person_id,
        models.Saving.deleted == True
    ).order_by(models.Saving.created_at.desc()).all()


@router.patch('/deleted/{saving_id}/restore', response_model=schemas.Saving)
def restore_saving(
        saving_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Restore a soft-deleted savings account"""
    db_saving = db.query(models.Saving).filter(
        models.Saving.id == saving_id,
        models.Saving.person_id == current_user.id,
        models.Saving.deleted == True
    ).first()

    if not db_saving:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deleted saving account not found"
        )

    db_saving.deleted = False
    db.commit()
    db.refresh(db_saving)
    return db_saving


@router.get('/{saving_id}', response_model=schemas.Saving)
def get_saving(
        saving_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get a specific savings account by ID"""
    saving = db.query(models.Saving).filter(
        models.Saving.id == saving_id,
        models.Saving.person_id == current_user.id,
        models.Saving.deleted == False
    ).first()

    if not saving:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saving account not found"
        )

    _sync_balance(saving, db)
    db.commit()
    db.refresh(saving)

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
        models.Saving.person_id == current_user.id,
        models.Saving.deleted == False
    ).first()

    if not db_saving:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saving account not found"
        )

    update_data = saving.model_dump(exclude_unset=True)

    if "interest_rate" in update_data and db_saving.start_date < date.today():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot change interest_rate after the account has started"
        )

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
    """Soft-delete a savings account"""
    db_saving = db.query(models.Saving).filter(
        models.Saving.id == saving_id,
        models.Saving.person_id == current_user.id,
        models.Saving.deleted == False
    ).first()

    if not db_saving:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saving account not found"
        )

    db_saving.deleted = True
    db.commit()
    return {"message": "Saving deleted"}


@router.get('/{saving_id}/monthly-summary', response_model=schemas.SavingAccountMonthlySummary)
def get_saving_monthly_summary(
        saving_id: int,
        months: int = Query(6, ge=1, le=24, description="Number of months to analyze"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get monthly breakdown for a specific savings account"""
    saving = db.query(models.Saving).filter(
        models.Saving.id == saving_id,
        models.Saving.person_id == current_user.id,
        models.Saving.deleted == False
    ).first()

    if not saving:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saving account not found"
        )

    today = date.today()
    summaries = []

    for i in range(months - 1, -1, -1):  # oldest to newest
        target_month = today.month - i
        target_year = today.year

        while target_month <= 0:
            target_month += 12
            target_year -= 1

        period = f"{target_year}-{target_month:02d}"
        start_date = date(target_year, target_month, 1)
        end_date = date(target_year + 1, 1, 1) if target_month == 12 else date(target_year, target_month + 1, 1)

        month_transactions = db.query(models.SavingTransaction).filter(
            models.SavingTransaction.saving_id == saving_id,
            models.SavingTransaction.transaction_date >= start_date,
            models.SavingTransaction.transaction_date < end_date
        ).all()

        total_deposited = sum(t.amount for t in month_transactions if t.transaction_type == "deposit")
        total_withdrawn = sum(t.amount for t in month_transactions if t.transaction_type == "withdrawal")
        interest_earned = sum(t.amount for t in month_transactions if t.transaction_type == "interest")

        last_tx = db.query(models.SavingTransaction).filter(
            models.SavingTransaction.saving_id == saving_id,
            models.SavingTransaction.transaction_date < end_date
        ).order_by(
            models.SavingTransaction.transaction_date.desc(),
            models.SavingTransaction.id.desc()
        ).first()

        closing_balance = last_tx.balance_after if last_tx else saving.initial_amount

        summaries.append(schemas.SavingMonthlySummaryItem(
            period=period,
            total_deposited=total_deposited,
            total_withdrawn=total_withdrawn,
            interest_earned=interest_earned,
            net_change=total_deposited + interest_earned - total_withdrawn,
            closing_balance=closing_balance
        ))

    return schemas.SavingAccountMonthlySummary(
        saving_id=saving_id,
        account_name=saving.account_name,
        account_type=saving.account_type,
        currency=saving.currency,
        months_analyzed=months,
        summaries=summaries
    )


@router.get('/{saving_id}/transactions', response_model=List[schemas.SavingTransaction])
def get_saving_transactions(
        saving_id: int,
        limit: int = Query(100, ge=1, le=1000),
        offset: int = Query(0, ge=0),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get transaction history for a savings account"""
    saving = db.query(models.Saving).filter(
        models.Saving.id == saving_id,
        models.Saving.person_id == current_user.id,
        models.Saving.deleted == False
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
    saving = db.query(models.Saving).filter(
        models.Saving.id == saving_id,
        models.Saving.person_id == current_user.id,
        models.Saving.deleted == False
    ).first()

    if not saving:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saving account not found"
        )

    if transaction.transaction_type not in ("deposit", "withdrawal", "interest"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="transaction_type must be deposit, withdrawal, or interest"
        )

    if transaction.transaction_type == "withdrawal" and transaction.amount > saving.current_balance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient balance. Available: {saving.current_balance}"
        )

    balance_before = saving.current_balance
    if transaction.transaction_type in ("deposit", "interest"):
        balance_after = balance_before + transaction.amount
    else:
        balance_after = balance_before - transaction.amount

    new_transaction = models.SavingTransaction(
        **transaction.model_dump(),
        saving_id=saving_id,
        balance_before=balance_before,
        balance_after=balance_after
    )
    db.add(new_transaction)
    saving.current_balance = balance_after

    db.commit()
    db.refresh(new_transaction)
    db.refresh(saving)

    return new_transaction


@router.post('/{saving_id}/deposit', response_model=schemas.SavingTransaction)
def deposit_to_saving(
        saving_id: int,
        body: schemas.SavingDepositWithdrawBody,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Make a deposit to a savings account"""
    saving = db.query(models.Saving).filter(
        models.Saving.id == saving_id,
        models.Saving.person_id == current_user.id,
        models.Saving.deleted == False
    ).first()

    if not saving:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saving account not found"
        )

    trans_date = body.transaction_date or date.today()
    balance_before = saving.current_balance
    balance_after = balance_before + body.amount

    transaction = models.SavingTransaction(
        saving_id=saving_id,
        transaction_type="deposit",
        amount=body.amount,
        transaction_date=trans_date,
        balance_before=balance_before,
        balance_after=balance_after,
        description=body.description
    )

    db.add(transaction)
    saving.current_balance = balance_after

    db.commit()
    db.refresh(transaction)

    return transaction


@router.post('/{saving_id}/withdraw', response_model=schemas.SavingTransaction)
def withdraw_from_saving(
        saving_id: int,
        body: schemas.SavingDepositWithdrawBody,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Make a withdrawal from a savings account"""
    saving = db.query(models.Saving).filter(
        models.Saving.id == saving_id,
        models.Saving.person_id == current_user.id,
        models.Saving.deleted == False
    ).first()

    if not saving:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saving account not found"
        )

    if body.amount > saving.current_balance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient balance. Available: {saving.current_balance}"
        )

    trans_date = body.transaction_date or date.today()
    balance_before = saving.current_balance
    balance_after = balance_before - body.amount

    transaction = models.SavingTransaction(
        saving_id=saving_id,
        transaction_type="withdrawal",
        amount=body.amount,
        transaction_date=trans_date,
        balance_before=balance_before,
        balance_after=balance_after,
        description=body.description
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
        models.Saving.person_id == current_user.id,
        models.Saving.deleted == False
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


@router.post('/{saving_id}/apply-interest', response_model=schemas.SavingTransaction, status_code=status.HTTP_201_CREATED)
def apply_interest(
        saving_id: int,
        month: Optional[str] = Query(None, description="Month to apply interest for (YYYY-MM), defaults to current month"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Apply monthly interest to a savings account based on its interest rate"""
    saving = db.query(models.Saving).filter(
        models.Saving.id == saving_id,
        models.Saving.person_id == current_user.id,
        models.Saving.deleted == False
    ).first()

    if not saving:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saving account not found"
        )

    if not saving.interest_rate or saving.interest_rate == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account has no interest rate set"
        )

    # Determine target month
    if month:
        try:
            year, month_num = map(int, month.split('-'))
            date(year, month_num, 1)  # validate
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid month format. Use YYYY-MM"
            )
    else:
        today = date.today()
        year, month_num = today.year, today.month

    start_date = date(year, month_num, 1)
    end_date = date(year + 1, 1, 1) if month_num == 12 else date(year, month_num + 1, 1)

    # Prevent applying interest twice in the same month
    already_applied = db.query(models.SavingTransaction).filter(
        models.SavingTransaction.saving_id == saving_id,
        models.SavingTransaction.transaction_type == "interest",
        models.SavingTransaction.transaction_date >= start_date,
        models.SavingTransaction.transaction_date < end_date
    ).first()

    if already_applied:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Interest already applied for {year}-{month_num:02d}"
        )

    # Calculate monthly interest: annual_rate / 12
    monthly_interest = round(saving.current_balance * (saving.interest_rate / 100) / 12, 2)

    # Apply on last day of the month
    last_day = monthrange(year, month_num)[1]
    transaction_date = date(year, month_num, last_day)

    balance_before = saving.current_balance
    balance_after = balance_before + monthly_interest

    transaction = models.SavingTransaction(
        saving_id=saving_id,
        transaction_type="interest",
        amount=monthly_interest,
        transaction_date=transaction_date,
        balance_before=balance_before,
        balance_after=balance_after,
        description=f"Monthly interest at {saving.interest_rate}% annual rate"
    )

    db.add(transaction)
    saving.current_balance = balance_after
    db.commit()
    db.refresh(transaction)

    return transaction


@router.delete('/{saving_id}/transactions/{transaction_id}', status_code=status.HTTP_200_OK)
def delete_saving_transaction(
        saving_id: int,
        transaction_id: int,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Delete a transaction (and reverse its effect on balance)"""
    saving = db.query(models.Saving).filter(
        models.Saving.id == saving_id,
        models.Saving.person_id == current_user.id,
        models.Saving.deleted == False
    ).first()

    if not saving:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saving account not found"
        )

    transaction = db.query(models.SavingTransaction).filter(
        models.SavingTransaction.id == transaction_id,
        models.SavingTransaction.saving_id == saving_id
    ).first()

    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )

    if transaction.transaction_type in ("deposit", "interest"):
        if saving.current_balance < transaction.amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete transaction: would result in negative balance"
            )
        saving.current_balance -= transaction.amount
    elif transaction.transaction_type == "withdrawal":
        saving.current_balance += transaction.amount

    db.delete(transaction)
    db.commit()

    return {"message": "Transaction deleted"}
