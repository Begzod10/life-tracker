from pydantic import BaseModel, model_validator
import datetime as _dt
from datetime import date, datetime
from typing import Optional, List, Literal
from pydantic import BaseModel, Field, ConfigDict, EmailStr


# ========== PERSON SCHEMAS ==========#

class PersonBase(BaseModel):
    name: str = Field(..., description="Full name", min_length=1, max_length=100)
    email: EmailStr = Field(..., description="Email address")
    timezone: str = Field(default="Asia/Tashkent", description="Timezone")


class PersonCreate(PersonBase):
    password: str = Field(..., description="Password", min_length=6)


class PersonUpdate(BaseModel):
    name: Optional[str] = Field(None)
    email: Optional[EmailStr] = Field(None)
    timezone: Optional[str] = Field(None)


class Person(PersonBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime


# ========== GOAL SCHEMAS ==========
class GoalBase(BaseModel):
    name: str = Field(..., description="Goal name")
    description: Optional[str] = Field(None)
    category: Optional[str] = Field(None, description="Category: Learning, Health, Career, Finance, Personal")
    target_value: Optional[float] = Field(None, description="Target value to achieve")
    current_value: float = Field(default=0, description="Current progress value")
    start_date: Optional[date] = Field(None)
    target_date: Optional[date] = Field(None)
    priority: str = Field(default="medium", description="Priority: high, medium, low")
    color: Optional[str] = Field(None)


class GoalCreate(GoalBase):
    """Create a new goal"""
    person_id: int = Field(..., description="ID of the person who owns this goal")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "IELTS 6.5",
                "description": "Achieve IELTS band 6.5 by end of Q1 2026",
                "category": "Learning",
                "target_value": 6.5,
                "current_value": 5.5,
                "start_date": "2026-01-01",
                "target_date": "2026-03-31",
                "priority": "high",
                "person_id": 1
            }
        }
    )


class GoalUpdate(BaseModel):
    """Update existing goal - all fields optional"""
    name: Optional[str] = Field(None)
    description: Optional[str] = None
    target_value: Optional[float] = Field(None)
    status: Optional[str] = Field(None, description="Status: active, completed, paused")
    priority: Optional[str] = Field(None)
    category: Optional[str] = Field(None)
    start_date: Optional[date] = Field(None)
    target_date: Optional[date] = Field(None)
    color: Optional[str] = Field(None)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "current_value": 6.0,
                "status": "active"
            }
        }
    )


class Goal(GoalBase):
    """Goal response with calculated fields"""
    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": 1,
                "person_id": 1,
                "name": "IELTS 6.5",
                "description": "Achieve IELTS band 6.5 by end of Q1 2026",
                "category": "Learning",
                "target_value": 6.5,
                "current_value": 5.5,
                "start_date": "2026-01-01",
                "target_date": "2026-03-31",
                "priority": "high",
                "status": "active",
                "created_at": "2026-01-12T10:30:00Z",
                "updated_at": "2026-01-12T15:45:00Z",
                "progress_percentage": 84.6,
                "task_completion_percentage": 75.0
            }
        }
    )

    id: int
    person_id: int
    status: str
    deleted: Optional[bool] = Field(default=False)
    created_at: datetime
    updated_at: Optional[datetime] = None
    percentage: float = Field(default=0, description="Stored progress percentage")


class GoalWithStats(Goal):
    """Goal response with detailed statistics"""
    total_tasks: int = Field(default=0, description="Total number of tasks")
    completed_tasks: int = Field(default=0, description="Number of completed tasks")
    task_completion_percentage: float = Field(default=0, description="Percentage of tasks completed")
    manual_percentage: Optional[float] = Field(None, description="Manual progress based on target/current value")


# ========== MILESTONE SCHEMAS ==========

class MilestoneBase(BaseModel):
    name: str = Field(..., description="Milestone name", min_length=1, max_length=200)
    description: Optional[str] = Field(None, description="Milestone description")
    target_date: Optional[date] = Field(None, description="Target date to achieve this milestone")
    completion_percentage: float = Field(default=0.0, description="Goal percentage needed to hit this milestone")
    reward_description: Optional[str] = Field(None, description="Reward for achieving this milestone")
    order_index: int = Field(default=0, description="Display order among milestones")


