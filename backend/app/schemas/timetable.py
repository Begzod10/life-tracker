from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


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
