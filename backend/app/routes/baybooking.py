from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, or_
from datetime import datetime, timedelta, date
from typing import List, Optional

from app import models, schemas
from app.database import get_db

router = APIRouter()

# -----------------------------
# Hjälpfunktioner / valideringar
# -----------------------------

def _ensure_workshop_and_bay(db: Session, workshop_id: int, bay_id: int) -> models.WorkshopBay:
    """Säkerställ att workshop och bay finns, och att bay hör till workshop."""
    workshop = db.query(models.Workshop).filter(models.Workshop.id == workshop_id).first()
    if not workshop:
        raise HTTPException(status_code=404, detail="Verkstad hittades inte")

    bay = db.query(models.WorkshopBay).filter(models.WorkshopBay.id == bay_id).first()
    if not bay:
        raise HTTPException(status_code=404, detail="Arbetsplats (bay) hittades inte")

    if bay.workshop_id != workshop_id:
        raise HTTPException(status_code=400, detail="Denna arbetsplats tillhör inte angiven verkstad")

    return bay


def _time_overlap(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    """Returnerar True om två intervall överlappar (strikt överlapp)."""
    return a_start < b_end and b_start < a_end


def _assert_no_conflicts(
    db: Session,
    *,
    booking_id: Optional[int],
    workshop_id: int,
    bay_id: int,
    start_at: datetime,
    end_at: datetime,
    buffer_before_min: int,
    buffer_after_min: int,
) -> None:
    """
    Säkerställ att det inte finns kollisioner med andra bokningar eller avstängningar.
    Buffertar räknas på både befintliga bokningar och den inkommande.
    """
    if end_at <= start_at:
        raise HTTPException(status_code=400, detail="end_at måste vara efter start_at")

    # Effektivt intervall för NY bokning (inkl. buffertar)
    new_eff_start = start_at - timedelta(minutes=buffer_before_min or 0)
    new_eff_end = end_at + timedelta(minutes=buffer_after_min or 0)

    # Kolla krock med andra bokningar i samma bay
    q = db.query(models.BayBooking).filter(
        models.BayBooking.bay_id == bay_id
    )
    if booking_id is not None:
        q = q.filter(models.BayBooking.id != booking_id)

    for other in q.all():
        other_eff_start = other.start_at - timedelta(minutes=other.buffer_before_min or 0)
        other_eff_end = other.end_at + timedelta(minutes=other.buffer_after_min or 0)

        if _time_overlap(new_eff_start, new_eff_end, other_eff_start, other_eff_end):
            raise HTTPException(
                status_code=409,
                detail=f"Krock med annan bokning (ID {other.id}) i samma arbetsplats."
            )

    # Kolla krock med BayClosure
    cq = db.query(models.BayClosure).filter(
        models.BayClosure.bay_id == bay_id,
        _overlap_clause(models.BayClosure.start_at, models.BayClosure.end_at, new_eff_start, new_eff_end)
    )

    if cq.first():
        raise HTTPException(status_code=409, detail="Krock med avstängningsperiod för arbetsplatsen (BayClosure).")


def _overlap_clause(col_start, col_end, q_start: datetime, q_end: datetime):
    """
    SQLA-kompatibel överlappnings-logik:
    (col_start < q_end) AND (q_start < col_end)
    """
    return and_(col_start < q_end, q_start < col_end)


def _validate_vehicle_vs_bay(db: Session, bay: models.WorkshopBay, car_id: Optional[int]) -> None:
    """
    Om bilen har VehicleProfile: kontrollera fordonsklass och dimensioner/vikt mot bay.
    Om ingen profil: hoppa över (kan inte validera).
    """
    if not car_id:
        return

    profile = db.query(models.VehicleProfile).filter(models.VehicleProfile.car_id == car_id).first()
    if not profile:
        return  # ingen profil -> tillåt, vi kan inte bedöma

    # Klass-stöd?
    if bay.supported_vehicle_classes and profile.vehicle_class not in bay.supported_vehicle_classes:
        raise HTTPException(status_code=400, detail=f"Arbetsplatsen stödjer inte fordonsklassen '{profile.vehicle_class.value}'.")

    # Mått/vikt (om bay har begränsningar)
    if bay.max_length_mm and profile.length_mm and profile.length_mm > bay.max_length_mm:
        raise HTTPException(status_code=400, detail="Fordonets längd överskrider arbetsplatsens maxlängd.")
    if bay.max_width_mm and profile.width_mm and profile.width_mm > bay.max_width_mm:
        raise HTTPException(status_code=400, detail="Fordonets bredd överskrider arbetsplatsens maxbredd.")
    if bay.max_height_mm and profile.height_mm and profile.height_mm > bay.max_height_mm:
        raise HTTPException(status_code=400, detail="Fordonets höjd överskrider arbetsplatsens maxhöjd.")
    if bay.max_weight_kg and profile.weight_kg and profile.weight_kg > bay.max_weight_kg:
        raise HTTPException(status_code=400, detail="Fordonets vikt överskrider arbetsplatsens maxvikt.")

def _create_booking_core(db: Session, payload: schemas.BayBookingCreate) -> models.BayBooking:
    # Säkerställ workshop+bay och relation dem emellan
    bay = _ensure_workshop_and_bay(db, payload.workshop_id, payload.bay_id)

    # Validera fordon vs bay (om bil-id skickats)
    _validate_vehicle_vs_bay(db, bay, payload.car_id)

    # Krockkontroll
    _assert_no_conflicts(
        db,
        booking_id=None,
        workshop_id=payload.workshop_id,
        bay_id=payload.bay_id,
        start_at=payload.start_at,
        end_at=payload.end_at,
        buffer_before_min=payload.buffer_before_min or 0,
        buffer_after_min=payload.buffer_after_min or 0,
    )

    booking = models.BayBooking(
        workshop_id=payload.workshop_id,
        bay_id=payload.bay_id,
        title=payload.title,
        description=payload.description,
        start_at=payload.start_at,
        end_at=payload.end_at,
        buffer_before_min=payload.buffer_before_min or 0,
        buffer_after_min=payload.buffer_after_min or 0,
        status=payload.status or models.BookingStatus.BOOKED,
        customer_id=payload.customer_id,
        car_id=payload.car_id,
        service_log_id=payload.service_log_id,
        assigned_user_id=payload.assigned_user_id,
        source=payload.source,

        # NYA/valfria fält (måste finnas i BayBookingCreate-schemat)
        service_item_id=getattr(payload, "service_item_id", None),
        price_net_ore=getattr(payload, "price_net_ore", None),
        price_gross_ore=getattr(payload, "price_gross_ore", None),
        vat_percent=getattr(payload, "vat_percent", None),
        price_note=getattr(payload, "price_note", None),
        price_is_custom=getattr(payload, "price_is_custom", None),

        chain_token=getattr(payload, "chain_token", None),
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking



# -------------
# Endpoints
# -------------

@router.post("/create", response_model=schemas.BayBookingRead)
def create_booking(payload: schemas.BayBookingCreate, db: Session = Depends(get_db)):
    return _create_booking_core(db, payload)


@router.get("/all", response_model=List[schemas.BayBookingRead])
def list_bookings(
    workshop_id: Optional[int] = Query(default=None, description="Filtrera på verkstad"),
    bay_id: Optional[int] = Query(default=None, description="Filtrera på arbetsplats"),
    date_from: Optional[datetime] = Query(default=None, description="Start från och med (inklusive)"),
    date_to: Optional[datetime] = Query(default=None, description="Slut till (exklusiv)"),
    status: Optional[List[models.BookingStatus]] = Query(default=None, description="Filtrera på status (multi)"),
    include_cancelled: bool = Query(default=True, description="Ta med CANCELLED och NO_SHOW i resultatet"),
    db: Session = Depends(get_db),
):
    # Eager load
    q = (
        db.query(models.BayBooking)
        .options(
            joinedload(models.BayBooking.car),
            joinedload(models.BayBooking.customer),
            joinedload(models.BayBooking.service_item),
        )
    )

    if workshop_id is not None:
        q = q.filter(models.BayBooking.workshop_id == workshop_id)
    if bay_id is not None:
        q = q.filter(models.BayBooking.bay_id == bay_id)

    # Tidsintervall
    if date_from and date_to:
        q = q.filter(_overlap_clause(models.BayBooking.start_at, models.BayBooking.end_at, date_from, date_to))
    elif date_from:
        q = q.filter(models.BayBooking.end_at > date_from)
    elif date_to:
        q = q.filter(models.BayBooking.start_at < date_to)

    # Statusfilter
    if status:
        q = q.filter(models.BayBooking.status.in_(status))
    else:
        if not include_cancelled:
            q = q.filter(
                models.BayBooking.status.notin_(
                    [models.BookingStatus.CANCELLED, models.BookingStatus.NO_SHOW]
                )
            )

    bookings = q.order_by(models.BayBooking.start_at.asc()).all()

    # ---- Primärkund per bil OCH verkstad ----
    car_ids = [b.car_id for b in bookings if b.car_id is not None]
    primary_by_pair: dict[tuple[int, int], models.Customer] = {}

    if car_ids:
        today = date.today()
        rows = (
            db.query(models.CustomerCar, models.Customer)
            .join(models.Customer, models.Customer.id == models.CustomerCar.customer_id)
            .filter(
                models.CustomerCar.car_id.in_(car_ids),
                models.CustomerCar.is_primary_owner.is_(True),
                models.CustomerCar.valid_to.is_(None),
                or_(models.CustomerCar.valid_from.is_(None), models.CustomerCar.valid_from <= today),
            )
            .order_by(models.CustomerCar.valid_from.desc(), models.CustomerCar.customer_id.desc())
            .all()
        )
        for cc, cust in rows:
            key = (cc.car_id, cust.workshop_id)
            if key not in primary_by_pair:  # behåll den senaste
                primary_by_pair[key] = cust

    # Sätt primärkund på varje booking
    for b in bookings:
        cust = primary_by_pair.get((b.car_id, b.workshop_id)) if b.car_id is not None else None
        setattr(b, "car_primary_customer", cust)

    # --- efter att du har 'bookings' listan klar ---
    if bookings:
        booking_ids = [b.id for b in bookings]

        # Hämta ALLA uppsells per booking (vi skippa bara draft i listan)
        offers = (
            db.query(models.UpsellOffer)
            .filter(models.UpsellOffer.booking_id.in_(booking_ids))
            .order_by(models.UpsellOffer.sent_at.desc().nullslast(),
                      models.UpsellOffer.id.desc())
            .all()
        )

        by_booking: dict[int, list[models.UpsellOffer]] = {}
        for off in offers:
            if off.status == models.UpsellStatus.DRAFT:
                continue
            by_booking.setdefault(off.booking_id, []).append(off)

        for b in bookings:
            lst = by_booking.get(b.id, [])
            active = [o for o in lst if o.status == models.UpsellStatus.PENDING]
            # begränsa historiklistan om du vill, t.ex. 5 st:
            recent = lst[:5]
            latest = lst[0] if lst else None

            setattr(b, "upsells_active", active)
            setattr(b, "upsells_recent", recent)
            setattr(b, "upsell_latest", latest)

    return bookings

@router.get("/{booking_id}", response_model=schemas.BayBookingRead)
def get_booking(booking_id: int, db: Session = Depends(get_db)):
    booking = (
        db.query(models.BayBooking)
        .options(
            joinedload(models.BayBooking.service_item),
            # valfritt: useful om du vill visa kund/bil direkt:
            # joinedload(models.BayBooking.car),
            # joinedload(models.BayBooking.customer),
        )
        .get(booking_id)
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Not found")

    # 🔹 Aktiva upsells för just denna bokning
    offers = (
        db.query(models.UpsellOffer)
        .filter(models.UpsellOffer.booking_id == booking.id)
        .order_by(models.UpsellOffer.sent_at.desc().nullslast(),
                  models.UpsellOffer.id.desc())
        .all()
    )

    lst = [o for o in offers if o.status != models.UpsellStatus.DRAFT]
    active = [o for o in lst if o.status == models.UpsellStatus.PENDING]
    recent = lst[:5]
    latest = lst[0] if lst else None

    setattr(booking, "upsells_active", active)
    setattr(booking, "upsells_recent", recent)
    setattr(booking, "upsell_latest", latest)

    return booking

@router.put("/edit/{booking_id}", response_model=schemas.BayBookingRead)
def update_booking(booking_id: int, payload: schemas.BayBookingUpdate, db: Session = Depends(get_db)):
    booking = db.query(models.BayBooking).filter(models.BayBooking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")

    # Ta fram inkommande (ev. uppdaterade) fält
    data = payload.dict(exclude_unset=True)

    for field in [
        "workshop_id", "bay_id", "title", "description", "start_at", "end_at",
        "buffer_before_min", "buffer_after_min", "status", "customer_id", "car_id",
        "service_log_id", "assigned_user_id", "source", "service_item_id",
        "price_net_ore", "price_gross_ore", "vat_percent", "price_note", "price_is_custom", "final_price_ore", "chain_token",
    ]:
        if field in data:
            setattr(booking, field, data[field])

    # Om något av fälten som påverkar relation/validering ändrats:
    new_workshop_id = data.get("workshop_id", booking.workshop_id)
    new_bay_id = data.get("bay_id", booking.bay_id)
    new_start_at = data.get("start_at", booking.start_at)
    new_end_at = data.get("end_at", booking.end_at)
    new_buffer_before = data.get("buffer_before_min", booking.buffer_before_min)
    new_buffer_after = data.get("buffer_after_min", booking.buffer_after_min)
    new_car_id = data.get("car_id", booking.car_id)

    # Verifiera workshop+bay relationen (om ändrat)
    bay = _ensure_workshop_and_bay(db, new_workshop_id, new_bay_id)

    # Validera fordon vs bay (om bil-id ändrats eller bay/workshop ändrats)
    _validate_vehicle_vs_bay(db, bay, new_car_id)

    # Konfliktkontroll (om tider/buffertar/bay/workshop ändrats)
    _assert_no_conflicts(
        db,
        booking_id=booking.id,
        workshop_id=new_workshop_id,
        bay_id=new_bay_id,
        start_at=new_start_at,
        end_at=new_end_at,
        buffer_before_min=new_buffer_before,
        buffer_after_min=new_buffer_after,
    )

    # Uppdatera ENDAST fält som sänts
    for field in [
        "workshop_id",
        "bay_id",
        "title",
        "description",
        "start_at",
        "end_at",
        "buffer_before_min",
        "buffer_after_min",
        "status",
        "customer_id",
        "car_id",
        "service_log_id",
        "assigned_user_id",
        "source",
    ]:
        if field in data:
            setattr(booking, field, data[field])

    db.commit()
    db.refresh(booking)
    return booking


@router.patch("/status/{booking_id}", response_model=schemas.BayBookingRead)
def set_status(booking_id: int, status: models.BookingStatus, db: Session = Depends(get_db)):
    booking = db.query(models.BayBooking).filter(models.BayBooking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")

    booking.status = status
    db.commit()
    db.refresh(booking)
    return booking


@router.delete("/delete/{booking_id}", status_code=204)
def delete_booking(booking_id: int, db: Session = Depends(get_db)):
    booking = db.query(models.BayBooking).filter(models.BayBooking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")

    db.delete(booking)
    db.commit()
    return None


@router.get("/availability/check", response_model=schemas.BayAvailabilityResult)
def check_availability(
    workshop_id: int = Query(...),
    bay_id: int = Query(...),
    start_at: datetime = Query(...),
    end_at: datetime = Query(...),
    buffer_before_min: int = Query(0),
    buffer_after_min: int = Query(0),
    db: Session = Depends(get_db),
):
    """
    Returnerar om angiven slot är ledig för vald bay (med buffertar).
    """
    # Säkerställ workshop+bay
    _ensure_workshop_and_bay(db, workshop_id, bay_id)

    # Krockkontroll: om exception inte kastas -> ledig
    try:
        _assert_no_conflicts(
            db,
            booking_id=None,
            workshop_id=workshop_id,
            bay_id=bay_id,
            start_at=start_at,
            end_at=end_at,
            buffer_before_min=buffer_before_min,
            buffer_after_min=buffer_after_min,
        )
        return schemas.BayAvailabilityResult(available=True, reason=None)
    except HTTPException as ex:
        if ex.status_code in (400, 409):
            return schemas.BayAvailabilityResult(available=False, reason=ex.detail)
        raise
