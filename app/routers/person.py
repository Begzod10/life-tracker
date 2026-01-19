from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from app import models, schemas
from app.database import get_db

router = APIRouter(
    prefix="/person",
    tags=["person"]
)


@router.get('/', response_model=List[schemas.Person])
def get_persons(db: Session = Depends(get_db)):
    return db.query(models.Person).all()


@router.post('/', response_model=schemas.Person, status_code=status.HTTP_201_CREATED)
def create_person(person: schemas.PersonCreate, db: Session = Depends(get_db)):
    # Check if email already exists
    db_person = db.query(models.Person).filter(
        models.Person.email == person.email
    ).first()

    if db_person:
        raise HTTPException(status_code=400, detail="Email already registered")

    new_person = models.Person(**person.model_dump())
    db.add(new_person)
    db.commit()
    db.refresh(new_person)
    return new_person


@router.get('/{person_id}', response_model=schemas.Person)
def get_person(person_id: int, db: Session = Depends(get_db)):
    person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")
    return person


@router.put('/{person_id}', response_model=schemas.Person)
def update_person(person_id: int, person: schemas.PersonUpdate, db: Session = Depends(get_db)):
    db_person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if not db_person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")
    update_data = person.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_person, key, value)
    db.commit()
    db.refresh(db_person)
    return db_person


@router.delete('/{person_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_person(person_id: int, db: Session = Depends(get_db)):
    db_person = db.query(models.Person).filter(models.Person.id == person_id).first()
    if not db_person:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Person not found")
    db.delete(db_person)
    db.commit()
    return
