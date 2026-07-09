from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class NewsCategoryRead(BaseModel):
    """Catalog row + whether the current user is subscribed."""
    id: int
    slug: str
    label: str
    color: Optional[str] = None
    sort_order: int
    mode: str
    is_selected: bool = False

    model_config = ConfigDict(from_attributes=True)


class NewsCategoryPickWrite(BaseModel):
    """PUT /news/categories body — replaces the user's full selection."""
    category_ids: list[int] = Field(default_factory=list)


class NewsItemRead(BaseModel):
    id: int
    category_id: int
    category_slug: str
    category_label: str
    category_color: Optional[str] = None
    date: date
    headline: str
    summary: Optional[str] = None
    url: str
    image_url: Optional[str] = None
    source_name: Optional[str] = None
    provider: str
    published_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class NewsFetchSummary(BaseModel):
    date: date
    total_inserted: int
    categories: list[dict]
