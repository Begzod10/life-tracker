from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional, Dict
from datetime import datetime, date, timedelta

from app import models, schemas
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(
    prefix="/financial-analytics",
    tags=["financial-analytics"]
)


@router.get('/monthly-summary/{month}', response_model=schemas.FinancialSummary)
def get_monthly_summary(
        month: str,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """
    Get comprehensive financial summary for a month
    Month format: YYYY-MM (e.g., "2026-01")
    """
    try:
        year, month_num = map(int, month.split('-'))
        start_date = date(year, month_num, 1)
        if month_num == 12:
            end_date = date(year + 1, 1, 1)
        else:
            end_date = date(year, month_num + 1, 1)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid month format. Use YYYY-MM"
        )

    # Calculate total salary income
    job_ids = [j.id for j in db.query(models.Job).filter(models.Job.person_id == current_user.id).all()]
    salary_months = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.job_id.in_(job_ids),
        models.SalaryMonth.month == month
    ).all()
    total_salary = sum(sm.net_amount for sm in salary_months)

    # Calculate other income
    income_sources = db.query(models.IncomeSource).filter(
        models.IncomeSource.person_id == current_user.id,
        models.IncomeSource.received_date >= start_date,
        models.IncomeSource.received_date < end_date
    ).all()
    total_other_income = sum(inc.amount for inc in income_sources)

    # Calculate total expenses
    expenses = db.query(models.Expense).filter(
        models.Expense.person_id == current_user.id,
        models.Expense.date >= start_date,
        models.Expense.date < end_date
    ).all()
    total_expenses = sum(exp.amount for exp in expenses)

    # Expense breakdown by category
    expense_by_category = {}
    for exp in expenses:
        category = exp.category or "uncategorized"
        expense_by_category[category] = expense_by_category.get(category, 0) + exp.amount

    # Calculate total savings (current balances)
    savings_accounts = db.query(models.Saving).filter(
        models.Saving.person_id == current_user.id
    ).all()
    total_savings = sum(s.current_balance for s in savings_accounts)

    # Calculate metrics
    total_income = total_salary + total_other_income
    net_income = total_income - total_expenses
    savings_rate = (net_income / total_income * 100) if total_income > 0 else 0

    return schemas.FinancialSummary(
        period=month,
        total_income=total_income,
        total_expenses=total_expenses,
        net_income=net_income,
        total_savings=total_savings,
        expense_by_category=expense_by_category,
        savings_rate=round(savings_rate, 2)
    )


