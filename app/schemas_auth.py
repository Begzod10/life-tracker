"""
Authentication Schemas
Add these to your existing app/schemas.py
"""

from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional
from datetime import datetime
import re


# ========== AUTHENTICATION SCHEMAS ==========

class UserRegister(BaseModel):
    """Schema for user registration"""
    name: str = Field(..., min_length=1, max_length=100, description="Full name")
    email: EmailStr = Field(..., description="Email address")
    password: str = Field(..., min_length=8, max_length=100, description="Password")
    confirm_password: str = Field(..., description="Password confirmation")
    timezone: str = Field(default="Asia/Tashkent", description="User timezone")

    # @field_validator('password')
    # @classmethod
    # def validate_password(cls, v):
    #     """Validate password strength"""
    #     if len(v) < 8:
    #         raise ValueError('Password must be at least 8 characters long')
    #
    #     if not re.search(r'[A-Z]', v):
    #         raise ValueError('Password must contain at least one uppercase letter')
    #
    #     if not re.search(r'[a-z]', v):
    #         raise ValueError('Password must contain at least one lowercase letter')
    #
    #     if not re.search(r'\d', v):
    #         raise ValueError('Password must contain at least one digit')
    #
    #     return v

    @field_validator('confirm_password')
    @classmethod
    def passwords_match(cls, v, info):
        """Validate that passwords match"""
        if 'password' in info.data and v != info.data['password']:
            raise ValueError('Passwords do not match')
        return v

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "Begzod Mamadaliyev",
                "email": "begzod@example.com",
                "password": "SecurePass123",
                "confirm_password": "SecurePass123",
                "timezone": "Asia/Tashkent"
            }
        }
    }


class PersonUpdate(BaseModel):
    """Schema for person update"""
    name: Optional[str] = Field(None)
    email: Optional[EmailStr] = Field(None)
    timezone: Optional[str] = Field(None)

    model_config = {
        "json_schema_extra": {
            "example": {
                "name": "Begzod Mamadaliyev",
                "email": "begzod@example.com",
                "timezone": "Asia/Tashkent"
            }
        }
    }


class UserLogin(BaseModel):
    """Schema for user login"""
    email: EmailStr = Field(..., description="Email address")
    password: str = Field(..., description="Password")

    model_config = {
        "json_schema_extra": {
            "example": {
                "email": "begzod@example.com",
                "password": "SecurePass123"
            }
        }
    }


class Token(BaseModel):
    """Schema for JWT token response"""
    access_token: str = Field(..., description="JWT access token")
    refresh_token: str = Field(..., description="JWT refresh token")
    token_type: str = Field(default="bearer", description="Token type")
    expires_in: int = Field(..., description="Token expiration time in seconds")

    model_config = {
        "json_schema_extra": {
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer",
                "expires_in": 1800
            }
        }
    }


class TokenRefresh(BaseModel):
    """Schema for token refresh request"""
    refresh_token: str = Field(..., description="Refresh token")


class PasswordChange(BaseModel):
    """Schema for password change"""
    old_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, description="New password")
    confirm_password: str = Field(..., description="Confirm new password")

    @field_validator('new_password')
    @classmethod
    def validate_password(cls, v):
        """Validate password strength"""
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters long')

        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')

        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')

        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')

        return v

    @field_validator('confirm_password')
    @classmethod
    def passwords_match(cls, v, info):
        """Validate that passwords match"""
        if 'new_password' in info.data and v != info.data['new_password']:
            raise ValueError('Passwords do not match')
        return v


class PasswordReset(BaseModel):
    """Schema for password reset request"""
    email: EmailStr = Field(..., description="Email address")


class PasswordResetConfirm(BaseModel):
    """Schema for password reset confirmation"""
    token: str = Field(..., description="Reset token")
    new_password: str = Field(..., min_length=8, description="New password")
    confirm_password: str = Field(..., description="Confirm new password")


class UserResponse(BaseModel):
    """Schema for user information in responses"""
    id: int
    name: str
    email: EmailStr
    timezone: str
    is_active: bool
    is_verified: bool
    created_at: datetime
    last_login: Optional[datetime] = None

    model_config = {
        "from_attributes": True,
        "json_schema_extra": {
            "example": {
                "id": 1,
                "name": "Begzod Mamadaliyev",
                "email": "begzod@example.com",
                "timezone": "Asia/Tashkent",
                "is_active": True,
                "is_verified": False,
                "created_at": "2026-01-24T10:00:00Z",
                "last_login": "2026-01-24T15:30:00Z"
            }
        }
    }


class LoginResponse(BaseModel):
    """Schema for successful login response"""
    user: UserResponse
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

    model_config = {
        "json_schema_extra": {
            "example": {
                "user": {
                    "id": 1,
                    "name": "Begzod Mamadaliyev",
                    "email": "begzod@example.com",
                    "timezone": "Asia/Tashkent",
                    "is_active": True,
                    "is_verified": False,
                    "created_at": "2026-01-24T10:00:00Z",
                    "last_login": "2026-01-24T15:30:00Z"
                },
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer",
                "expires_in": 1800
            }
        }
    }
