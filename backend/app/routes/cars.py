from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app import models, schemas
from app.database import get_db

router = APIRouter()


@router.post("/create", response_model=schemas.CarRead)
def create_car(car: schemas.CarCreate, db: Session = Depends(get_db)):
    existing = db.query(models.Car).filter(models.Car.registration_number == car.registration_number).first()
    if existing:
        raise HTTPException(status_code=400, detail="Bil med detta registreringsnummer finns redan")

    new_car = models.Car(
        registration_number=car.registration_number,
        brand=car.brand,
        model_year=car.model_year,
        customer_id=car.customer_id
    )
    db.add(new_car)
    db.commit()
    db.refresh(new_car)
    return new_car

@router.get("/all", response_model=List[schemas.CarRead])
def get_all_cars(db: Session = Depends(get_db)):
    return db.query(models.Car).all()

@router.get("/{car_id}", response_model=schemas.CarRead)
def get_car(car_id: int, db: Session = Depends(get_db)):
    car = db.query(models.Car).filter(models.Car.id == car_id).first()
    if not car:
        raise HTTPException(status_code=404, detail="Bil hittades inte")
    return car

@router.get("/reg/{reg_number}", response_model=schemas.CarRead)
def get_car_by_reg(reg_number: str, db: Session = Depends(get_db)):
    car = db.query(models.Car).filter(models.Car.registration_number == reg_number.upper()).first()
    if not car:
        raise HTTPException(status_code=404, detail="Bil hittades inte")
    return car

@router.put("/edit/{car_id}", response_model=schemas.CarRead)
def update_car(car_id: int, data: schemas.CarCreate, db: Session = Depends(get_db)):
    car = db.query(models.Car).filter(models.Car.id == car_id).first()
    if not car:
        raise HTTPException(status_code=404, detail="Bil hittades inte")

    car.registration_number = data.registration_number
    car.brand = data.brand
    car.model_year = data.model_year
    car.customer_id = data.customer_id

    db.commit()
    db.refresh(car)
    return car

@router.delete("/delete/{car_id}", status_code=204)
def delete_car(car_id: int, db: Session = Depends(get_db)):
    car = db.query(models.Car).filter(models.Car.id == car_id).first()
    if not car:
        raise HTTPException(status_code=404, detail="Bil hittades inte")
    db.delete(car)
    db.commit()

