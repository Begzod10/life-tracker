from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)

    name = Column(String(200), nullable=False)
    company = Column(String(200))
    department = Column(String(100))

    salary = Column(Float, nullable=False)
    currency = Column(String(10), default="UZS")

    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)

    employment_type = Column(String(50), default="full-time")
    active = Column(Boolean, default=True)
    deleted = Column(Boolean, default=False)

    notes = Column(Text)
    gennis_username = Column(String(120), nullable=True, index=True)
    gennis_sync_enabled = Column(Boolean, default=False, nullable=False)
    gennis_last_synced_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    person = relationship("Person", back_populates="jobs")
    salary_months = relationship("SalaryMonth", back_populates="job", cascade="all, delete-orphan")


class SalaryMonth(Base):
    __tablename__ = "salary_months"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id"), nullable=False)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)

    month = Column(String(7), nullable=False)

    salary_amount = Column(Float, nullable=False)
    deductions = Column(Float, default=0.0)
    net_amount = Column(Float, nullable=False)

    received_date = Column(Date)

    total_spent = Column(Float, default=0.0)
    remaining_amount = Column(Float, default=0.0)

    deleted = Column(Boolean, default=False)

    gennis_salary_location_id = Column(Integer, nullable=True, unique=True, index=True)
    gennis_debt = Column(Float, nullable=True)
    gennis_fine = Column(Float, nullable=True)
    gennis_status = Column(Boolean, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    job = relationship("Job", back_populates="salary_months")
    person = relationship("Person", back_populates="salary_months")
    expenses = relationship("Expense", back_populates="salary_month", cascade="all, delete-orphan")
    gennis_payments = relationship(
        "GennisSalaryPayment",
        back_populates="salary_month",
        cascade="all, delete-orphan",
    )


class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)
    salary_month_id = Column(Integer, ForeignKey("salary_months.id"), nullable=True)

    name = Column(String(200), nullable=False)
    description = Column(Text)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default="UZS")

    category = Column(String(50), nullable=False)
    subcategory = Column(String(50))

    payment_type = Column(String(20))
    payment_method = Column(String(100))

    date = Column(Date, nullable=False, index=True)
    is_recurring = Column(Boolean, default=False)
    recurrence_frequency = Column(String(20))

    is_essential = Column(Boolean, default=False)

    source = Column(String(20), default="salary")
    saving_id = Column(Integer, ForeignKey("savings.id"), nullable=True)
    saving_transaction_id = Column(Integer, ForeignKey("saving_transactions.id"), nullable=True)

    receipt_photo = Column(String(500))
    location = Column(String(200))
    tags = Column(Text)

    deleted = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    person = relationship("Person", back_populates="expenses")
    salary_month = relationship("SalaryMonth", back_populates="expenses")


class IncomeSource(Base):
    __tablename__ = "income_sources"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)

    source_name = Column(String(200), nullable=False)
    source_type = Column(String(50), nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String(10), default="UZS")

    frequency = Column(String(20))
    received_date = Column(Date, nullable=False)

    description = Column(Text)
    deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    person = relationship("Person", back_populates="income_sources")


class Saving(Base):
    __tablename__ = "savings"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)

    account_name = Column(String(200), nullable=False)
    account_type = Column(String(50), nullable=False)

    current_balance = Column(Float, nullable=False)
    initial_amount = Column(Float, nullable=False)
    target_amount = Column(Float)
    currency = Column(String(10), default="UZS")

    interest_rate = Column(Float)
    start_date = Column(Date, nullable=False)
    maturity_date = Column(Date)

    risk_level = Column(String(20))
    platform = Column(String(200))

    notes = Column(Text)
    deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    person = relationship("Person", back_populates="savings")
    transactions = relationship("SavingTransaction", back_populates="saving", cascade="all, delete-orphan")


class SavingTransaction(Base):
    __tablename__ = "saving_transactions"

    id = Column(Integer, primary_key=True, index=True)
    saving_id = Column(Integer, ForeignKey("savings.id"), nullable=False)

    transaction_type = Column(String(20), nullable=False)
    amount = Column(Float, nullable=False)
    transaction_date = Column(Date, nullable=False)

    balance_before = Column(Float, nullable=False)
    balance_after = Column(Float, nullable=False)

    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    saving = relationship("Saving", back_populates="transactions")


class GennisSalaryPayment(Base):
    __tablename__ = "gennis_salary_payments"

    id = Column(Integer, primary_key=True, index=True)
    salary_month_id = Column(
        Integer,
        ForeignKey("salary_months.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False, index=True)

    gennis_payment_id = Column(Integer, nullable=False, unique=True, index=True)
    gennis_salary_location_id = Column(Integer, nullable=False, index=True)

    amount = Column(Float, nullable=False)
    reason = Column(String(300), nullable=True)
    payment_date = Column(Date, nullable=True, index=True)
    payment_type_id = Column(Integer, nullable=True)
    payment_type = Column(String(20), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    salary_month = relationship("SalaryMonth", back_populates="gennis_payments")
    person = relationship("Person")


class Budget(Base):
    __tablename__ = "budgets"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)

    period = Column(String(10), nullable=False, index=True)
    period_type = Column(String(10), default="monthly")

    category = Column(String(50), nullable=False)
    allocated_amount = Column(Float, nullable=False)

    spent_amount = Column(Float, default=0.0)
    remaining_amount = Column(Float, default=0.0)

    notes = Column(Text)
    deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    person = relationship("Person", back_populates="budgets")