@router.get('/monthly-report/{month}', response_model=schemas.MonthlyFinancialReport)
def get_monthly_report(
        month: str,
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Get detailed monthly financial report"""
    try:
        year, month_num = map(int, month.split('-'))
        start_date = date(year, month_num, 1)
        if month_num == 12:
            end_date = date(year + 1, 1, 1)
        else:
            end_date = date(year, month_num + 1, 1)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid month format. Use YYYY-MM"
        )

    # Get salary
    job_ids = [j.id for j in db.query(models.Job).filter(models.Job.person_id == current_user.id).all()]
    salary_months = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.job_id.in_(job_ids),
        models.SalaryMonth.month == month
    ).all()
    salary_received = sum(sm.net_amount for sm in salary_months)

    # Get other income
    income_sources = db.query(models.IncomeSource).filter(
        models.IncomeSource.person_id == current_user.id,
        models.IncomeSource.received_date >= start_date,
        models.IncomeSource.received_date < end_date
    ).all()
    other_income = sum(inc.amount for inc in income_sources)

    # Get expenses
    expenses = db.query(models.Expense).filter(
        models.Expense.person_id == current_user.id,
        models.Expense.date >= start_date,
        models.Expense.date < end_date
    ).all()
    total_expenses = sum(exp.amount for exp in expenses)

    # Get savings contributions (deposits)
    saving_ids = [s.id for s in db.query(models.Saving).filter(models.Saving.person_id == current_user.id).all()]
    savings_transactions = db.query(models.SavingTransaction).filter(
        models.SavingTransaction.saving_id.in_(saving_ids),
        models.SavingTransaction.transaction_type == "deposit",
        models.SavingTransaction.transaction_date >= start_date,
        models.SavingTransaction.transaction_date < end_date
    ).all()
    total_savings_contributions = sum(st.amount for st in savings_transactions)

    # Calculate net change
    total_income = salary_received + other_income
    net_change = total_income - total_expenses - total_savings_contributions

    # Budget adherence
    budgets = db.query(models.Budget).filter(
        models.Budget.person_id == current_user.id,
        models.Budget.period == month
    ).all()

    budget_adherence = {}
    for budget in budgets:
        # Calculate spent amount
        cat_expenses = [e for e in expenses if e.category == budget.category]
        spent = sum(e.amount for e in cat_expenses)
        adherence = (spent / budget.allocated_amount * 100) if budget.allocated_amount > 0 else 0
        budget_adherence[budget.category] = round(adherence, 2)

    # Top 10 expenses
    top_expenses = sorted(expenses, key=lambda x: x.amount, reverse=True)[:10]
    top_expenses_list = [
        {
            "name": exp.name,
            "amount": exp.amount,
            "category": exp.category,
            "date": exp.date.isoformat()
        }
        for exp in top_expenses
    ]

    return schemas.MonthlyFinancialReport(
        month=month,
        salary_received=salary_received,
        other_income=other_income,
        total_income=total_income,
        total_expenses=total_expenses,
        total_savings_contributions=total_savings_contributions,
        net_change=net_change,
        budget_adherence=budget_adherence,
        top_expenses=top_expenses_list
    )


@router.get('/net-worth', response_model=dict)
def calculate_net_worth(
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Calculate total net worth"""
    # Get all savings
    savings = db.query(models.Saving).filter(
        models.Saving.person_id == current_user.id
    ).all()

    total_savings = sum(s.current_balance for s in savings)

    # Get latest salary remaining amounts
    job_ids = [j.id for j in db.query(models.Job).filter(models.Job.person_id == current_user.id).all()]
    salary_months = db.query(models.SalaryMonth).filter(
        models.SalaryMonth.job_id.in_(job_ids)
    ).order_by(models.SalaryMonth.month.desc()).limit(3).all()

    cash_in_hand = sum(sm.remaining_amount for sm in salary_months if sm.remaining_amount > 0)

    net_worth = total_savings + cash_in_hand

    return {
        "net_worth": net_worth,
        "breakdown": {
            "savings_accounts": total_savings,
            "cash_in_hand": cash_in_hand,
        },
        "savings_by_type": {
            s.account_type: sum(acc.current_balance for acc in savings if acc.account_type == s.account_type)
            for s in savings
        }
    }


@router.get('/spending-trends', response_model=dict)
def get_spending_trends(
        months: int = Query(6, ge=1, le=24, description="Number of months to analyze"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Analyze spending trends over time"""
    trends = []
    today = date.today()

    for i in range(months):
        # Calculate target month
        target_month = today.month - i
        target_year = today.year

        while target_month <= 0:
            target_month += 12
            target_year -= 1

        period = f"{target_year}-{target_month:02d}"
        start_date = date(target_year, target_month, 1)

        if target_month == 12:
            end_date = date(target_year + 1, 1, 1)
        else:
            end_date = date(target_year, target_month + 1, 1)

        # Get expenses for this month
        expenses = db.query(models.Expense).filter(
            models.Expense.person_id == current_user.id,
            models.Expense.date >= start_date,
            models.Expense.date < end_date
        ).all()

        total = sum(exp.amount for exp in expenses)

        # Category breakdown
        by_category = {}
        for exp in expenses:
            cat = exp.category or "uncategorized"
            by_category[cat] = by_category.get(cat, 0) + exp.amount

        trends.append({
            "period": period,
            "total_spent": total,
            "expense_count": len(expenses),
            "by_category": by_category
        })

    # Calculate average monthly spending
    avg_monthly = sum(t["total_spent"] for t in trends) / len(trends) if trends else 0

    return {
        "months_analyzed": months,
        "average_monthly_spending": round(avg_monthly, 2),
        "trends": list(reversed(trends))  # Oldest to newest
    }


@router.get('/category-analysis', response_model=dict)
def analyze_category_spending(
        category: str = Query(..., description="Category to analyze"),
        months: int = Query(3, ge=1, le=12, description="Number of months"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Detailed analysis of spending in a specific category"""
    today = date.today()
    analysis = []

    for i in range(months):
        target_month = today.month - i
        target_year = today.year

        while target_month <= 0:
            target_month += 12
            target_year -= 1

        period = f"{target_year}-{target_month:02d}"
        start_date = date(target_year, target_month, 1)

        if target_month == 12:
            end_date = date(target_year + 1, 1, 1)
        else:
            end_date = date(target_year, target_month + 1, 1)

        expenses = db.query(models.Expense).filter(
            models.Expense.person_id == current_user.id,
            models.Expense.category == category,
            models.Expense.date >= start_date,
            models.Expense.date < end_date
        ).all()

        total = sum(exp.amount for exp in expenses)
        avg = total / len(expenses) if expenses else 0

        analysis.append({
            "period": period,
            "total": total,
            "count": len(expenses),
            "average_expense": round(avg, 2),
            "min": min([e.amount for e in expenses]) if expenses else 0,
            "max": max([e.amount for e in expenses]) if expenses else 0
        })

    overall_avg = sum(a["total"] for a in analysis) / months if analysis else 0

    return {
        "category": category,
        "months_analyzed": months,
        "overall_average_monthly": round(overall_avg, 2),
        "monthly_breakdown": list(reversed(analysis))
    }


@router.get('/savings-growth', response_model=dict)
def analyze_savings_growth(
        months: int = Query(6, ge=1, le=24, description="Number of months"),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Analyze savings growth over time"""
    savings_accounts = db.query(models.Saving).filter(
        models.Saving.person_id == current_user.id
    ).all()

    growth_by_account = {}

    for saving in savings_accounts:
        transactions = db.query(models.SavingTransaction).filter(
            models.SavingTransaction.saving_id == saving.id
        ).order_by(models.SavingTransaction.transaction_date.desc()).all()

        monthly_balances = []
        today = date.today()

        for i in range(months):
            target_month = today.month - i
            target_year = today.year

            while target_month <= 0:
                target_month += 12
                target_year -= 1

            period = f"{target_year}-{target_month:02d}"

            # Find balance at end of this month
            end_date = date(target_year, target_month + 1, 1) if target_month < 12 else date(target_year + 1, 1, 1)

            # Get last transaction before end_date
            last_transaction = db.query(models.SavingTransaction).filter(
                models.SavingTransaction.saving_id == saving.id,
                models.SavingTransaction.transaction_date < end_date
            ).order_by(models.SavingTransaction.transaction_date.desc()).first()

            balance = last_transaction.balance_after if last_transaction else saving.initial_amount

            monthly_balances.append({
                "period": period,
                "balance": balance
            })

        growth_by_account[saving.account_name] = list(reversed(monthly_balances))

    return {
        "months_analyzed": months,
        "accounts": growth_by_account,
        "current_total_savings": sum(s.current_balance for s in savings_accounts)
    }


@router.get('/income-vs-expenses', response_model=dict)
def compare_income_expenses(
        months: int = Query(6, ge=1, le=24),
        db: Session = Depends(get_db),
        current_user: models.Person = Depends(get_current_user)
):
    """Compare income vs expenses over time"""
    comparison = []
    today = date.today()

    for i in range(months):
        target_month = today.month - i
        target_year = today.year

        while target_month <= 0:
            target_month += 12
            target_year -= 1

        period = f"{target_year}-{target_month:02d}"
        start_date = date(target_year, target_month, 1)

        if target_month == 12:
            end_date = date(target_year + 1, 1, 1)
        else:
            end_date = date(target_year, target_month + 1, 1)

        # Calculate income
        job_ids = [j.id for j in db.query(models.Job).filter(models.Job.person_id == current_user.id).all()]
        salary = db.query(models.SalaryMonth).filter(
            models.SalaryMonth.job_id.in_(job_ids),
            models.SalaryMonth.month == period
        ).all()
        salary_income = sum(s.net_amount for s in salary)

        other_income = db.query(models.IncomeSource).filter(
            models.IncomeSource.person_id == current_user.id,
            models.IncomeSource.received_date >= start_date,
            models.IncomeSource.received_date < end_date
        ).all()
        other_income_total = sum(inc.amount for inc in other_income)

        total_income = salary_income + other_income_total

        # Calculate expenses
        expenses = db.query(models.Expense).filter(
            models.Expense.person_id == current_user.id,
            models.Expense.date >= start_date,
            models.Expense.date < end_date
        ).all()
        total_expenses = sum(exp.amount for exp in expenses)

        net = total_income - total_expenses
        savings_rate = (net / total_income * 100) if total_income > 0 else 0

        comparison.append({
            "period": period,
            "income": total_income,
            "expenses": total_expenses,
            "net": net,
            "savings_rate": round(savings_rate, 2)
        })

    return {
        "months_analyzed": months,
        "comparison": list(reversed(comparison))
    }
