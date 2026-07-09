import datetime as _dt
from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class JobBase(BaseModel):
    name: str = Field(..., description="Job title", min_length=1, max_length=200)
    company: Optional[str] = Field(None, description="Company name", max_length=200)
    department: Optional[str] = Field(None, description="Department", max_length=100)
    salary: float = Field(..., description="Monthly salary amount", gt=0)
    currency: str = Field(default="UZS", description="Currency code")
    start_date: date = Field(..., description="Employment start date")
    end_date: Optional[date] = Field(None, description="Employment end date")
    employment_type: str = Field(default="full-time",
                                 description="Employment type: full-time, part-time, freelance, contract")
    active: bool = Field(default=True, description="Is this job currently active")
    notes: Optional[str] = Field(None, description="Additional notes")


class JobCreate(JobBase):
    """Create a new job"""
    person_id: int = Field(..., description="ID of the person who owns this job")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Programming Instructor",
                "company": "Tech Academy",
                "department": "Education",
                "salary": 5000000,
                "currency": "UZS",
                "start_date": "2026-01-01",
                "employment_type": "full-time",
                "active": True,
                "person_id": 1
            }
        }
    )


class JobUpdate(BaseModel):
    """Update existing job - all fields optional"""
    name: Optional[str] = Field(None)
    company: Optional[str] = Field(None)
    department: Optional[str] = Field(None)
    salary: Optional[float] = Field(None, gt=0)
    currency: Optional[str] = Field(None)
    end_date: Optional[date] = Field(None)
    employment_type: Optional[str] = Field(None)
    active: Optional[bool] = Field(None)
    notes: Optional[str] = Field(None)
    gennis_username: Optional[str] = Field(None, max_length=120)
    gennis_sync_enabled: Optional[bool] = Field(None)


class Job(JobBase):
    """Job response"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    person_id: int
    deleted: bool = False
    gennis_username: Optional[str] = None
    gennis_sync_enabled: bool = False
    gennis_last_synced_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class SalaryMonthBase(BaseModel):
    month: str = Field(..., description="Month in YYYY-MM format", pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    salary_amount: float = Field(..., description="Gross salary", gt=0)
    deductions: float = Field(default=0.0, description="Total deductions (tax, insurance)", ge=0)
    net_amount: float = Field(..., description="Net take-home pay", gt=0)
    received_date: Optional[date] = Field(None, description="Date salary was received")

    @field_validator("received_date", mode="before")
    @classmethod
    def _blank_received_date_to_none(cls, v):
        if isinstance(v, str) and v.strip() == "":
            return None
        return v


class SalaryMonthCreate(SalaryMonthBase):
    """Create a new salary month record"""
    job_id: int = Field(..., description="ID of the job this salary belongs to")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "job_id": 1,
                "month": "2026-01",
                "salary_amount": 5000000,
                "deductions": 500000,
                "net_amount": 4500000,
                "received_date": "2026-01-05"
            }
        }
    )


class SalaryMonthUpdate(BaseModel):
    """Update salary month"""
    salary_amount: Optional[float] = Field(None, gt=0)
    deductions: Optional[float] = Field(None, ge=0)
    net_amount: Optional[float] = Field(None, gt=0)
    received_date: Optional[date] = Field(None)

    @field_validator("received_date", mode="before")
    @classmethod
    def _blank_received_date_to_none(cls, v):
        if isinstance(v, str) and v.strip() == "":
            return None
        return v


class SalaryMonth(SalaryMonthBase):
    """Salary month response with calculated fields"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int
    person_id: int
    total_spent: float = Field(default=0.0, description="Total amount spent from this salary")
    remaining_amount: float = Field(default=0.0, description="Remaining amount from this salary")
    deleted: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None


class SalaryMonthWithJob(SalaryMonth):
    """Salary month with associated job info"""
    job_name: Optional[str] = None
    company: Optional[str] = None


class SalaryMonthGenerateResponse(BaseModel):
    """Response for bulk salary month generation"""
    created_count: int
    skipped_count: int
    created: List[SalaryMonth]
    skipped_months: List[str] = Field(description="Months that already had records")


