from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app import models, schemas
from app.database import get_db
from app.auth import get_current_user
from typing import List

router = APIRouter()


# ----------------------------------
# Skapa service log
# ----------------------------------
@router.post("/create", response_model=schemas.ServiceLogRead)
def create_service_log(log: schemas.ServiceLogCreate, db: Session = Depends(get_db)):
    car = db.query(models.Car).filter(models.Car.id == log.car_id).first()
    if not car:
        raise HTTPException(status_code=404, detail="Car not found")

    new_log = models.ServiceLog(
        work_performed=log.work_performed,
        date=log.date,
        mileage=log.mileage,
        car_id=log.car_id,
        workshop_id=log.workshop_id,
    )

    db.add(new_log)
    db.commit()
    db.refresh(new_log)

    # Lägg till tasks om de finns
    for task in log.tasks:
        new_task = models.ServiceTask(
            title=task.title,
            comment=task.comment,
            service_log_id=new_log.id
        )
        db.add(new_task)

    db.commit()
    db.refresh(new_log)
    return new_log

# ----------------------------------
# Visa alla service logs
# ----------------------------------
@router.get("/all", response_model=List[schemas.ServiceLogRead])
def get_all_service_logs(db: Session = Depends(get_db)):
    return db.query(models.ServiceLog).all()


# ----------------------------------
# Visa service logs för en bil
# ----------------------------------
@router.get("/car/{car_id}", response_model=List[schemas.ServiceLogRead])
def get_logs_for_car(car_id: int, db: Session = Depends(get_db)):
    car = db.query(models.Car).filter(models.Car.id == car_id).first()
    if not car:
        raise HTTPException(status_code=404, detail="Car not found")

    return db.query(models.ServiceLog).filter(models.ServiceLog.car_id == car_id).all()

# ----------------------------------
# Uppdatera en service log
# ----------------------------------
@router.put("/{log_id}", response_model=schemas.ServiceLogRead, response_model_exclude_unset=True)
def update_service_log(
    log_id: int,
    updated_log: schemas.ServiceLogUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized")

    log = db.query(models.ServiceLog).filter(models.ServiceLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Service log not found")

    db.query(models.ServiceTask).filter(models.ServiceTask.service_log_id == log.id).delete()

    if hasattr(updated_log, "tasks") and updated_log.tasks:
        for task in updated_log.tasks:
            new_task = models.ServiceTask(
                title=task.title,
                comment=task.comment,
                service_log_id=log.id
            )
            db.add(new_task)

    log.work_performed = updated_log.work_performed
    log.date = updated_log.date
    log.mileage = updated_log.mileage
    log.workshop_id = updated_log.workshop_id

    db.commit()
    db.refresh(log)
    return log


# ----------------------------------
# Ta bort en service log
# ----------------------------------
@router.delete("/{log_id}", status_code=204)
def delete_service_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Unauthorized")

    log = db.query(models.ServiceLog).filter(models.ServiceLog.id == log_id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Service log not found")

    db.delete(log)
    db.commit()
    return