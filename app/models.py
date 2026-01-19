from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Boolean, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class Person(Base):
    __tablename__ = "person"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(120), unique=True, nullable=False, index=True)
    timezone = Column(String(50), default="Asia/Tashkent")
    created_at = Column(DateTime, default=datetime.utcnow)

    goals = relationship(
        "Goal",
        back_populates="person",
        cascade="all, delete-orphan"
    )


class Goal(Base):
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)

    name = Column(String(200), nullable=False)
    description = Column(Text)
    category = Column(String(50))  # Learning, Health, Career

    target_value = Column(Float)
    current_value = Column(Float, default=0)
    unit = Column(String(20))  # "score", "%", "days"

    start_date = Column(Date)
    target_date = Column(Date)

    status = Column(String(20), default="active")  # active, completed, paused
    priority = Column(String(20), default="medium")  # high, medium, low

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    person = relationship("Person", back_populates="goals")
    tasks = relationship("Task", back_populates="goal", cascade="all, delete-orphan")
    progress_logs = relationship("ProgressLog", back_populates="goal", cascade="all, delete-orphan")


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
