from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class DictionaryFolderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    color: Optional[str] = None


class DictionaryFolderUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    color: Optional[str] = None


class DictionaryFolderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    person_id: int
    name: str
    color: Optional[str] = None
    module_count: int = 0
    word_count: int = 0
    created_at: datetime


class DictionaryModuleCreate(BaseModel):
    folder_id: int
    name: str = Field(..., min_length=1, max_length=120)
    description: Optional[str] = None


class DictionaryModuleUpdate(BaseModel):
    folder_id: Optional[int] = None
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = None


class DictionaryModuleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    folder_id: int
    person_id: int
    name: str
    description: Optional[str] = None
    word_count: int = 0
    created_at: datetime


class DictionaryWordCreate(BaseModel):
    module_id: int
    word: str = Field(..., min_length=1, max_length=200)
    definition: str = Field(..., min_length=1)
    translation: Optional[str] = None
    part_of_speech: Optional[str] = None
    examples: Optional[List[str]] = None
    phonetic: Optional[str] = None
    difficulty: str = Field(default="B1")
    tags: Optional[str] = None


class DictionaryWordUpdate(BaseModel):
    module_id: Optional[int] = None
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
    module_id: Optional[int] = None
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


class PracticeSessionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    mode: str
    total_questions: int
    correct_answers: int
    started_at: datetime
    completed_at: Optional[datetime] = None
