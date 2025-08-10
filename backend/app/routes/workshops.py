from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.auth import get_current_user
from app import models, schemas
from app.database import get_db

router = APIRouter()

# ----------------------------------
# 🔨 Skapa verkstad
# ----------------------------------
@router.post("/create", response_model=schemas.WorkshopRead)
def create_workshop(workshop: schemas.WorkshopCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Workshop).filter(models.Workshop.email == workshop.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Workshop with this email already exists")

    new_workshop = models.Workshop(
        name=workshop.name,
        email=workshop.email,
        phone=workshop.phone,
        website=workshop.website,
        street_address=workshop.street_address,
        postal_code=workshop.postal_code,
        city=workshop.city,
        country=workshop.country,
        latitude=workshop.latitude,
        longitude=workshop.longitude,
        org_number=workshop.org_number,
        active=workshop.active if workshop.active is not None else True,
        autonexo=workshop.autonexo,
        opening_hours=workshop.opening_hours,
        notes=workshop.notes
    )

    if workshop.user_ids:
        users = db.query(models.User).filter(models.User.id.in_(workshop.user_ids)).all()
        for u in users:
            if u.role != schemas.UserRole.WORKSHOP_USER:
                raise HTTPException(status_code=400, detail=f"User '{u.username}' is not a workshop_user")
        new_workshop.users = users

    db.add(new_workshop)
    db.commit()
    db.refresh(new_workshop)
    return new_workshop


# ----------------------------------
# ✏️ Uppdatera verkstad
# ----------------------------------
@router.put("/edit/{workshop_id}", response_model=schemas.WorkshopRead)
def update_workshop(workshop_id: int, data: schemas.WorkshopCreate, db: Session = Depends(get_db)):
    workshop = db.query(models.Workshop).filter(models.Workshop.id == workshop_id).first()
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    workshop.name = data.name
    workshop.email = data.email
    workshop.phone = data.phone
    workshop.website = data.website
    workshop.street_address = data.street_address
    workshop.postal_code = data.postal_code
    workshop.city = data.city
    workshop.country = data.country
    workshop.latitude = data.latitude
    workshop.longitude = data.longitude
    workshop.org_number = data.org_number
    workshop.active = data.active if data.active is not None else True
    workshop.autonexo = data.autonexo
    workshop.opening_hours = data.opening_hours
    workshop.notes = data.notes

    if data.user_ids is not None:
        users = db.query(models.User).filter(models.User.id.in_(data.user_ids)).all()
        for u in users:
            if u.role != schemas.UserRole.WORKSHOP_USER:
                raise HTTPException(status_code=400, detail=f"User '{u.username}' is not a workshop_user")
        workshop.users = users

    db.commit()
    db.refresh(workshop)
    return workshop


# ----------------------------------
#  Radera verkstad
# ----------------------------------
@router.delete("/delete/{workshop_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workshop(workshop_id: int, db: Session = Depends(get_db)):
    workshop = db.query(models.Workshop).filter(models.Workshop.id == workshop_id).first()
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    db.delete(workshop)
    db.commit()
    return


# ----------------------------------
#  Hämta alla verkstäder
# ----------------------------------
@router.get("/all", response_model=List[schemas.WorkshopRead])
def get_all_workshops(db: Session = Depends(get_db)):
    workshops = db.query(models.Workshop).all()
    return workshops

# ----------------------------------
#  Hämta specifik verkstad med Id
# ----------------------------------

@router.get("/{workshop_id}", response_model=schemas.WorkshopRead)
def get_workshop_by_id(workshop_id: int, db: Session = Depends(get_db)):
    workshop = db.query(models.Workshop).filter(models.Workshop.id == workshop_id).first()
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")
    return workshop