from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import List, Optional
from datetime import date, timedelta, datetime

from app import models, schemas
from app.database import get_db

router = APIRouter()


# ================================
# 🔧 Hjälpare (lokala, enkla)
# ================================
def _norm_email(e: Optional[str]) -> Optional[str]:
    return e.strip().lower() if e else None

def _norm_phone(p: Optional[str]) -> Optional[str]:
    if not p:
        return None
    return p.replace(" ", "").replace("-", "")

def _norm_reg(reg: Optional[str]) -> Optional[str]:
    if not reg:
        return None
    return reg.replace(" ", "").upper()


def _get_or_create_car_by_reg(db: Session, reg: str) -> models.Car:
    reg = _norm_reg(reg)
    car = db.query(models.Car).filter(models.Car.registration_number == reg).one_or_none()
    if car:
        return car
    car = models.Car(registration_number=reg, brand="?", model_year=0)
    db.add(car)
    db.flush()
    return car


def _ensure_customer_car_link(db: Session, customer: models.Customer, car: models.Car, set_primary: bool = True) -> models.CustomerCar:
    link = db.query(models.CustomerCar).filter_by(customer_id=customer.id, car_id=car.id).one_or_none()
    if not link:
        link = models.CustomerCar(customer_id=customer.id, car_id=car.id)
        db.add(link)
        db.flush()

    if set_primary:
        today = date.today()
        primaries = (
            db.query(models.CustomerCar)
            .join(models.Customer, models.Customer.id == models.CustomerCar.customer_id)
            .filter(
                models.CustomerCar.car_id == car.id,
                models.CustomerCar.is_primary_owner == True,
                models.Customer.workshop_id == customer.workshop_id,
                models.CustomerCar.valid_to.is_(None),
            )
            .all()
        )
        for p in primaries:
            p.valid_to = today  # <-- ändra hit (inte "today - 1")
            p.is_primary_owner = False  # tydliggör att den inte längre är primär

        link.is_primary_owner = True
        if not link.valid_from:
            link.valid_from = today
        link.valid_to = None

    db.flush()
    return link


