from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, EmailStr
from datetime import datetime

from app import models
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter(tags=["profile"])


class ProfileResponse(BaseModel):
    id: int
    name: str
    email: str
    timezone: str
    profile_photo_url: Optional[str] = None
    is_verified: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    timezone: Optional[str] = None


class PublicProfileResponse(BaseModel):
    id: int
    name: str
    profile_photo_url: Optional[str] = None


def _profile_response(user: models.Person) -> ProfileResponse:
    return ProfileResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        timezone=user.timezone,
        profile_photo_url=user.profile_photo_url,
        is_verified=user.is_verified,
        created_at=user.created_at.isoformat() if user.created_at else None,
        updated_at=user.updated_at.isoformat() if user.updated_at else None,
    )


@router.get('/profile', response_model=ProfileResponse)
def get_profile(current_user: models.Person = Depends(get_current_user)):
    """Get current user's profile"""
    return _profile_response(current_user)


@router.put('/profile', response_model=ProfileResponse)
def update_profile(
        profile_data: ProfileUpdate,
        current_user: models.Person = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """Update current user's profile"""
    update_data = profile_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(current_user, key, value)
    current_user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(current_user)
    return _profile_response(current_user)


@router.delete('/profile')
def delete_profile(
        current_user: models.Person = Depends(get_current_user),
        db: Session = Depends(get_db)
):
    """Delete current user's account"""
    db.delete(current_user)
    db.commit()
    return {"message": "Account deleted"}


@router.get('/profiles', response_model=List[PublicProfileResponse])
def get_profiles(db: Session = Depends(get_db)):
    """Get list of public profiles"""
    persons = db.query(models.Person).filter(models.Person.is_active == True).all()
    return [PublicProfileResponse(id=p.id, name=p.name, profile_photo_url=p.profile_photo_url) for p in persons]


@router.get('/profiles/{user_id}', response_model=PublicProfileResponse)
def get_profile_by_id(user_id: int, db: Session = Depends(get_db)):
    """Get a specific public profile"""
    person = db.query(models.Person).filter(
        models.Person.id == user_id,
        models.Person.is_active == True
    ).first()
    if not person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return PublicProfileResponse(id=person.id, name=person.name, profile_photo_url=person.profile_photo_url)
