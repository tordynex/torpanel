from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List, Optional
from datetime import datetime

from app.auth import get_current_user
from app import models, schemas
from app.database import get_db

router = APIRouter()

# ================================
# Hjälp: behörighet till verkstad
# ================================
def _assert_workshop_access(db: Session, user: models.User, workshop_id: int):
    """
    Tillåt om:
    - user.role i {owner, workshop_user, workshop_employee} OCH
    - användaren är kopplad till workshop_id
    """
    if user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    # Owner har full access — om du vill låsa ner, ta bort detta
    if user.role == models.UserRole.OWNER:
        return

    # Finns koppling till verkstaden?
    link = db.execute(
        models.user_workshop_association.select().where(
            models.user_workshop_association.c.user_id == user.id,
            models.user_workshop_association.c.workshop_id == workshop_id,
        )
    ).first()

    if not link:
        raise HTTPException(status_code=403, detail="No access to this workshop")


# ----------------------------------
#  Skapa Booking Request (PUBLIC)
#  Kallas från publika flödet när service_item.request_only = true
# ----------------------------------
@router.post("/create", response_model=schemas.BookingRequestRead, status_code=status.HTTP_201_CREATED)
def create_booking_request(
    payload: schemas.BookingRequestCreate,
    db: Session = Depends(get_db),
):
    # 1) Workshop måste finnas
    ws = db.query(models.Workshop).filter(models.Workshop.id == payload.workshop_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # 2) Samla alla service_item_id vi ska koppla
    requested_ids: list[int] = []
    if payload.service_item_id is not None:
        requested_ids.append(int(payload.service_item_id))
    if payload.service_item_ids:
        requested_ids.extend(int(x) for x in payload.service_item_ids)

    # Unika
    requested_ids = list(dict.fromkeys(requested_ids))

    # 3) Validera att service items tillhör verkstaden (om någon angavs)
    items = []
    if requested_ids:
        items = (
            db.query(models.WorkshopServiceItem)
              .filter(models.WorkshopServiceItem.id.in_(requested_ids),
                      models.WorkshopServiceItem.workshop_id == payload.workshop_id)
              .all()
        )
        if len(items) != len(requested_ids):
            raise HTTPException(status_code=404, detail="One or more service items not found for this workshop")

    # 4) Skapa själva BookingRequest
    item = models.BookingRequest(
        workshop_id=payload.workshop_id,
        service_item_id=payload.service_item_id,  # behåll legacy om du vill
        customer_id=payload.customer_id,
        car_id=payload.car_id,
        registration_number=payload.registration_number,
        first_name=payload.first_name,
        last_name=payload.last_name,
        email=str(payload.email) if payload.email else None,
        phone=payload.phone,
        message=payload.message,
        # status default = OPEN
    )

    db.add(item)
    db.flush()  # få ID

    # 5) Koppla listan (M2M)
    for si in items:
        db.add(models.BookingRequestServiceItem(
            booking_request_id=item.id,
            service_item_id=si.id
        ))

    db.commit()
    db.refresh(item)
    return item

# ----------------------------------
#  Lista Booking Requests för verkstad (DASHBOARD)
# ----------------------------------
@router.get("/workshop/{workshop_id}", response_model=List[schemas.BookingRequestRead])
def list_booking_requests_for_workshop(
    workshop_id: int,
    status_filter: Optional[schemas.BookingRequestStatus] = Query(default=None, alias="status"),
    created_from: Optional[datetime] = Query(default=None),
    created_to: Optional[datetime] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _assert_workshop_access(db, current_user, workshop_id)

    q = db.query(models.BookingRequest).filter(models.BookingRequest.workshop_id == workshop_id)

    if status_filter is not None:
        # Enum till str
        st = status_filter.value if hasattr(status_filter, "value") else str(status_filter)
        q = q.filter(models.BookingRequest.status == st)

    if created_from is not None:
        q = q.filter(models.BookingRequest.created_at >= created_from)

    if created_to is not None:
        q = q.filter(models.BookingRequest.created_at < created_to)

    q = q.order_by(models.BookingRequest.created_at.desc())

    return q.all()


# ----------------------------------
#  Hämta en Booking Request (DASHBOARD)
# ----------------------------------
@router.get("/{booking_request_id}", response_model=schemas.BookingRequestRead)
def get_booking_request(
    booking_request_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = db.query(models.BookingRequest).filter(models.BookingRequest.id == booking_request_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Booking request not found")

    _assert_workshop_access(db, current_user, item.workshop_id)
    return item


# ----------------------------------
#  Uppdatera Booking Request (DASHBOARD)
#  - Byt status (open/handled/converted_to_booking)
#  - Länka kund/bil i efterhand
#  - Uppdatera kontaktuppgifter/meddelande
# ----------------------------------
@router.patch("/{booking_request_id}", response_model=schemas.BookingRequestRead)
def update_booking_request(
    booking_request_id: int,
    data: schemas.BookingRequestUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = db.query(models.BookingRequest).filter(models.BookingRequest.id == booking_request_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Booking request not found")

    _assert_workshop_access(db, current_user, item.workshop_id)

    # Tillåt selektiv uppdatering
    if data.status is not None:
        item.status = data.status.value if hasattr(data.status, "value") else str(data.status)

    if data.message is not None:
        item.message = data.message

    if data.customer_id is not None:
        # validera att kunden finns i denna verkstad (eller tillåt globalt – justera efter din modell)
        cust = db.query(models.Customer).filter(models.Customer.id == data.customer_id).first()
        if not cust:
            raise HTTPException(status_code=404, detail="Customer not found")
        item.customer_id = data.customer_id

    if data.car_id is not None:
        car = db.query(models.Car).filter(models.Car.id == data.car_id).first()
        if not car:
            raise HTTPException(status_code=404, detail="Car not found")
        item.car_id = data.car_id

    if data.registration_number is not None:
        item.registration_number = data.registration_number

    if data.first_name is not None:
        item.first_name = data.first_name

    if data.last_name is not None:
        item.last_name = data.last_name

    if data.email is not None:
        item.email = str(data.email)

    if data.phone is not None:
        item.phone = data.phone

    # Säkerställ att minst ett kontaktfält finns om customer_id saknas
    if not item.customer_id and not (item.email or item.phone):
        raise HTTPException(status_code=400, detail="Minst e-post eller telefon krävs om customer_id saknas.")

    item.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(item)
    return item


# ----------------------------------
#  Radera Booking Request (DASHBOARD)
# ----------------------------------
@router.delete("/{booking_request_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_booking_request(
    booking_request_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = db.query(models.BookingRequest).filter(models.BookingRequest.id == booking_request_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Booking request not found")

    _assert_workshop_access(db, current_user, item.workshop_id)

    db.delete(item)
    db.commit()
    return