# =========================================
# 👥 Hämta kunder kopplade till verkstad
# =========================================
@router.get("/workshops/{workshop_id}/customers", response_model=List[schemas.CustomerRead])
def get_workshop_customers(
    workshop_id: int,
    q: Optional[str] = Query(default=None, description="Sök på namn, e-post, telefon"),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    workshop = db.query(models.Workshop).filter(models.Workshop.id == workshop_id).first()
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    query = db.query(models.Customer).filter(models.Customer.workshop_id == workshop_id)

    if q:
        qn = f"%{q.strip()}%"
        # Case-insensitive på email + match på telefon/namn
        query = query.filter(
            or_(
                func.lower(models.Customer.email).like(func.lower(qn)),
                models.Customer.phone.like(qn),
                models.Customer.first_name.like(qn),
                models.Customer.last_name.like(qn),
                func.concat(
                    func.coalesce(models.Customer.first_name, ""),
                    " ",
                    func.coalesce(models.Customer.last_name, "")
                ).like(qn),
            )
        )

    customers = query.order_by(
        func.coalesce(models.Customer.last_name, "").asc(),
        func.coalesce(models.Customer.first_name, "").asc(),
        models.Customer.id.asc(),
    ).limit(limit).all()

    return customers


# ========================================================
# 🚗→👤 Hämta kunder kopplade till en bil (via car_id)
#    (valfritt filtrera på verkstad)
# ========================================================
@router.get("/cars/{car_id}/customers", response_model=List[schemas.CustomerRead])
def get_car_customers(
    car_id: int,
    workshop_id: Optional[int] = Query(default=None, description="Filtrera på verkstad"),
    db: Session = Depends(get_db),
):
    car = db.query(models.Car).filter(models.Car.id == car_id).first()
    if not car:
        raise HTTPException(status_code=404, detail="Car not found")

    q = (
        db.query(models.Customer)
        .join(models.CustomerCar, models.CustomerCar.customer_id == models.Customer.id)
        .filter(
            models.CustomerCar.car_id == car_id,
        )
    )

    if workshop_id is not None:
        q = q.filter(models.Customer.workshop_id == workshop_id)

    customers = q.order_by(
        models.CustomerCar.is_primary_owner.desc(),
        func.coalesce(models.Customer.last_name, "").asc(),
        func.coalesce(models.Customer.first_name, "").asc(),
        models.Customer.id.asc(),
    ).all()

    return customers


# =======================================================
# 🚗→⭐ Hämta primär kund för en bil (valfritt per verkstad)
# =======================================================
@router.get("/cars/{car_id}/primary-customer", response_model=schemas.CustomerRead)
def get_primary_customer_for_car(
    car_id: int,
    workshop_id: Optional[int] = Query(default=None, description="Filtrera primär inom viss verkstad"),
    db: Session = Depends(get_db),
):
    car = db.query(models.Car).filter(models.Car.id == car_id).first()
    if not car:
        raise HTTPException(status_code=404, detail="Car not found")

    q = (
        db.query(models.Customer)
        .join(models.CustomerCar, models.CustomerCar.customer_id == models.Customer.id)
        .filter(
            models.CustomerCar.car_id == car_id,
            models.CustomerCar.is_primary_owner == True,
            models.CustomerCar.valid_to.is_(None),  # <-- VIKTIGT: endast aktiv länk
        )
    )

    if workshop_id is not None:
        q = q.filter(models.Customer.workshop_id == workshop_id)

    primary = q.order_by(models.CustomerCar.valid_from.desc()).first()

    if not primary:
        raise HTTPException(status_code=404, detail="No primary customer found for this car")

    return primary


# =====================================
# 🔎 Hämta en specifik kund med id
# =====================================
@router.get("/customers/{customer_id}", response_model=schemas.CustomerRead)
def get_customer_by_id(customer_id: int, db: Session = Depends(get_db)):
    customer = db.query(models.Customer).filter(models.Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


# ===========================================================
# ➕ Skapa kund (och valfritt koppla kunden till en bil)
# Body = schemas.CustomerCreate + valfria länkfält
# ===========================================================
from pydantic import BaseModel, EmailStr

class CustomerCreateWithLink(schemas.CustomerCreate):
    car_id: Optional[int] = None
    registration_number: Optional[str] = None
    set_primary: Optional[bool] = True


@router.post("/customers/create", response_model=schemas.CustomerRead, status_code=status.HTTP_201_CREATED)
def create_customer(
    payload: CustomerCreateWithLink,
    db: Session = Depends(get_db),
):
    # Minst en av e-post/telefon måste finnas för dedupe och kontakt
    email_norm = _norm_email(payload.email)
    phone_norm = _norm_phone(payload.phone)
    if not email_norm and not phone_norm:
        raise HTTPException(status_code=400, detail="Provide at least one of email or phone")

    # Dedupe inom verkstad: först e-post, annars telefon
    q = db.query(models.Customer).filter(models.Customer.workshop_id == payload.workshop_id)
    if email_norm:
        customer = q.filter(func.lower(models.Customer.email) == email_norm).one_or_none()
    else:
        customer = q.filter(models.Customer.phone == phone_norm).one_or_none()

    if customer:
        # Uppdatera luckor (fyll bara i saknade fält)
        if not customer.first_name and payload.first_name:
            customer.first_name = payload.first_name
        if not customer.last_name and payload.last_name:
            customer.last_name = payload.last_name
        if not customer.email and email_norm:
            customer.email = email_norm
        if not customer.phone and phone_norm:
            customer.phone = phone_norm
        db.flush()
    else:
        customer = models.Customer(
            workshop_id=payload.workshop_id,
            first_name=payload.first_name,
            last_name=payload.last_name,
            email=email_norm,
            phone=phone_norm,
        )
        db.add(customer)
        db.flush()

    # Valfritt: koppla till bil (via car_id eller registration_number)
    if payload.car_id or payload.registration_number:
        if payload.car_id:
            car = db.query(models.Car).filter(models.Car.id == payload.car_id).first()
            if not car:
                raise HTTPException(status_code=404, detail="Car not found")
        else:
            reg = _norm_reg(payload.registration_number)
            if not reg:
                raise HTTPException(status_code=400, detail="Invalid registration number")
            car = _get_or_create_car_by_reg(db, reg)

        _ensure_customer_car_link(db, customer, car, set_primary=bool(payload.set_primary))

    db.commit()
    db.refresh(customer)
    return customer