class MilestoneCreate(MilestoneBase):
    goal_id: int = Field(..., description="Goal ID this milestone belongs to")


class Milestone(MilestoneBase):
    id: int
    goal_id: int
    achieved: bool = Field(default=False)
    achieved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class MilestoneUpdate(BaseModel):
    name: Optional[str] = Field(None)
    description: Optional[str] = Field(None)
    target_date: Optional[date] = Field(None)
    completion_percentage: Optional[float] = Field(None)
    reward_description: Optional[str] = Field(None)
    order_index: Optional[int] = Field(None)
    achieved: Optional[bool] = Field(None)


# ========== TASK SCHEMAS ==========
class TaskBase(BaseModel):
    name: str = Field(..., description="Task name")
    description: Optional[str] = Field(None, description="Task description")
    task_type: str = Field(default="daily", description="Task type: daily, weekly, monthly, one-time")
    due_date: Optional[date] = Field(None, description="Due date")
    priority: str = Field(default="medium", description="Priority: high, medium, low")
    estimated_duration: Optional[int] = Field(None, description="Estimated duration in minutes")
    value: Optional[float] = Field(None, description="Value contributed to goal's current_value when completed")
    is_recurring: Optional[bool] = Field(default=False, description="Task resets daily and tracks completions instead of closing")


class TaskCreate(TaskBase):
    goal_id: Optional[int] = Field(None, description="Goal ID this task belongs to")


class Task(TaskBase):
    id: int = Field(..., description="Task ID")
    goal_id: Optional[int] = Field(None, description="Goal ID")
    completed: bool = Field(default=False, description="Task completion status")
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")
    value: Optional[float] = Field(None, description="Value contributed to goal's current_value when completed")
    deleted: Optional[bool] = Field(default=False, description="Soft delete flag")
    created_at: datetime = Field(..., description="Creation timestamp")

    model_config = ConfigDict(from_attributes=True)


class TaskUpdate(BaseModel):
    name: Optional[str] = Field(None, description="Task name")
    description: Optional[str] = Field(None, description="Task description")
    task_type: Optional[str] = Field(None, description="Task type: daily, weekly, monthly")
    due_date: Optional[date] = Field(None, description="Due date")
    priority: Optional[str] = Field(None, description="Priority: high, medium, low")
    estimated_duration: Optional[int] = Field(None, description="Estimated duration in minutes")
    completed: Optional[bool] = Field(None, description="Completion status")
    value: Optional[float] = Field(None, description="Value contributed to goal's current_value when completed")
    is_recurring: Optional[bool] = Field(None, description="Toggle recurring mode")
    goal_id: Optional[int] = Field(None, description="Goal to link this task to (None to unlink)")


class RecurringCompletionTask(BaseModel):
    task_id: int
    task_name: str
    priority: str
    completions: list[date]

    model_config = ConfigDict(from_attributes=True)


# ========== SUB TASK SCHEMAS ==========

class SubTaskBase(BaseModel):
    name: str = Field(..., description="Sub task name")
    description: Optional[str] = Field(None, description="Sub task description")
    priority: str = Field(default="medium", description="Priority: high, medium, low")
    estimated_duration: Optional[int] = Field(None, description="Estimated duration in minutes")
    order: int = Field(default=0, description="Display order of the subtask")


class SubTaskCreate(SubTaskBase):
    task_id: int = Field(..., description="Task ID this subtask belongs to")


class SubTask(SubTaskBase):
    id: int = Field(..., description="Sub task ID")
    task_id: int = Field(..., description="Task ID")
    completed: bool = Field(default=False, description="Sub task completion status")
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")
    deleted: Optional[bool] = Field(default=False, description="Soft delete flag")
    created_at: datetime = Field(..., description="Creation timestamp")

    model_config = ConfigDict(from_attributes=True)