class ExpenseBase(BaseModel):
    name: str = Field(..., description="Expense name/title", min_length=1, max_length=200)
    description: Optional[str] = Field(None, description="Detailed description")
    amount: float = Field(..., description="Expense amount", gt=0)
    currency: str = Field(default="UZS", description="Currency code")
    category: str = Field(...,
                          description="Category: food, transport, education, entertainment, bills, health, shopping, personal, family, other")
    subcategory: Optional[str] = Field(None, description="Subcategory for more specific classification")
    payment_type: Optional[str] = Field(None, description="Payment type: cash, card, transfer, crypto")
    payment_method: Optional[str] = Field(None, description="Specific card/wallet name")
    date: _dt.date = Field(..., description="Date of expense")
    is_recurring: bool = Field(default=False, description="Is this a recurring expense")
    recurrence_frequency: Optional[str] = Field(None, description="Frequency: monthly, weekly, yearly")
    is_essential: bool = Field(default=False, description="Is this an essential expense")
    receipt_photo: Optional[str] = Field(None, description="URL/path to receipt photo")
    location: Optional[str] = Field(None, description="Location where expense occurred")
    tags: Optional[str] = Field(None, description="Tags as JSON array string")
    source: Literal["salary", "savings", "other"] = Field(default="salary", description="Expense source: salary, savings, other")


class ExpenseCreate(ExpenseBase):
    """Create a new expense"""
    person_id: int = Field(..., description="ID of the person")
    salary_month_id: Optional[int] = Field(None, description="ID of the salary month (if applicable)")
    saving_id: Optional[int] = Field(None, description="ID of the savings account (required when source=savings)")

    @model_validator(mode='after')
    def validate_source_fields(self):
        if self.source == "savings":
            if not self.saving_id:
                raise ValueError("saving_id is required when source is 'savings'")
        else:
            if self.saving_id is not None:
                raise ValueError(f"saving_id must not be provided when source is '{self.source}'")
        return self

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Monthly Rent",
                "amount": 1500000,
                "currency": "UZS",
                "category": "bills",
                "subcategory": "rent",
                "payment_type": "transfer",
                "date": "2026-01-01",
                "is_recurring": True,
                "recurrence_frequency": "monthly",
                "is_essential": True,
                "person_id": 1,
                "salary_month_id": 1
            }
        }
    )


class ExpenseUpdate(BaseModel):
    """Update existing expense - all fields optional"""
    name: Optional[str] = Field(None)
    description: Optional[str] = Field(None)
    amount: Optional[float] = Field(None, gt=0)
    currency: Optional[str] = Field(None)
    category: Optional[str] = Field(None)
    subcategory: Optional[str] = Field(None)
    payment_type: Optional[str] = Field(None)
    payment_method: Optional[str] = Field(None)
    date: Optional[_dt.date] = Field(None)
    is_recurring: Optional[bool] = Field(None)
    recurrence_frequency: Optional[str] = Field(None)
    is_essential: Optional[bool] = Field(None)
    receipt_photo: Optional[str] = Field(None)
    location: Optional[str] = Field(None)
    tags: Optional[str] = Field(None)
    source: Optional[Literal["salary", "savings", "other"]] = Field(None, description="Expense source: salary, savings, other")


