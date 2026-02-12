from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base
from sqlalchemy.ext.hybrid import hybrid_property


class Person(Base):
    __tablename__ = "person"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(120), unique=True, nullable=False, index=True)
    timezone = Column(String(50), default="Asia/Tashkent")

    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    last_login = Column(DateTime, nullable=True)
    failed_login_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime, nullable=True)

    auth_provider = Column(String(20), default="google")
    google_id = Column(String(255), unique=True, nullable=True, index=True)
    profile_photo_url = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    jobs = relationship(
        "Job",
        back_populates="person",
        cascade="all, delete-orphan"
    )
    expenses = relationship(
        "Expense",
        back_populates="person",
        cascade="all, delete-orphan"
    )
    income_sources = relationship(
        "IncomeSource",
        back_populates="person",
        cascade="all, delete-orphan"
    )
    savings = relationship(
        "Saving",
        back_populates="person",
        cascade="all, delete-orphan"
    )
    budgets = relationship(
        "Budget",
        back_populates="person",
        cascade="all, delete-orphan"
    )
    goals = relationship(
        "Goal",
        back_populates="person",
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<Person(id={self.id}, email={self.email}, name={self.name})>"

    @property
    def is_locked(self) -> bool:
        """Check if account is locked due to failed login attempts"""
        if self.locked_until is None:
            return False
        return datetime.utcnow() < self.locked_until


class Goal(Base):
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)

    name = Column(String(200), nullable=False)
    description = Column(Text)
    category = Column(String(50))  # Learning, Health, Career

    target_value = Column(Float)
    current_value = Column(Float, default=0)
    # unit = Column(String(20))  # "score", "%", "days"

    start_date = Column(Date)
    target_date = Column(Date)

    status = Column(String(20), default="active")  # active, completed, paused
    priority = Column(String(20), default="medium")  # high, medium, low

    _stored_percentage = Column(Float, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    person = relationship("Person", back_populates="goals")
    tasks = relationship("Task", back_populates="goal", cascade="all, delete-orphan")
    progress_logs = relationship("ProgressLog", back_populates="goal", cascade="all, delete-orphan")

    @hybrid_property
    def percentage(self):
        """
        Hybrid property that returns stored percentage.
        This allows backward compatibility with existing code.
        """
        return self._stored_percentage if self._stored_percentage is not None else 0.0

    @percentage.setter
    def percentage(self, value):
        """Setter for the percentage property"""
        self._stored_percentage = value

    def calculate_task_percentage(self):
        """
        Calculate percentage based on completed tasks.
        This is a method that can be called when needed for real-time calculation.
        """
        if not self.tasks:
            return 0.0

        total_tasks = len(self.tasks)
        completed_tasks = sum(1 for task in self.tasks if task.completed)

        if total_tasks == 0:
            return 0.0
        self.percentage = round((completed_tasks / total_tasks) * 100, 2)

        return self.percentage

    def calculate_manual_percentage(self):
        """
        Calculate percentage based on target_value and current_value.
        Returns None if target_value is not set.
        """
        if not self.target_value or self.target_value == 0:
            return None

        percentage = (self.current_value / self.target_value) * 100
        return round(min(percentage, 100.0), 2)


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=False)

    name = Column(String(200), nullable=False)
    description = Column(Text)

    task_type = Column(String(20), default="daily")  # daily, weekly, one-time
    due_date = Column(Date)

    completed = Column(Boolean, default=False)
    completed_at = Column(DateTime)

    priority = Column(String(20), default="medium")
    estimated_duration = Column(Integer)  # minutes

    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    goal = relationship("Goal", back_populates="tasks")
    progress_log_tasks = relationship("ProgressLogTask", back_populates="task", cascade="all, delete-orphan")
    sub_tasks = relationship("SubTasks", back_populates="task", cascade="all, delete-orphan")


class SubTasks(Base):
    __tablename__ = "sub_tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)

    name = Column(String(200), nullable=False)
    description = Column(Text)

    completed = Column(Boolean, default=False)
    completed_at = Column(DateTime)

    priority = Column(String(20), default="medium")
    estimated_duration = Column(Integer)  # minutes

    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship("Task", back_populates="sub_tasks")


class ProgressLog(Base):
    __tablename__ = "progress_logs"
    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=False)
    log_date = Column(Date, nullable=False, default=datetime.utcnow)
    value_logged = Column(Float)
    notes = Column(Text)
    mood = Column(String(20))  # great, good, okay, struggling
    energy_level = Column(Integer)  # 1-10
    created_at = Column(DateTime, default=datetime.utcnow)
    goal = relationship("Goal", back_populates="progress_logs")


class ProgressLogTask(Base):
    __tablename__ = "progress_log_tasks"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    log_date = Column(Date, nullable=False, default=datetime.utcnow)
    value_logged = Column(Float)
    notes = Column(Text)
    mood = Column(String(20))
    energy_level = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    task = relationship("Task", back_populates="progress_log_tasks")