class SubTaskUpdate(BaseModel):
    name: Optional[str] = Field(None, description="Sub task name")
    description: Optional[str] = Field(None, description="Sub task description")
    priority: Optional[str] = Field(None, description="Priority: high, medium, low")
    estimated_duration: Optional[int] = Field(None, description="Estimated duration in minutes")
    completed: Optional[bool] = Field(None, description="Completion status")
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")
    order: Optional[int] = Field(None, description="Display order of the subtask")


# ========== PROGRESS LOG SCHEMAS ==========
class ProgressLogBase(BaseModel):
    id: Optional[int] = None
    value_logged: Optional[float] = Field(None, description="Logged value")
    notes: Optional[str] = Field(None, description="Notes about the progress")
    mood: Optional[str] = Field(None, description="Mood: great, good, okay, struggling")
    energy_level: Optional[int] = Field(None, description="Energy level 1-10")


class ProgressLogCreate(ProgressLogBase):
    goal_id: int = Field(..., description="Goal ID")
    log_date: Optional[date] = Field(None, description="Log date")


class ProgressLog(ProgressLogBase):
    id: int = Field(..., description="Progress log ID")
    goal_id: int = Field(..., description="Goal ID")
    log_date: date = Field(..., description="Log date")
    created_at: datetime = Field(..., description="Creation timestamp")

    model_config = ConfigDict(from_attributes=True)


class ProgressLogUpdate(ProgressLogBase):
    value_logged: Optional[float] = Field(None, description="Logged value")


# ======= ProgressLogTask ==========

class ProgressLogTaskCreate(ProgressLogBase):
    task_id: int = Field(..., description="Task ID")
    log_date: Optional[date] = Field(None, description="Log date")


class ProgressTaskLog(ProgressLogBase):
    id: int = Field(..., description="Progress log ID")
    task_id: int = Field(..., description="Task ID")
    log_date: date = Field(..., description="Log date")
    created_at: datetime = Field(..., description="Creation timestamp")

    model_config = ConfigDict(from_attributes=True)


class ProgressLogTaskUpdate(ProgressLogBase):
    value_logged: Optional[float] = Field(None, description="Logged value")
    notes: Optional[str] = Field(None, description="Notes")
    mood: Optional[str] = Field(None, description="Mood")
    energy_level: Optional[int] = Field(None, description="Energy level")


# ========== STATISTICS SCHEMAS ==========

class TaskStatistics(BaseModel):
    """Detailed task statistics for a goal"""
    goal_id: int
    goal_name: str
    total_tasks: int
    completed_tasks: int
    remaining_tasks: int
    high_priority_tasks: int
    high_priority_completed: int
    percentages: dict
    target_value: Optional[float]
    current_value: float
    status: str
    breakdown_by_priority: dict
    breakdown_by_type: dict

    model_config = ConfigDict(from_attributes=True)


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


class Job(JobBase):
    """Job response"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    person_id: int
    deleted: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None


# ==================== SALARY MONTH SCHEMAS ====================

class SalaryMonthBase(BaseModel):
    month: str = Field(..., description="Month in YYYY-MM format", pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    salary_amount: float = Field(..., description="Gross salary", gt=0)
    deductions: float = Field(default=0.0, description="Total deductions (tax, insurance)", ge=0)
    net_amount: float = Field(..., description="Net take-home pay", gt=0)
    received_date: Optional[date] = Field(None, description="Date salary was received")


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


# ==================== EXPENSE SCHEMAS ====================

class ExpenseBase(BaseModel):
    name: str = Field(..., description="Expense name/title", min_length=1, max_length=200)
    description: Optional[str] = Field(None, description="Detailed description")
    amount: float = Field(..., description="Expense amount", gt=0)
    currency: str = Field(default="UZS", description="Currency code")
    category: str = Field(...,
                          description="Category: food, transport, education, entertainment, bills, health, shopping, other")
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


# ==================== INCOME SOURCE SCHEMAS ====================

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


class IncomeSource(IncomeSourceBase):
    """Income source response"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    person_id: int
    deleted: Optional[bool] = Field(default=False)
    created_at: datetime


