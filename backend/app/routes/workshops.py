from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.auth import get_current_user
from app import models, schemas
from app.models import UserRole, WorkshopBay, WorkshopServiceItem, User
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
        allowed = {UserRole.WORKSHOP_USER.value, UserRole.WORKSHOP_EMPLOYEE.value}
        bad = [u for u in users if u.role not in allowed]
        if bad:
            names = ", ".join([u.username for u in bad])
            raise HTTPException(status_code=400, detail=f"Users not allowed for workshop linkage: {names}")
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
        allowed = {UserRole.WORKSHOP_USER.value, UserRole.WORKSHOP_EMPLOYEE.value}
        bad = [u for u in users if u.role not in allowed]
        if bad:
            names = ", ".join([u.username for u in bad])
            raise HTTPException(status_code=400, detail=f"Users not allowed for workshop linkage: {names}")
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

@router.get("/{workshop_id}/bays", response_model=List[schemas.WorkshopBayRead])
def get_workshop_bays(
    workshop_id: int,
    db: Session = Depends(get_db),
):
    workshop = db.query(models.Workshop).filter(models.Workshop.id == workshop_id).first()
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    bays = (
        db.query(models.WorkshopBay)
        .filter(models.WorkshopBay.workshop_id == workshop_id)
        .order_by(models.WorkshopBay.name.asc())
        .all()
    )
    return bays


# ----------------------------------
#  Hämta anställda/anslutna användare i en verkstad
#  Exempel: /workshops/123/employees?roles=workshop_employee&roles=workshop_user
# ----------------------------------
@router.get("/{workshop_id}/employees", response_model=List[schemas.UserSimple])
def get_workshop_employees(
    workshop_id: int,
    roles: Optional[List[schemas.UserRole]] = Query(default=None, description="Filtrera på roller"),
    db: Session = Depends(get_db),
):
    workshop = db.query(models.Workshop).filter(models.Workshop.id == workshop_id).first()
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    q = (
        db.query(models.User)
        .join(models.user_workshop_association,
              models.user_workshop_association.c.user_id == models.User.id)
        .filter(models.user_workshop_association.c.workshop_id == workshop_id)
    )

    if roles:
        # mappar Pydantic-enums till DB-värden (str)
        role_values = [r.value if hasattr(r, "value") else str(r) for r in roles]
        q = q.filter(models.User.role.in_(role_values))

    users = q.order_by(models.User.username.asc()).all()
    return users


# ----------------------------------
#  Hämta service items för en verkstad
#  Exempel:
#   /workshops/123/service-items?is_active=true
#   /workshops/123/service-items?vehicle_class=suv
#   /workshops/123/service-items?price_type=fixed
# ----------------------------------
@router.get("/{workshop_id}/service-items", response_model=List[schemas.WorkshopServiceItemRead])
def get_workshop_service_items(
    workshop_id: int,
    is_active: Optional[bool] = Query(default=None),
    vehicle_class: Optional[schemas.VehicleClass] = Query(default=None),
    price_type: Optional[schemas.ServicePriceType] = Query(default=None),
    db: Session = Depends(get_db),
):
    workshop = db.query(models.Workshop).filter(models.Workshop.id == workshop_id).first()
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    q = (
        db.query(models.WorkshopServiceItem)
        .filter(models.WorkshopServiceItem.workshop_id == workshop_id)
    )

    if is_active is not None:
        q = q.filter(models.WorkshopServiceItem.is_active == is_active)

    if vehicle_class is not None:
        # enum till str-värde om nödvändigt
        vc_val = vehicle_class.value if hasattr(vehicle_class, "value") else str(vehicle_class)
        q = q.filter(models.WorkshopServiceItem.vehicle_class == vc_val)

    if price_type is not None:
        pt_val = price_type.value if hasattr(price_type, "value") else str(price_type)
        q = q.filter(models.WorkshopServiceItem.price_type == pt_val)

    items = q.order_by(models.WorkshopServiceItem.name.asc()).all()
    return items