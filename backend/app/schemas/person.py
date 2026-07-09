from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class PersonBase(BaseModel):
    name: str = Field(..., description="Full name", min_length=1, max_length=100)
    email: EmailStr = Field(..., description="Email address")
    timezone: str = Field(default="Asia/Tashkent", description="Timezone")


class PersonCreate(PersonBase):
    password: str = Field(..., description="Password", min_length=6)


class PersonUpdate(BaseModel):
    name: Optional[str] = Field(None)
    email: Optional[EmailStr] = Field(None)
    timezone: Optional[str] = Field(None)


class Person(PersonBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