# ==================== SAVING SCHEMAS ====================

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


# ==================== SAVING TRANSACTION SCHEMAS ====================

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


# ==================== SAVING MONTHLY SUMMARY SCHEMAS ====================

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


# ==================== BUDGET SCHEMAS ====================

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


# ==================== FINANCIAL ANALYTICS SCHEMAS ====================

class FinancialSummary(BaseModel):
    """Summary of financial data for a period"""
    period: str
    total_income: float
    total_expenses: float          # Income-funded expenses only (saving_id IS NULL)
    savings_funded_total: Optional[float] = 0.0  # Expenses paid from savings
    net_income: float
    total_savings: float
    expense_by_category: dict
    savings_rate: float  # Percentage

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
    total_expenses: float                        # Income-funded expenses only
    savings_funded_total: Optional[float] = 0.0  # Expenses paid from savings
    total_savings_contributions: float
    net_change: float
    budget_adherence: dict  # Category -> adherence percentage (uses ALL expenses)
    top_expenses: List[dict]

    model_config = ConfigDict(from_attributes=True)


# ========== TIME BLOCK SCHEMAS ==========
class TimeBlockBase(BaseModel):
    title: str = Field(..., description="Block title", min_length=1, max_length=200)
    description: Optional[str] = Field(None, description="Optional description")
    block_date: date = Field(..., description="Date of the block (YYYY-MM-DD)", alias="date")
    start_time: str = Field(..., description="Start time (HH:MM)")
    end_time: str = Field(..., description="End time (HH:MM)")
    category: str = Field(default="work", description="Category: work, personal, health, learning, social, other")
    color: Optional[str] = Field(None, description="Hex color override")
    task_id: Optional[int] = Field(None, description="Linked task ID")
    is_recurring: bool = Field(default=False, description="Auto-copy to next week via Celery")

    model_config = ConfigDict(populate_by_name=True)


class TimeBlockCreate(TimeBlockBase):
    pass


class TimeBlockUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    description: Optional[str] = None
    date: Optional[date] = None
    start_time: Optional[str] = Field(None)
    end_time: Optional[str] = Field(None)
    category: Optional[str] = None
    color: Optional[str] = None
    is_completed: Optional[bool] = None
    is_recurring: Optional[bool] = None
    task_id: Optional[int] = None


class TimeBlock(TimeBlockBase):
    id: int
    person_id: int
    is_completed: Optional[bool] = False
    is_missed: Optional[bool] = False
    is_recurring: Optional[bool] = False
    deleted: Optional[bool] = False
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ========== DICTIONARY SCHEMAS ==========

class DictionaryWordCreate(BaseModel):
    word: str = Field(..., min_length=1, max_length=200)
    definition: str = Field(..., min_length=1)
    translation: Optional[str] = None
    part_of_speech: Optional[str] = None
    examples: Optional[List[str]] = None
    phonetic: Optional[str] = None
    difficulty: str = Field(default="B1")
    tags: Optional[str] = None


class DictionaryWordUpdate(BaseModel):
    word: Optional[str] = None
    definition: Optional[str] = None
    translation: Optional[str] = None
    part_of_speech: Optional[str] = None
    examples: Optional[List[str]] = None
    phonetic: Optional[str] = None
    difficulty: Optional[str] = None
    tags: Optional[str] = None


class DictionaryWordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    person_id: int
    word: str
    definition: str
    translation: Optional[str] = None
    part_of_speech: Optional[str] = None
    examples: Optional[List[str]] = None
    phonetic: Optional[str] = None
    difficulty: str
    tags: Optional[str] = None
    review_count: int
    correct_count: int
    last_reviewed_at: Optional[datetime] = None
    created_at: datetime


# ========== PRACTICE SCHEMAS ==========

class PracticeSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    mode: str
    total_questions: int
    correct_answers: int
    started_at: datetime
    completed_at: Optional[datetime] = None
