from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class BookCreate(BaseModel):
    """Used by the upload endpoint as a query/form payload alongside the file.
    Title falls back to the filename if absent; the upload pipeline tries to
    pull title/author/page-count from the PDF metadata."""
    title: Optional[str] = None
    author: Optional[str] = None
    status: Literal["want", "reading", "done"] = "reading"
    cover_url: Optional[str] = None
    isbn: Optional[str] = None
    tags: Optional[str] = None


class BookUpdate(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    status: Optional[Literal["want", "reading", "done"]] = None
    cover_url: Optional[str] = None
    isbn: Optional[str] = None
    tags: Optional[str] = None
    notes: Optional[str] = None
    current_page: Optional[int] = Field(default=None, ge=1)
    resume_text: Optional[str] = None
    resume_page: Optional[int] = Field(default=None, ge=1)


class BookRead(BaseModel):
    id: int
    title: str
    author: Optional[str] = None
    total_pages: int
    current_page: int
    status: str
    cover_url: Optional[str] = None
    isbn: Optional[str] = None
    tags: Optional[str] = None
    notes: Optional[str] = None
    file_size_bytes: Optional[int] = None
    last_opened_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    progress_percent: int = 0
    highlight_count: int = 0
    resume_text: Optional[str] = None
    resume_page: Optional[int] = None


class BookListResponse(BaseModel):
    items: List[BookRead]
    total: int
    by_status: dict


class ReadingSessionCreate(BaseModel):
    end_page: int = Field(..., ge=1)
    minutes: Optional[int] = Field(default=None, ge=0)


class ReadingSessionRead(BaseModel):
    id: int
    book_id: int
    started_at: datetime
    ended_at: Optional[datetime] = None
    start_page: int
    end_page: int
    pages_read: int
    minutes: Optional[int] = None


class BookHighlightCreate(BaseModel):
    page: int = Field(..., ge=1)
    text: str = Field(..., min_length=1)
    note: Optional[str] = None
    kind: Literal["highlight", "vocab", "note"] = "highlight"
    color: Optional[str] = None
    save_to_dictionary: bool = False
    module_id: Optional[int] = None
    source_sentence: Optional[str] = Field(default=None, max_length=2000)


class BookHighlightRead(BaseModel):
    id: int
    book_id: int
    page: int
    text: str
    note: Optional[str] = None
    kind: str
    color: Optional[str] = None
    dictionary_word_id: Optional[int] = None
    translation: Optional[str] = None
    source_sentence: Optional[str] = None
    created_at: datetime


class BookHighlightUpdate(BaseModel):
    note: Optional[str] = None
    color: Optional[str] = None
