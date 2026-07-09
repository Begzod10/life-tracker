from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship

from app.database import Base


class TimeBlock(Base):
    __tablename__ = "time_blocks"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    date = Column(Date, nullable=False, index=True)
    start_time = Column(String(5), nullable=False)
    end_time = Column(String(5), nullable=False)
    category = Column(String(50), default="work")
    color = Column(String(7), nullable=True)
    is_completed = Column(Boolean, default=False)
    is_missed = Column(Boolean, default=False)
    notified_at = Column(DateTime, nullable=True)
    is_recurring = Column(Boolean, default=False)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=True)
    deleted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    person = relationship("Person", back_populates="time_blocks")
    task = relationship("Task", backref="time_blocks")


class FrozenDay(Base):
    __tablename__ = "frozen_days"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)
    date = Column(Date, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("person_id", "date", name="uq_frozen_day_person_date"),)

    person = relationship("Person")


class CategoryBudget(Base):
    __tablename__ = "category_budgets"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)
    category = Column(String(50), nullable=False)
    weekly_hours_target = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    person = relationship("Person")


class DailyConclusion(Base):
    __tablename__ = "daily_conclusions"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)
    date = Column(Date, nullable=False, index=True)
    conclusion = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    telegram_sent_at = Column(DateTime, nullable=True)

    person = relationship("Person")