class Expense(ExpenseBase):
    """Expense response"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    person_id: int
    salary_month_id: Optional[int] = None
    saving_id: Optional[int] = None
    saving_transaction_id: Optional[int] = None
    deleted: Optional[bool] = Field(default=False)
    created_at: datetime
    updated_at: Optional[datetime] = None


class GennisSalaryPayment(BaseModel):
    """A single Gennis CRM payment mirrored into life_tracker. Read-only."""
    model_config = ConfigDict(from_attributes=True)

    id: int
    salary_month_id: int
    gennis_payment_id: int
    gennis_salary_location_id: int
    amount: float
    reason: Optional[str] = None
    payment_date: Optional[date] = None
    payment_type_id: Optional[int] = None
    payment_type: Optional[str] = None
    created_at: datetime


class IncomeSourceBase(BaseModel):
    source_name: str = Field(..., description="Name of income source", min_length=1, max_length=200)
    source_type: str = Field(..., description="Type: freelance, investment, rental, side-business, gift, other")
    amount: float = Field(..., description="Income amount", gt=0)
    currency: str = Field(default="UZS", description="Currency code")
    frequency: Optional[str] = Field(None, description="Frequency: one-time, monthly, quarterly, irregular")
    received_date: date = Field(..., description="Date income was received")
    description: Optional[str] = Field(None, description="Additional details")


class IncomeSourceCreate(IncomeSourceBase):
    """Create a new income source"""
    person_id: int = Field(..., description="ID of the person")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "source_name": "Freelance Web Development",
                "source_type": "freelance",
                "amount": 1000000,
                "currency": "UZS",
                "frequency": "one-time",
                "received_date": "2026-01-15",
                "description": "Built e-commerce website",
                "person_id": 1
            }
        }
    )


class IncomeSourceUpdate(BaseModel):
    """Update income source"""
    source_name: Optional[str] = Field(None)
    source_type: Optional[str] = Field(None)
    amount: Optional[float] = Field(None, gt=0)
    currency: Optional[str] = Field(None)
    frequency: Optional[str] = Field(None)
    received_date: Optional[date] = Field(None)
    description: Optional[str] = Field(None)

    @field_validator("received_date", mode="before")
    @classmethod
    def _blank_received_date_to_none(cls, v):
        if isinstance(v, str) and v.strip() == "":
            return None
        return v


class IncomeSource(IncomeSourceBase):
    """Income source response"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    person_id: int
    deleted: Optional[bool] = Field(default=False)
    created_at: datetime


class SavingBase(BaseModel):
    account_name: str = Field(..., description="Account name", min_length=1, max_length=200)
    account_type: str = Field(..., description="Type: savings, investment, crypto, real-estate, other")
    initial_amount: float = Field(..., description="Initial deposit amount", ge=0)
    target_amount: Optional[float] = Field(None, description="Target savings goal", ge=0)
    currency: str = Field(default="UZS", description="Currency code")
    interest_rate: Optional[float] = Field(None, description="Annual interest rate (%)", ge=0)
    start_date: date = Field(..., description="Account opening date")
    maturity_date: Optional[date] = Field(None, description="Maturity date (if applicable)")
    risk_level: Optional[str] = Field(None, description="Risk level: low, medium, high")
    platform: Optional[str] = Field(None, description="Bank/broker name", max_length=200)
    notes: Optional[str] = Field(None, description="Additional notes")


class SavingCreate(SavingBase):
    """Create a new saving account"""
    model_config = ConfigDict(
        extra="forbid",
        json_schema_extra={
            "example": {
                "account_name": "Emergency Fund",
                "account_type": "savings",
                "initial_amount": 5000000,
                "target_amount": 20000000,
                "currency": "UZS",
                "interest_rate": 12.0,
                "start_date": "2026-01-01",
                "risk_level": "low",
                "platform": "National Bank"
            }
        }
    )


class SavingUpdate(BaseModel):
    """Update saving account"""
    account_name: Optional[str] = Field(None)
    account_type: Optional[str] = Field(None)
    target_amount: Optional[float] = Field(None, ge=0)
    interest_rate: Optional[float] = Field(None, ge=0)
    maturity_date: Optional[date] = Field(None)
    risk_level: Optional[str] = Field(None)
    platform: Optional[str] = Field(None)
    notes: Optional[str] = Field(None)


