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

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

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
    unit = Column(String(20))  # "score", "%", "days"

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
