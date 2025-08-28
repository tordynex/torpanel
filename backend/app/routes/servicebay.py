from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app import models, schemas
from app.database import get_db

router = APIRouter()


def _sync_vehicle_classes(db: Session, bay: models.WorkshopBay, classes: Optional[List[models.VehicleClass]]):
    """
    Synka assoc-tabellen workshopbay_vehicleclass mot inkommande lista.
    Om classes är None -> gör ingenting (behåll befintligt).
    Om classes är [] -> rensa alla.
    """
    if classes is None:
        return

    # Gör uppslagsset av befintliga
    existing = {vc.vehicle_class for vc in bay.vehicle_classes}
    incoming = set(classes)

    # Lägg till nya
    to_add = incoming - existing
    for c in to_add:
        db.add(models.WorkshopBayVehicleClass(bay_id=bay.id, vehicle_class=c))

    # Ta bort de som inte längre finns
    to_remove = existing - incoming
    if to_remove:
        (
            db.query(models.WorkshopBayVehicleClass)
            .filter(
                models.WorkshopBayVehicleClass.bay_id == bay.id,
                models.WorkshopBayVehicleClass.vehicle_class.in_(list(to_remove)),
            )
            .delete(synchronize_session=False)
        )


@router.post("/create", response_model=schemas.WorkshopBayRead)
def create_bay(payload: schemas.WorkshopBayCreate, db: Session = Depends(get_db)):
    # Säkerställ att verkstaden finns
    workshop = db.query(models.Workshop).filter(models.Workshop.id == payload.workshop_id).first()
    if not workshop:
        raise HTTPException(status_code=404, detail="Verkstad hittades inte")

    # Unikt namn per verkstad
    name_exists = (
        db.query(models.WorkshopBay)
        .filter(
            models.WorkshopBay.workshop_id == payload.workshop_id,
            models.WorkshopBay.name == payload.name,
        )
        .first()
    )
    if name_exists:
        raise HTTPException(status_code=400, detail="Arbetsplats med detta namn finns redan i verkstaden")

    bay = models.WorkshopBay(
        workshop_id=payload.workshop_id,
        name=payload.name,
        bay_type=payload.bay_type,
        max_length_mm=payload.max_length_mm,
        max_width_mm=payload.max_width_mm,
        max_height_mm=payload.max_height_mm,
        max_weight_kg=payload.max_weight_kg,
        allow_overnight=payload.allow_overnight if payload.allow_overnight is not None else True,
        notes=payload.notes,
    )
    db.add(bay)
    db.flush()

    # Synka tillåtna fordonsklasser (om schemat innehåller field t.ex. vehicle_classes: List[VehicleClass])
    classes = getattr(payload, "vehicle_classes", None)
    _sync_vehicle_classes(db, bay, classes)

    db.commit()
    db.refresh(bay)
    return bay


@router.get("/all", response_model=List[schemas.WorkshopBayReadSimple])
def get_all_bays(
    workshop_id: Optional[int] = Query(default=None, description="Filtrera på verkstad"),
    db: Session = Depends(get_db),
):
    q = db.query(models.WorkshopBay)
    if workshop_id is not None:
        q = q.filter(models.WorkshopBay.workshop_id == workshop_id)
    return q.order_by(models.WorkshopBay.workshop_id, models.WorkshopBay.name).all()


@router.get("/{bay_id}", response_model=schemas.WorkshopBayRead)
def get_bay(bay_id: int, db: Session = Depends(get_db)):
    bay = db.query(models.WorkshopBay).get(bay_id)
    if not bay:
        raise HTTPException(status_code=404, detail="Bay not found")

    return {
        "id": bay.id,
        "workshop_id": bay.workshop_id,
        "name": bay.name,
        "bay_type": bay.bay_type,  # funkar, det är redan en enum
        "max_length_mm": bay.max_length_mm,
        "max_width_mm": bay.max_width_mm,
        "max_height_mm": bay.max_height_mm,
        "max_weight_kg": bay.max_weight_kg,
        "allow_overnight": bay.allow_overnight,
        "notes": bay.notes,
        # ⬇️ CONVERT: association-objekt -> enumvärden
        "vehicle_classes": [vc.vehicle_class for vc in bay.vehicle_classes],
    }



@router.put("/edit/{bay_id}", response_model=schemas.WorkshopBayRead)
def update_bay(bay_id: int, payload: schemas.WorkshopBayUpdate, db: Session = Depends(get_db)):
    bay = db.query(models.WorkshopBay).filter(models.WorkshopBay.id == bay_id).first()
    if not bay:
        raise HTTPException(status_code=404, detail="Arbetsplats hittades inte")

    # Unikhetskoll på namn om det finns med i payload
    if "name" in payload.__fields_set__ and payload.name and payload.name != bay.name:
        exists = (
            db.query(models.WorkshopBay)
            .filter(
                models.WorkshopBay.workshop_id == bay.workshop_id,
                models.WorkshopBay.name == payload.name,
                models.WorkshopBay.id != bay.id,
            )
            .first()
        )
        if exists:
            raise HTTPException(status_code=400, detail="Arbetsplats med detta namn finns redan i verkstaden")

    # Uppdatera ENBART de fält som klienten faktiskt skickade (även om värdet är None)
    data = payload.dict(exclude_unset=True)  # <- kritiskt
    for field in [
        "name",
        "bay_type",
        "max_length_mm",
        "max_width_mm",
        "max_height_mm",
        "max_weight_kg",
        "allow_overnight",
        "notes",
    ]:
        if field in data:
            setattr(bay, field, data[field])

    # Synka fordonsklasser endast om fältet skickats (skillnad på None vs utelämnat)
    if "vehicle_classes" in payload.__fields_set__:
        _sync_vehicle_classes(db, bay, payload.vehicle_classes)

    db.commit()
    db.refresh(bay)
    return bay

@router.delete("/delete/{bay_id}", status_code=204)
def delete_bay(bay_id: int, db: Session = Depends(get_db)):
    bay = db.query(models.WorkshopBay).filter(models.WorkshopBay.id == bay_id).first()
    if not bay:
        raise HTTPException(status_code=404, detail="Arbetsplats hittades inte")

    db.delete(bay)
    db.commit()
    return None