class Job(Base):
    """Income sources from employment"""
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)

    # Job details
    name = Column(String(200), nullable=False)  # Job title
    company = Column(String(200))
    department = Column(String(100))

    # Salary information
    salary = Column(Float, nullable=False)  # Monthly amount
    currency = Column(String(10), default="UZS")

    # Employment period
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)

    # Employment type
    employment_type = Column(String(50), default="full-time")  # full-time, part-time, freelance, contract
    active = Column(Boolean, default=True)

    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    person = relationship("Person", back_populates="jobs")
    salary_months = relationship(
        "SalaryMonth",
        back_populates="job",
        cascade="all, delete-orphan"
    )


class SalaryMonth(Base):
    """Track monthly salary instances"""
    __tablename__ = "salary_months"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)

    # Month identifier
    month = Column(String(7), nullable=False)  # Format: YYYY-MM (e.g., "2026-01")

    # Salary breakdown
    salary_amount = Column(Float, nullable=False)  # Gross salary
    deductions = Column(Float, default=0.0)  # Taxes, insurance, etc.
    net_amount = Column(Float, nullable=False)  # Take-home pay

    # Payment tracking
    received_date = Column(Date)

    # Calculated fields (will be computed from expenses)
    total_spent = Column(Float, default=0.0)
    remaining_amount = Column(Float, default=0.0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    job = relationship("Job", back_populates="salary_months")
    expenses = relationship(
        "Expense",
        back_populates="salary_month",
        cascade="all, delete-orphan"
    )


class Expense(Base):
    """Track all spending"""
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)
    salary_month_id = Column(Integer, ForeignKey("salary_months.id"), nullable=True)

    # Expense details
    name = Column(String(200), nullable=False)
    description = Column(Text)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default="UZS")

    # Categorization
    category = Column(String(50),
                      nullable=False)  # food, transport, education, entertainment, bills, health, shopping, other
    subcategory = Column(String(50))  # More specific categorization

    # Payment information
    payment_type = Column(String(20))  # cash, card, transfer, crypto
    payment_method = Column(String(100))  # Specific card/wallet name

    # Date and recurrence
    date = Column(Date, nullable=False, index=True)
    is_recurring = Column(Boolean, default=False)
    recurrence_frequency = Column(String(20))  # monthly, weekly, yearly

    # Classification
    is_essential = Column(Boolean, default=False)  # Necessity vs luxury

    # Additional data
    receipt_photo = Column(String(500))  # URL/path to receipt image
    location = Column(String(200))
    tags = Column(Text)  # JSON array of strings, stored as text

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    person = relationship("Person", back_populates="expenses")
    salary_month = relationship("SalaryMonth", back_populates="expenses")


class IncomeSource(Base):
    """Track additional income beyond salary (freelance, passive income, etc.)"""
    __tablename__ = "income_sources"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)

    # Income details
    source_name = Column(String(200), nullable=False)
    source_type = Column(String(50), nullable=False)  # freelance, investment, rental, side-business, gift, other
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default="UZS")

    # Frequency and timing
    frequency = Column(String(20))  # one-time, monthly, quarterly, irregular
    received_date = Column(Date, nullable=False)

    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    person = relationship("Person", back_populates="income_sources")


class Saving(Base):
    """Track savings and investments"""
    __tablename__ = "savings"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)

    # Account details
    account_name = Column(String(200), nullable=False)
    account_type = Column(String(50), nullable=False)  # savings, investment, crypto, real-estate, other

    # Financial details
    current_balance = Column(Float, nullable=False)
    initial_amount = Column(Float, nullable=False)
    target_amount = Column(Float)
    currency = Column(String(10), default="UZS")

    # Investment details
    interest_rate = Column(Float)  # Annual interest rate if applicable
    start_date = Column(Date, nullable=False)
    maturity_date = Column(Date)  # If applicable

    # Risk and platform
    risk_level = Column(String(20))  # low, medium, high
    platform = Column(String(200))  # Bank name, broker, exchange, etc.

    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    person = relationship("Person", back_populates="savings")
    transactions = relationship(
        "SavingTransaction",
        back_populates="saving",
        cascade="all, delete-orphan"
    )


class SavingTransaction(Base):
    """Track deposits and withdrawals from savings accounts"""
    __tablename__ = "saving_transactions"

    id = Column(Integer, primary_key=True, index=True)
    saving_id = Column(Integer, ForeignKey("savings.id"), nullable=False)

    # Transaction details
    transaction_type = Column(String(20), nullable=False)  # deposit, withdrawal, interest
    amount = Column(Float, nullable=False)
    transaction_date = Column(Date, nullable=False)

    # Balance tracking
    balance_before = Column(Float, nullable=False)
    balance_after = Column(Float, nullable=False)

    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    saving = relationship("Saving", back_populates="transactions")


class Budget(Base):
    """Monthly/weekly spending limits by category"""
    __tablename__ = "budgets"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)

    # Period identification
    period = Column(String(10), nullable=False, index=True)  # Format: YYYY-MM or YYYY-WW
    period_type = Column(String(10), default="monthly")  # monthly, weekly

    # Budget details
    category = Column(String(50), nullable=False)  # Same as Expense categories
    allocated_amount = Column(Float, nullable=False)

    # Calculated fields (computed from expenses)
    spent_amount = Column(Float, default=0.0)
    remaining_amount = Column(Float, default=0.0)

    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    person = relationship("Person", back_populates="budgets")