class Saving(SavingBase):
    """Saving account response"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    person_id: int
    current_balance: float
    deleted: Optional[bool] = Field(default=False)
    created_at: datetime
    updated_at: Optional[datetime] = None


class SavingTransactionBase(BaseModel):
    transaction_type: str = Field(..., description="Type: deposit, withdrawal, interest")
    amount: float = Field(..., description="Transaction amount", gt=0)
    transaction_date: date = Field(..., description="Transaction date")
    description: Optional[str] = Field(None, description="Transaction description")


class SavingTransactionCreate(SavingTransactionBase):
    """Create a new saving transaction (saving_id taken from URL path)"""
    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "transaction_type": "deposit",
                "amount": 1000000,
                "transaction_date": "2026-01-15",
                "description": "Monthly savings contribution"
            }
        }
    )


class SavingDepositWithdrawBody(BaseModel):
    """Body for deposit and withdraw endpoints"""
    amount: float = Field(..., gt=0, description="Amount")
    transaction_date: Optional[date] = Field(None, description="Transaction date (defaults to today)")
    description: Optional[str] = Field(None, description="Transaction description")


class SavingTransactionUpdate(BaseModel):
    """Update saving transaction"""
    description: Optional[str] = Field(None)


class SavingTransaction(SavingTransactionBase):
    """Saving transaction response"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    saving_id: int
    balance_before: float
    balance_after: float
    created_at: datetime


class SavingMonthlySummaryItem(BaseModel):
    period: str
    total_deposited: float
    total_withdrawn: float
    interest_earned: float
    net_change: float
    closing_balance: float


class SavingAccountMonthlySummary(BaseModel):
    saving_id: int
    account_name: str
    account_type: str
    currency: str
    months_analyzed: int
    summaries: List[SavingMonthlySummaryItem]


class SavingsAggregatedMonthlySummaryItem(BaseModel):
    period: str
    total_deposited: float
    total_withdrawn: float
    interest_earned: float
    net_change: float
    total_closing_balance: float
    by_account: dict


class SavingsAggregatedMonthlySummary(BaseModel):
    months_analyzed: int
    summaries: List[SavingsAggregatedMonthlySummaryItem]


class BudgetBase(BaseModel):
    period: str = Field(..., description="Period in YYYY-MM or YYYY-WW format")
    period_type: str = Field(default="monthly", description="Period type: monthly, weekly")
    category: str = Field(..., description="Budget category (same as expense categories)")
    allocated_amount: float = Field(..., description="Budgeted amount", gt=0)
    notes: Optional[str] = Field(None, description="Budget notes")


class BudgetCreate(BudgetBase):
    """Create a new budget"""
    person_id: int = Field(..., description="ID of the person")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "person_id": 1,
                "period": "2026-01",
                "period_type": "monthly",
                "category": "food",
                "allocated_amount": 2000000,
                "notes": "Monthly food budget"
            }
        }
    )


class BudgetUpdate(BaseModel):
    """Update budget"""
    allocated_amount: Optional[float] = Field(None, gt=0)
    notes: Optional[str] = Field(None)


class Budget(BudgetBase):
    """Budget response with calculated fields"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    person_id: int
    spent_amount: float = Field(default=0.0, description="Amount spent in this category")
    remaining_amount: float = Field(default=0.0, description="Remaining budget")
    deleted: Optional[bool] = Field(default=False)
    created_at: datetime
    updated_at: Optional[datetime] = None


class FinancialSummary(BaseModel):
    """Summary of financial data for a period"""
    period: str
    total_income: float
    total_expenses: float
    savings_funded_total: Optional[float] = 0.0
    net_income: float
    total_savings: float
    expense_by_category: dict
    savings_rate: float

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "period": "2026-01",
                "total_income": 5000000,
                "total_expenses": 3500000,
                "net_income": 1500000,
                "total_savings": 10000000,
                "expense_by_category": {
                    "food": 800000,
                    "transport": 300000,
                    "bills": 1500000,
                    "entertainment": 200000
                },
                "savings_rate": 30.0
            }
        }
    )


class MonthlyFinancialReport(BaseModel):
    """Comprehensive monthly financial report"""
    month: str
    salary_received: float
    other_income: float
    total_income: float
    total_expenses: float
    savings_funded_total: Optional[float] = 0.0
    total_savings_contributions: float
    net_change: float
    budget_adherence: dict
    top_expenses: List[dict]

    model_config = ConfigDict(from_attributes=True)
