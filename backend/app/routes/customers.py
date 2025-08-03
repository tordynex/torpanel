from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app import models, schemas
from app.database import get_db

router = APIRouter()


# ----------------------------------
# 🔨 Skapa kund
# ----------------------------------
@router.post("/create", response_model=schemas.CustomerRead)
def create_customer(customer: schemas.CustomerCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Customer).filter(models.Customer.email == customer.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Customer with this email already exists")

    new_customer = models.Customer(
        first_name=customer.first_name,
        last_name=customer.last_name,
        email=customer.email,
        phone=customer.phone,
        last_workshop_visited=customer.last_workshop_visited
    )
    db.add(new_customer)
    db.commit()
    db.refresh(new_customer)
    return new_customer


# ----------------------------------
# 📋 Lista alla kunder
# ----------------------------------
@router.get("/all", response_model=List[schemas.CustomerRead])
def get_all_customers(db: Session = Depends(get_db)):
    customers = db.query(models.Customer).all()
    return customers
