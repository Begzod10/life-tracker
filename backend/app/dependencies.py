"""
Dependency functions for authentication
Use these to protect routes
"""

from fastapi import Cookie, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from typing import Optional
from app.models import Person
from fastapi.security import OAuth2PasswordBearer
from app.database import get_db
from app import models
from app.core.security import verify_token
from datetime import datetime
# auto_error=False — let cookie auth take over when there's no Bearer header.
security = HTTPBearer(auto_error=False)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


async def get_current_user(
        credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
        access_token_cookie: Optional[str] = Cookie(default=None, alias="access_token"),
        db: Session = Depends(get_db)
) -> models.Person:
    """Resolve the authenticated user from either the Authorization Bearer
    header or the access_token cookie (httpOnly, set by /auth endpoints)."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials if credentials else access_token_cookie
    if not token:
        raise credentials_exception

    # Verify and decode token
    try:
        payload = verify_token(token)
    except ValueError:
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

    # Check if token was issued before the user's last logout (invalidated token)
    iat = payload.get("iat")
    if iat and user.last_logout_at:
        from datetime import timezone
        token_issued_at = datetime.utcfromtimestamp(iat)
        if token_issued_at <= user.last_logout_at:
            raise credentials_exception

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
        payload = verify_token(token)

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
