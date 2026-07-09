from datetime import datetime

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.ext.hybrid import hybrid_property
from sqlalchemy.orm import relationship

from app.database import Base


class Goal(Base):
    __tablename__ = "goals"

    id = Column(Integer, primary_key=True, index=True)
    person_id = Column(Integer, ForeignKey("person.id"), nullable=False)

    name = Column(String(200), nullable=False)
    description = Column(Text)
    category = Column(String(50))

    target_value = Column(Float)
    current_value = Column(Float, default=0)

    start_date = Column(Date)
    target_date = Column(Date)

    status = Column(String(20), default="active")
    priority = Column(String(20), default="medium")
    deleted = Column(Boolean, default=False)
    color = Column(String(20), nullable=True)

    _stored_percentage = Column(Float, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    person = relationship("Person", back_populates="goals")
    tasks = relationship("Task", back_populates="goal", cascade="all, delete-orphan")
    progress_logs = relationship("ProgressLog", back_populates="goal", cascade="all, delete-orphan")
    milestones = relationship("Milestone", back_populates="goal", cascade="all, delete-orphan")

    @hybrid_property
    def percentage(self):
        return self._stored_percentage if self._stored_percentage is not None else 0.0

    @percentage.setter
    def percentage(self, value):
        self._stored_percentage = value

    def calculate_task_percentage(self):
        if not self.tasks:
            return 0.0
        total_tasks = len(self.tasks)
        completed_tasks = sum(1 for task in self.tasks if task.completed)
        if total_tasks == 0:
            return 0.0
        self.percentage = round((completed_tasks / total_tasks) * 100, 2)
        return self.percentage

    def calculate_manual_percentage(self):
        if not self.target_value or self.target_value == 0:
            return None
        percentage = (self.current_value / self.target_value) * 100
        return round(min(percentage, 100.0), 2)


class Milestone(Base):
    __tablename__ = "milestones"

    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=False)

    name = Column(String(200), nullable=False)
    description = Column(Text)
    target_date = Column(Date)
    completion_percentage = Column(Float, default=0.0)

    achieved = Column(Boolean, default=False)
    achieved_at = Column(DateTime, nullable=True)
    reward_description = Column(Text, nullable=True)
    order_index = Column(Integer, default=0)
    deleted = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    goal = relationship("Goal", back_populates="milestones")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=True)

    name = Column(String(200), nullable=False)
    description = Column(Text)
    task_type = Column(String(20), default="daily")
    due_date = Column(Date)
    completed = Column(Boolean, default=False)
    completed_at = Column(DateTime)
    priority = Column(String(20), default="medium")
    estimated_duration = Column(Integer)
    value = Column(Float, nullable=True)
    is_recurring = Column(Boolean, default=False)
    deleted = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)

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
    estimated_duration = Column(Integer)
    order = Column(Integer, default=0)
    deleted = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)

    task = relationship("Task", back_populates="sub_tasks")


class ProgressLog(Base):
    __tablename__ = "progress_logs"

    id = Column(Integer, primary_key=True, index=True)
    goal_id = Column(Integer, ForeignKey("goals.id"), nullable=False)
    log_date = Column(Date, nullable=False, default=datetime.utcnow)
    value_logged = Column(Float)
    notes = Column(Text)
    mood = Column(String(20))
    energy_level = Column(Integer)
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
