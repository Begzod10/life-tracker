from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class EssayPromptRequest(BaseModel):
    level: str = Field(default="B1")
    topic_hint: Optional[str] = None
    target_word_count: Optional[int] = None
    use_weak_words: bool = True


class EssayExistingTopicRef(BaseModel):
    id: int
    title: Optional[str] = None
    prompt: str
    level: str
    status: str


class EssayPromptResponse(BaseModel):
    prompt: str
    title: Optional[str] = None
    suggested_word_count: int
    target_words: List[str]
    level: str
    existing_essay: Optional[EssayExistingTopicRef] = None


class EssayCreate(BaseModel):
    prompt: str = Field(..., min_length=1)
    title: Optional[str] = None
    body: str = ""
    level: str = Field(default="B1")
    target_word_count: Optional[int] = None
    target_words: Optional[List[str]] = None


class EssayUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    level: Optional[str] = None
    target_word_count: Optional[int] = None
    target_words: Optional[List[str]] = None
    time_spent_seconds: Optional[int] = None
    status: Optional[str] = None


class EssayRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: Optional[str] = None
    prompt: str
    body: str
    level: str
    target_word_count: Optional[int] = None
    target_words: Optional[List[str]] = None
    status: str
    word_count: int
    quick_score: Optional[int] = None
    quick_feedback: Optional[dict] = None
    deep_score: Optional[int] = None
    deep_review: Optional[dict] = None
    time_spent_seconds: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None


class EssayListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: Optional[str] = None
    prompt: str
    level: str
    status: str
    word_count: int
    target_word_count: Optional[int] = None
    quick_score: Optional[int] = None
    deep_score: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class EssayErrorReview(BaseModel):
    correct: bool


class EssayPlanBody(BaseModel):
    label: Optional[str] = None
    claim: Optional[str] = None
    what_kind: Optional[str] = None
    so_what: Optional[str] = None
    what_if: Optional[str] = None


class EssayPlanWrite(BaseModel):
    thesis: Optional[str] = None
    body_plans: List[EssayPlanBody] = Field(default_factory=list)
    conclusion_plan: Optional[str] = None


class EssayPlanRead(BaseModel):
    essay_id: int
    thesis: Optional[str] = None
    body_plans: List[EssayPlanBody] = Field(default_factory=list)
    conclusion_plan: Optional[str] = None
    updated_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
