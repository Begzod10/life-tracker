"""
Dependency functions for authentication
Use these to protect routes
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional
from app.models import Person
from fastapi.security import OAuth2PasswordBearer
from app.database import get_db
from app import models
from app.core.security import verify_token

# Security scheme for Swagger UI
security = HTTPBearer()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


async def get_current_user(
        credentials: HTTPAuthorizationCredentials = Depends(security),
        db: Session = Depends(get_db)
) -> models.Person:
    """
    Dependency to get the current authenticated user

    Args:
        credentials: HTTP Authorization header with Bearer token
        db: Database session

    Returns:
        models.Person: The authenticated user

    Raises:
        HTTPException: If token is invalid or user not found
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Extract token
    token = credentials.credentials

    # Verify and decode token
    payload = verify_token(token, token_type="access")

    if payload is None:
        raise credentials_exception

    # Get user email from token
    email: str = payload.get("sub")
    if email is None:
        raise credentials_exception

    # Get user from database
    user = db.query(models.Person).filter(models.Person.email == email).first()

    if user is None:
        raise credentials_exception

    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated"
        )

    # Check if account is locked
    if user.is_locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account is locked until {user.locked_until}. Too many failed login attempts."
        )

    return user


async def get_current_active_user(
        current_user: models.Person = Depends(get_current_user)
) -> models.Person:
    """
    Dependency to ensure user is active

    Args:
        current_user: Current authenticated user

    Returns:
        models.Person: The active user

    Raises:
        HTTPException: If user is not active
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    return current_user


async def get_current_verified_user(
        current_user: models.Person = Depends(get_current_user)
) -> models.Person:
    """
    Dependency to ensure user is verified (email verified)

    Args:
        current_user: Current authenticated user

    Returns:
        models.Person: The verified user

    Raises:
        HTTPException: If user is not verified
    """
    if not current_user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please verify your email to access this resource."
        )
    return current_user


def get_optional_current_user(
        credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
        db: Session = Depends(get_db)
) -> Optional[models.Person]:
    """
    Dependency to optionally get the current user
    Returns None if no token provided or token is invalid

    Args:
        credentials: HTTP Authorization header with Bearer token (optional)
        db: Database session

    Returns:
        Optional[models.Person]: The authenticated user or None
    """
    if credentials is None:
        return None

    try:
        token = credentials.credentials
        payload = verify_token(token, token_type="access")

        if payload is None:
            return None

        email: str = payload.get("sub")
        if email is None:
            return None

        user = db.query(models.Person).filter(models.Person.email == email).first()

        if user and user.is_active and not user.is_locked:
            return user

        return None
    except Exception:
        return None


def get_current_user_dependency(
        db: Session = Depends(get_db),
        token: str = Depends(oauth2_scheme)
) -> Person:
    """Get current authenticated user - use in protected endpoints"""
    return get_current_user(token, db)
