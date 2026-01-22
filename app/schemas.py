from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict, EmailStr


# ========== PERSON SCHEMAS ==========#

class PersonBase(BaseModel):
    name: str = Field(..., description="Full name", min_length=1, max_length=100)
    email: EmailStr = Field(..., description="Email address")
    timezone: str = Field(default="Asia/Tashkent", description="Timezone")


class PersonCreate(PersonBase):
    pass


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
    unit: Optional[str] = Field(None, description="Unit of measurement: score, %, days, hours, count")
    start_date: Optional[date] = Field(None)
    target_date: Optional[date] = Field(None)
    priority: str = Field(default="medium", description="Priority: high, medium, low")


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
                "unit": "score",
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
    current_value: Optional[float] = Field(None)
    status: Optional[str] = Field(None, description="Status: active, completed, paused")
    priority: Optional[str] = Field(None)

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
                "unit": "score",
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
    created_at: datetime
    updated_at: Optional[datetime] = None
    percentage: float = Field(default=0, description="Stored progress percentage")


class GoalWithStats(Goal):
    """Goal response with detailed statistics"""
    total_tasks: int = Field(default=0, description="Total number of tasks")
    completed_tasks: int = Field(default=0, description="Number of completed tasks")
    task_completion_percentage: float = Field(default=0, description="Percentage of tasks completed")
    manual_percentage: Optional[float] = Field(None, description="Manual progress based on target/current value")


# ========== TASK SCHEMAS ==========
class TaskBase(BaseModel):
    name: str = Field(..., description="Task name")
    description: Optional[str] = Field(None, description="Task description")
    task_type: str = Field(default="daily", description="Task type: daily, weekly, monthly, one-time")
    due_date: Optional[date] = Field(None, description="Due date")
    priority: str = Field(default="medium", description="Priority: high, medium, low")
    estimated_duration: Optional[int] = Field(None, description="Estimated duration in minutes")


class TaskCreate(TaskBase):
    goal_id: int = Field(..., description="Goal ID this task belongs to")


class Task(TaskBase):
    id: int = Field(..., description="Task ID")
    goal_id: int = Field(..., description="Goal ID")
    completed: bool = Field(default=False, description="Task completion status")
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")
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


# ========== SUB TASK SCHEMAS ==========

class SubTaskBase(BaseModel):
    name: str = Field(..., description="Sub task name")
    description: Optional[str] = Field(None, description="Sub task description")
    priority: str = Field(default="medium", description="Priority: high, medium, low")
    estimated_duration: Optional[int] = Field(None, description="Estimated duration in minutes")


class SubTaskCreate(SubTaskBase):
    task_id: int = Field(..., description="Task ID this subtask belongs to")


class SubTask(SubTaskBase):
    id: int = Field(..., description="Sub task ID")
    task_id: int = Field(..., description="Task ID")
    completed: bool = Field(default=False, description="Sub task completion status")
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")
    created_at: datetime = Field(..., description="Creation timestamp")

    model_config = ConfigDict(from_attributes=True)


class SubTaskUpdate(BaseModel):
    name: Optional[str] = Field(None, description="Sub task name")
    description: Optional[str] = Field(None, description="Sub task description")
    priority: Optional[str] = Field(None, description="Priority: high, medium, low")
    estimated_duration: Optional[int] = Field(None, description="Estimated duration in minutes")
    completed: Optional[bool] = Field(None, description="Completion status")
    completed_at: Optional[datetime] = Field(None, description="Completion timestamp")


# ========== PROGRESS LOG SCHEMAS ==========
class ProgressLogBase(BaseModel):
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