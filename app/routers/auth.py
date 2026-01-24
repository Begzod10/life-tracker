"""
Authentication Router
Handles user registration, login, token refresh, password management
"""

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional

from app.database import get_db
from app import models, schemas_auth as schemas
from app.core.security import (
    get_password_hash,
    verify_password,
    create_access_token,
    create_refresh_token,
    verify_token
)
from app.dependencies import get_current_user, get_current_active_user
from app.config import settings

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

security = HTTPBearer()


@router.post('/register', response_model=schemas.LoginResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: schemas.UserRegister, db: Session = Depends(get_db)):
    """
    Register a new user

    - **name**: Full name of the user
    - **email**: Valid email address (must be unique)
    - **password**: Strong password (min 8 chars, uppercase, lowercase, digit)
    - **confirm_password**: Must match password
    - **timezone**: User's timezone (default: Asia/Tashkent)

    Returns user information and authentication tokens
    """
    # Check if email already exists
    existing_user = db.query(models.Person).filter(
        models.Person.email == user_data.email
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create new user
    new_user = models.Person(
        name=user_data.name,
        email=user_data.email,
        timezone=user_data.timezone,
        hashed_password=get_password_hash(user_data.password),
        is_active=True,
        is_verified=False,
        created_at=datetime.utcnow(),
        last_login=datetime.utcnow()
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Generate tokens
    access_token = create_access_token(data={"sub": new_user.email})
    refresh_token = create_refresh_token(data={"sub": new_user.email})

    # Create user response
    user_response = schemas.UserResponse.model_validate(new_user)

    return schemas.LoginResponse(
        user=user_response,
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.post('/login', response_model=schemas.LoginResponse)
def login(credentials: schemas.UserLogin, db: Session = Depends(get_db)):
    """
    Authenticate user and return tokens

    - **email**: User's email address
    - **password**: User's password

    Returns user information and authentication tokens
    """
    # Get user by email
    user = db.query(models.Person).filter(
        models.Person.email == credentials.email
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if account is locked
    if user.is_locked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Account locked due to too many failed login attempts. Try again after {user.locked_until}"
        )

    # Verify password
    if not verify_password(credentials.password, user.hashed_password):
        # Increment failed login attempts
        user.failed_login_attempts += 1

        # Lock account after 5 failed attempts
        if user.failed_login_attempts >= 5:
            user.locked_until = datetime.utcnow() + timedelta(minutes=30)
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account locked due to too many failed login attempts. Try again in 30 minutes."
            )

        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Please contact support."
        )

    # Reset failed login attempts on successful login
    user.failed_login_attempts = 0
    user.locked_until = None
    user.last_login = datetime.utcnow()
    db.commit()

    # Generate tokens
    access_token = create_access_token(data={"sub": user.email})
    refresh_token = create_refresh_token(data={"sub": user.email})

    # Create user response
    user_response = schemas.UserResponse.model_validate(user)

    return schemas.LoginResponse(
        user=user_response,
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.post('/refresh', response_model=schemas.Token)
def refresh_token(token_data: schemas.TokenRefresh, db: Session = Depends(get_db)):
    """
    Refresh access token using refresh token

    - **refresh_token**: Valid refresh token

    Returns new access token and refresh token
    """
    # Verify refresh token
    payload = verify_token(token_data.refresh_token, token_type="refresh")

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    email: str = payload.get("sub")
    if email is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify user still exists and is active
    user = db.query(models.Person).filter(models.Person.email == email).first()

    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Generate new tokens
    new_access_token = create_access_token(data={"sub": email})
    new_refresh_token = create_refresh_token(data={"sub": email})

    return schemas.Token(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    )


@router.get('/me', response_model=schemas.UserResponse)
def get_current_user_info(current_user: models.Person = Depends(get_current_active_user)):
    """
    Get current authenticated user information

    Requires valid access token in Authorization header
    """
    return schemas.UserResponse.model_validate(current_user)


@router.put('/me', response_model=schemas.UserResponse)
def update_current_user(
        user_update: schemas.PersonUpdate,
        current_user: models.Person = Depends(get_current_active_user),
        db: Session = Depends(get_db)
):
    """
    Update current user's profile information

    - **name**: Updated name (optional)
    - **timezone**: Updated timezone (optional)

    Requires valid access token
    """
    update_data = user_update.model_dump(exclude_unset=True)

    # Don't allow email update through this endpoint
    if 'email' in update_data:
        del update_data['email']

    for key, value in update_data.items():
        setattr(current_user, key, value)

    current_user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(current_user)

    return schemas.UserResponse.model_validate(current_user)


@router.post('/change-password', status_code=status.HTTP_200_OK)
def change_password(
        password_data: schemas.PasswordChange,
        current_user: models.Person = Depends(get_current_active_user),
        db: Session = Depends(get_db)
):
    """
    Change user password

    - **old_password**: Current password
    - **new_password**: New password (must meet strength requirements)
    - **confirm_password**: Confirm new password

    Requires valid access token
    """
    # Verify old password
    if not verify_password(password_data.old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password"
        )

    # Check if new password is same as old
    if verify_password(password_data.new_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from current password"
        )

    # Update password
    current_user.hashed_password = get_password_hash(password_data.new_password)
    current_user.updated_at = datetime.utcnow()
    db.commit()

    return {"message": "Password changed successfully"}


@router.post('/logout', status_code=status.HTTP_200_OK)
def logout(current_user: models.Person = Depends(get_current_active_user)):
    """
    Logout user

    Note: Since we're using JWT, the token will remain valid until expiration.
    Client should discard the token on logout.
    For production, consider implementing token blacklisting.

    Requires valid access token
    """
    return {
        "message": "Logged out successfully",
        "note": "Please discard your access and refresh tokens"
    }


@router.delete('/me', status_code=status.HTTP_200_OK)
def deactivate_account(
        current_user: models.Person = Depends(get_current_active_user),
        db: Session = Depends(get_db)
):
    """
    Deactivate user account

    This sets is_active to False. Account can be reactivated by admin.

    Requires valid access token
    """
    current_user.is_active = False
    current_user.updated_at = datetime.utcnow()
    db.commit()

    return {
        "message": "Account deactivated successfully",
        "note": "Contact support to reactivate your account"
    }
