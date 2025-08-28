from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from typing import List, Optional, Tuple
from datetime import datetime, timedelta, time, timezone, date
import random
from enum import Enum

from app.routes.baybooking import _create_booking_core
from app.database import get_db
from app import models, schemas

router = APIRouter()

# =========================
# Pydantic-schemas (lokala)
# =========================

class AssignmentStrategy(str, Enum):
    RANDOM = "random"
    ROUND_ROBIN = "round_robin"
    LEAST_BUSY = "least_busy"

class CompleteWithTimeRequest(schemas.BaseModel):
    actual_minutes_spent: int
    charge_more_than_estimate: bool = False

    use_custom_final_price: bool = False
    custom_final_price_ore: int | None = None

class AvailabilityRequest(schemas.BaseModel):
    workshop_id: int
    registration_number: str
    service_item_id: int
    earliest_from: Optional[datetime] = None
    latest_end: Optional[datetime] = None
    prefer_user_id: Optional[int] = None
    num_proposals: int = 3
    interval_granularity_min: int = 15  # steglängd när vi söker
    include_buffers: bool = True        # inkludera buffertar i konfliktkontroll
    override_duration_min: Optional[int] = None
    assignment_strategy: AssignmentStrategy | None = AssignmentStrategy.RANDOM

class AvailabilityPart(schemas.BaseModel):
    start_at: datetime
    end_at: datetime

class AvailabilityProposal(schemas.BaseModel):
    bay_id: int
    start_at: datetime
    end_at: datetime
    assigned_user_id: Optional[int] = None
    notes: Optional[str] = None
    parts: Optional[List[AvailabilityPart]] = None

class AvailabilityResponse(schemas.BaseModel):
    proposals: List[AvailabilityProposal]
    reason_if_empty: Optional[str] = None


class AutoScheduleRequest(schemas.BaseModel):
    # Obligatoriskt för bokning
    workshop_id: int
    bay_id: int
    title: str
    start_at: datetime
    end_at: datetime

    # Relationer (valfria)
    assigned_user_id: Optional[int] = None
    customer_id: Optional[int] = None
    car_id: Optional[int] = None
    registration_number: Optional[str] = None  # om car_id saknas kan vi slå upp
    service_log_id: Optional[int] = None

    # Extra
    description: Optional[str] = None
    buffer_before_min: int = 0
    buffer_after_min: int = 0
    source: Optional[str] = "auto"

    service_item_id: Optional[int] = None
    price_net_ore: Optional[int] = None
    price_gross_ore: Optional[int] = None
    vat_percent: Optional[int] = None
    price_note: Optional[str] = None
    price_is_custom: Optional[bool] = None

    chain_token: Optional[str] = None


# =========================
# Hjälpare
# =========================

ALLOWED_EMPLOYEE_ROLES = {
    models.UserRole.WORKSHOP_USER.value,
    models.UserRole.WORKSHOP_EMPLOYEE.value,
}

def _least_busy_order(db: Session, users: list[models.User], window_start: datetime, window_end: datetime) -> list[models.User]:
    # enkel belastning = antal tilldelade bokningar i fönstret (inkl. buffers)
    counts = {}
    for u in users:
        cnt = db.query(models.BayBooking).filter(
            models.BayBooking.assigned_user_id == u.id,
            models.BayBooking.start_at < window_end,
            models.BayBooking.end_at > window_start
        ).count()
        counts[u.id] = cnt
    # sortera stigande (minst upptagen först)
    return sorted(users, key=lambda x: (counts.get(x.id, 0), x.id))

def _order_users_for_slot(
    db: Session,
    users: list[models.User],
    preferred_user: models.User | None,
    strategy: AssignmentStrategy,
    slot_seed: int,
    window_start: datetime,
    window_end: datetime,
) -> list[models.User]:
    # Behåll möjlighet att låsa till specifik mekare
    if preferred_user:
        return [preferred_user]

    # Baslista (kopiera)
    arr = list(users)

    if strategy == AssignmentStrategy.RANDOM:
        rnd = random.Random(slot_seed)      # deterministisk per tids-slot
        rnd.shuffle(arr)
    elif strategy == AssignmentStrategy.ROUND_ROBIN:
        # "Rotera" listan deterministiskt per tids-slot
        if len(arr) > 0:
            idx = slot_seed % len(arr)
            arr = arr[idx:] + arr[:idx]
    elif strategy == AssignmentStrategy.LEAST_BUSY:
        arr = _least_busy_order(db, arr, window_start, window_end)
    return arr

def _order_bays_for_slot(bays: list[models.WorkshopBay], slot_seed: int) -> list[models.WorkshopBay]:
    arr = list(bays)
    rnd = random.Random(slot_seed)
    rnd.shuffle(arr)
    return arr

def _collect_overlap_segments_multi_day(
    db: Session,
    bay_id: int,
    user_id: int,
    start_from: datetime,
    latest_end: datetime,
    tz: ZoneInfo,
    include_buffers: bool,
    max_days: int = 3,   # hur många kalenderdygn framåt vi får fragmentera över
):
    """
    Samla (start, end)-segment där bay är fri OCH användaren jobbar,
    från start_from (UTC, aware) upp till latest_end, över flera dagar.
    Returnerar sorterad lista av segment i UTC.
    """
    segments = []
    # börja på "väggen" där vi står, och kliv dag för dag i lokal tid
    cursor = start_from
    days_checked = 0
    while cursor < latest_end and days_checked < max_days:
        day_local = cursor.astimezone(tz).date()
        day_start = datetime.combine(day_local, time(0, 0, 0), tz)
        day_end   = day_start + timedelta(days=1)

        rng_start = max(cursor, day_start)
        rng_end   = min(latest_end, day_end)
        if rng_end > rng_start:
            # 1) Bay-fria segment i detta dagsintervall
            bay_free_segments = _bay_free_segments(
                db, bay_id, [(rng_start, rng_end)], include_buffers=include_buffers
            )
            if bay_free_segments:
                # 2) Mekanikerns arbetspass denna dag
                work_wins = _user_work_windows_for_date(db, user_id, day_local, tz)
                # 3) Skärning
                for bs, be in bay_free_segments:
                    for ws_s, ws_e in work_wins:
                        s = max(bs, ws_s)
                        e = min(be, ws_e)
                        if e > s:
                            segments.append((s, e))

        # hoppa till nästa lokala dygn
        cursor = day_end
        days_checked += 1

    # sortera och slå ihop angränsande segment om de sitter rygg i rygg
    segments.sort()
    merged = []
    for s, e in segments:
        if not merged or s > merged[-1][1]:
            merged.append([s, e])
        else:
            merged[-1][1] = max(merged[-1][1], e)
    return [(s, e) for s, e in merged]


def _user_timeoff_overlaps(db, user_id: int, start_at: datetime, end_at: datetime) -> bool:
    """
    True om det finns någon UserTimeOff som överlappar [start_at, end_at).
    Antar att start_at/end_at är TZ-aware (UTC).
    """
    # tstzrange( start, end ) && tstzrange(start_at, end_at)
    q = db.query(models.UserTimeOff.id).filter(
        models.UserTimeOff.user_id == user_id,
        func.tstzrange(
            func.least(start_at, end_at),
            func.greatest(start_at, end_at),
            '[]'  # inklusiv start, exklusiv end → välj vad som passar ditt system
        ).op("&&")(
            func.tstzrange(models.UserTimeOff.start_at, models.UserTimeOff.end_at, '[]')
        )
    ).limit(1)
    return db.query(q.exists()).scalar()

def _tz_for_workshop(ws: models.Workshop) -> ZoneInfo:
    """
    Returnera verkstadens tidszon som ZoneInfo.
    Defaultar till Europe/Stockholm, och om tzdata saknas faller vi tillbaka till UTC.
    """
    tz_name = getattr(ws, "timezone", None) or "Europe/Stockholm"
    try:
        return ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        # Fallback om tzdata saknas eller felaktigt namn
        # (tips: installera 'tzdata' på Windows)
        return ZoneInfo("UTC")

def _local_wall_time(dt: datetime, tz: ZoneInfo) -> time:
    """
    Gör om en (ev. tz-aware) datetime till lokal väggklocka (naiv time()).
    Viktigt: .time() (inte .timetz()) så den blir tz-naiv för jämförelsen mot DB.
    """
    return dt.astimezone(tz).time()

def _now_utc() -> datetime:
    return datetime.now(timezone.utc)

def _ensure_workshop(db: Session, workshop_id: int) -> models.Workshop:
    ws = db.query(models.Workshop).filter(models.Workshop.id == workshop_id).first()
    if not ws:
        raise HTTPException(status_code=404, detail="Verkstad hittades inte")
    return ws

def _ensure_bay_in_workshop(db: Session, workshop_id: int, bay_id: int) -> models.WorkshopBay:
    bay = db.query(models.WorkshopBay).filter(models.WorkshopBay.id == bay_id).first()
    if not bay:
        raise HTTPException(status_code=404, detail="Arbetsplats (bay) hittades inte")
    if bay.workshop_id != workshop_id:
        raise HTTPException(status_code=400, detail="Arbetsplatsen tillhör inte angiven verkstad")
    return bay

def _get_car_by_reg(db: Session, reg: str) -> Optional[models.Car]:
    reg = (reg or "").strip().upper()
    if not reg:
        return None
    return db.query(models.Car).filter(models.Car.registration_number == reg).first()

def _overlap(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return a_start < b_end and b_start < a_end

def _overlap_clause(col_start, col_end, q_start: datetime, q_end: datetime):
    return and_(col_start < q_end, q_start < col_end)

def _validate_vehicle_vs_bay(db: Session, bay: models.WorkshopBay, car: Optional[models.Car]) -> None:
    if not car:
        return
    profile = db.query(models.VehicleProfile).filter(models.VehicleProfile.car_id == car.id).first()
    if not profile:
        return
    # Klass-stöd
    if bay.supported_vehicle_classes and profile.vehicle_class not in bay.supported_vehicle_classes:
        raise HTTPException(status_code=400, detail=f"Arbetsplatsen stödjer inte fordonsklassen '{profile.vehicle_class.value}'.")
    # Mått/vikt
    if bay.max_length_mm and profile.length_mm and profile.length_mm > bay.max_length_mm:
        raise HTTPException(status_code=400, detail="Fordonets längd överskrider arbetsplatsens maxlängd.")
    if bay.max_width_mm and profile.width_mm and profile.width_mm > bay.max_width_mm:
        raise HTTPException(status_code=400, detail="Fordonets bredd överskrider arbetsplatsens maxbredd.")
    if bay.max_height_mm and profile.height_mm and profile.height_mm > bay.max_height_mm:
        raise HTTPException(status_code=400, detail="Fordonets höjd överskrider arbetsplatsens maxhöjd.")
    if bay.max_weight_kg and profile.weight_kg and profile.weight_kg > bay.max_weight_kg:
        raise HTTPException(status_code=400, detail="Fordonets vikt överskrider arbetsplatsens maxvikt.")

def _bay_slot_is_free(
    db: Session,
    bay_id: int,
    start_at: datetime,
    end_at: datetime,
    include_buffers: bool,
) -> bool:
    """
    Kollar krock mot andra bokningar (inkl. deras buffertar) och BayClosures.
    Om include_buffers=True väger vi även in buffert för den föreslagna sloten.
    """
    # Befintliga bokningar i samma bay
    bookings = db.query(models.BayBooking).filter(
        models.BayBooking.bay_id == bay_id,
        _overlap_clause(models.BayBooking.start_at, models.BayBooking.end_at, start_at - timedelta(minutes=120), end_at + timedelta(minutes=120))
    ).all()

    test_start = start_at
    test_end = end_at
    if include_buffers:
        # Använd förenklad "default" buffert på 0 här (själva förslaget har ingen egen buffert än)
        # Det viktiga är att vi respekterar ANDRAS buffertar.
        pass

    for b in bookings:
        other_start = b.start_at - timedelta(minutes=b.buffer_before_min or 0)
        other_end = b.end_at + timedelta(minutes=b.buffer_after_min or 0)
        if _overlap(test_start, test_end, other_start, other_end):
            return False

    # Bay closures
    closures = db.query(models.BayClosure).filter(
        models.BayClosure.bay_id == bay_id,
        _overlap_clause(models.BayClosure.start_at, models.BayClosure.end_at, test_start, test_end)
    ).first()
    if closures:
        return False

    return True

def _user_is_available(
    db: Session,
    user: models.User,
    start_at: datetime,
    end_at: datetime,
    tz: ZoneInfo,
) -> bool:
    """
    Svarar True om användaren kan arbeta i intervallet [start_at, end_at).
    Antag att start_at/end_at är TZ-aware (UTC).
    Regler:
      1) Intervallet måste rymmas helt inom minst ett arbetspass (efter valid_from/valid_to
         och gärna efter att time-off skurits bort i _user_work_windows_for_date).
      2) Får inte överlappa någon UserTimeOff.
      3) Får inte överlappa andra tilldelade bokningar (med hänsyn till buffers).
    """

    if end_at <= start_at:
        return False

    # --- 1) Måste rymmas i ett arbetspass ---
    day_local_start: date = start_at.astimezone(tz).date()
    day_local_end: date = end_at.astimezone(tz).date()

    windows: List[Tuple[datetime, datetime]] = []
    # alltid kolla start-dagen
    windows.extend(_user_work_windows_for_date(db, user.id, day_local_start, tz))
    # om det korsar midnatt, kolla även end-dagen
    if day_local_end != day_local_start:
        windows.extend(_user_work_windows_for_date(db, user.id, day_local_end, tz))

    # sortera och slå ev. ihop direkt angränsande fönster (valfritt)
    windows.sort(key=lambda se: se[0])

    # kräver att hela slotten ryms i ett fönster
    covered = any(ws <= start_at and end_at <= we for (ws, we) in windows)
    if not covered:
        return False

    # --- 2) Får inte krocka med time-off ---
    # klassiskt överlapps-test: NOT (A slutar före B börjar ELLER A börjar efter B slutar)
    to_conflict = db.query(models.UserTimeOff.id).filter(
        models.UserTimeOff.user_id == user.id,
        func.tstzrange(models.UserTimeOff.start_at, models.UserTimeOff.end_at, '[]').op('&&')(
            func.tstzrange(start_at, end_at, '[]')
        )
    ).first()
    if to_conflict:
        return False

    # --- 3) Får inte krocka med andra tilldelade bokningar (inkl buffers) ---
    assigned = db.query(models.BayBooking).filter(
        models.BayBooking.assigned_user_id == user.id,
        # grov överlapp för att begränsa urval (utan buffer i SQL, vi finjusterar i Python)
        ~(
            (models.BayBooking.end_at <= start_at) |
            (models.BayBooking.start_at >= end_at)
        )
    ).all()

    for b in assigned:
        buf_before = timedelta(minutes=b.buffer_before_min or 0)
        buf_after = timedelta(minutes=b.buffer_after_min or 0)
        other_start = (b.start_at - buf_before)
        other_end   = (b.end_at + buf_after)
        # överlapp?
        if not (other_end <= start_at or other_start >= end_at):
            return False

    return True

def _duration_for_service_item(si: models.WorkshopServiceItem) -> int:
    # Baseras på default_duration_min, annars 60 som robust fallback
    return int(si.default_duration_min or 60)

def _candidate_bays_for_vehicle(db: Session, workshop_id: int, car: Optional[models.Car]) -> List[models.WorkshopBay]:
    bays = db.query(models.WorkshopBay).filter(models.WorkshopBay.workshop_id == workshop_id).all()
    if not car:
        return bays
    profile = db.query(models.VehicleProfile).filter(models.VehicleProfile.car_id == car.id).first()
    if not profile:
        return bays

    res = []
    for bay in bays:
        # Fordonsklass
        if bay.supported_vehicle_classes and profile.vehicle_class not in bay.supported_vehicle_classes:
            continue
        # Mått/vikt
        if bay.max_length_mm and profile.length_mm and profile.length_mm > bay.max_length_mm:
            continue
        if bay.max_width_mm and profile.width_mm and profile.width_mm > bay.max_width_mm:
            continue
        if bay.max_height_mm and profile.height_mm and profile.height_mm > bay.max_height_mm:
            continue
        if bay.max_weight_kg and profile.weight_kg and profile.weight_kg > bay.max_weight_kg:
            continue
        res.append(bay)
    return res

def _employees_in_workshop(db: Session, workshop_id: int) -> List[models.User]:
    return (
        db.query(models.User)
        .join(models.user_workshop_association,
              models.user_workshop_association.c.user_id == models.User.id)
        .filter(models.user_workshop_association.c.workshop_id == workshop_id)
        .filter(models.User.role.in_(list(ALLOWED_EMPLOYEE_ROLES)))
        .all()
    )

def _round_up(dt: datetime, minutes: int) -> datetime:
    # runda upp till närmsta intervall
    k = (dt.minute % minutes)
    if k == 0 and dt.second == 0 and dt.microsecond == 0:
        return dt
    delta = minutes - k
    return (dt.replace(second=0, microsecond=0) + timedelta(minutes=delta))

STHLM_TZ = ZoneInfo("Europe/Stockholm")

def _ensure_aware_utc(dt: datetime, local_tz: ZoneInfo = STHLM_TZ) -> datetime | None:
    """
    Gör om inkommande datetime till AWARE UTC.
    - Om dt är naiv: anta svensk lokal tid (Europe/Stockholm).
    - Om dt är aware: konvertera till UTC.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        # dt kommer t.ex. från <input type="datetime-local"> (naiv lokal tid i webbläsaren)
        local = dt.replace(tzinfo=local_tz)
        return local.astimezone(timezone.utc)
    return dt.astimezone(timezone.utc)

def _user_work_windows_for_date(db, user_id: int, the_date, tz: ZoneInfo):
    weekday = the_date.weekday()
    rows = (db.query(models.UserWorkingHours)
              .filter(models.UserWorkingHours.user_id == user_id,
                      models.UserWorkingHours.weekday == weekday)
              .all())
    wins = []
    for r in rows:
        # Filtrera på valid_from/to om satta
        if r.valid_from and the_date < r.valid_from: continue
        if r.valid_to and the_date > r.valid_to: continue
        s = datetime.combine(the_date, r.start_time, tz)
        e = datetime.combine(the_date, r.end_time, tz)
        wins.append((s, e))
    # sortera och slå ihop överlappande, lämna lunch som lucka
    wins.sort()
    merged = []
    for s,e in wins:
        if not merged or s >= merged[-1][1]:
            merged.append([s,e])
        else:
            merged[-1][1] = max(merged[-1][1], e)
    return [(s,e) for s,e in merged]

def _segments_fit_duration(segments, duration_min: int):
    """Försök fylla durationen över flera segment i ordning.
       Returnerar lista av (start,end) om det går, annars None."""
    remaining = timedelta(minutes=duration_min)
    res = []
    for s,e in segments:
        if remaining <= timedelta(0): break
        take = min(remaining, e - s)
        if take > timedelta(0):
            res.append((s, s + take))
            remaining -= take
    return res if remaining <= timedelta(0) else None

def _bay_free_segments(db, bay_id: int, segments, include_buffers: bool):
    """Klipp bort krockar (bokningar + closure) ur segmenten och returnera lediga bitar."""
    free = []
    for seg_s, seg_e in segments:
        cur_s = seg_s
        # hämta allt som kan störa inom spannet
        blks = []
        # befintliga bokningar inkl. deras buffert
        bookings = db.query(models.BayBooking).filter(
            models.BayBooking.bay_id == bay_id,
            models.BayBooking.start_at < seg_e,
            models.BayBooking.end_at > seg_s
        ).all()
        for b in bookings:
            bs = b.start_at - timedelta(minutes=b.buffer_before_min or 0)
            be = b.end_at   + timedelta(minutes=b.buffer_after_min or 0)
            blks.append((max(bs, seg_s), min(be, seg_e)))
        # closures
        closures = db.query(models.BayClosure).filter(
            models.BayClosure.bay_id == bay_id,
            models.BayClosure.start_at < seg_e,
            models.BayClosure.end_at > seg_s
        ).all()
        for c in closures:
            blks.append((max(c.start_at, seg_s), min(c.end_at, seg_e)))
        # klipp ut blockeringar
        blks.sort()
        pos = seg_s
        for bs,be in blks:
            if pos < bs:
                free.append((pos, bs))
            pos = max(pos, be)
        if pos < seg_e:
            free.append((pos, seg_e))
    # filtrera bort negativa/0-längd
    return [(s,e) for s,e in free if e > s]




# =========================
# Endpoints
# =========================

@router.post("/availability/auto", response_model=AvailabilityResponse)
def availability_auto(payload: AvailabilityRequest, db: Session = Depends(get_db)):
    # ---------- helpers (lokala för denna funktion) ----------
    def _dedupe_key(bay_id: int, user_id: int, s: datetime, e: datetime):
        su = s.astimezone(timezone.utc)
        eu = e.astimezone(timezone.utc)
        # normalisera till hela sekunder (räcker gott för slots)
        return (bay_id, user_id, int(su.timestamp()), int(eu.timestamp()))

    # Workshop + tz
    ws = _ensure_workshop(db, payload.workshop_id)
    tz = _tz_for_workshop(ws)

    # 0) Service item
    si = db.query(models.WorkshopServiceItem).filter(
        models.WorkshopServiceItem.id == payload.service_item_id,
        models.WorkshopServiceItem.workshop_id == payload.workshop_id
    ).first()
    if not si:
        raise HTTPException(status_code=404, detail="Service item hittades inte i denna verkstad")

    base_duration = _duration_for_service_item(si)
    duration_min = int(payload.override_duration_min or base_duration)
    if duration_min <= 0:
        raise HTTPException(status_code=400, detail="Ogiltig varaktighet.")

    # 1) Car via reg nr (valfritt)
    car = _get_car_by_reg(db, payload.registration_number)

    # 2) Kandidat-bays
    bays = _candidate_bays_for_vehicle(db, payload.workshop_id, car)
    if not bays:
        return AvailabilityResponse(proposals=[], reason_if_empty="Inga arbetsplatser matchar fordonsprofilen.")

    # 3) Kandidat-anställda
    employees = _employees_in_workshop(db, payload.workshop_id)
    if not employees:
        return AvailabilityResponse(proposals=[], reason_if_empty="Verkstaden saknar användare med schema-roller.")

    preferred_user = None
    if payload.prefer_user_id:
        preferred_user = next(
            (u for u in employees if u.id == payload.prefer_user_id),
            None
        )
        if not preferred_user:
            return AvailabilityResponse(proposals=[], reason_if_empty="Önskad mekaniker finns inte i verkstaden.")

    # 4) Tidsfönster (aware)
    start_from = _ensure_aware_utc(payload.earliest_from) or _now_utc()
    latest_end = _ensure_aware_utc(payload.latest_end) or (start_from + timedelta(days=30))
    if latest_end <= start_from:
        raise HTTPException(status_code=400, detail="latest_end måste vara efter earliest_from")

    # 5) Sökning
    step = max(5, int(payload.interval_granularity_min or 15))
    slot_delta = timedelta(minutes=duration_min)
    strategy = payload.assignment_strategy or AssignmentStrategy.RANDOM

    current = _round_up(start_from, step)
    proposals: List[AvailabilityProposal] = []
    seen = set()  # nycklar från _dedupe_key

    while current + slot_delta <= latest_end and len(proposals) < payload.num_proposals:
        candidate_end = current + slot_delta

        # deterministiskt seed per tids-slot (kan gärna inkludera workshop_id)
        slot_seed = int(current.timestamp()) ^ payload.workshop_id

        # 1) Bay-ordning enligt strategi (för RANDOM shufflas de)
        bays_ordered = _order_bays_for_slot(bays, slot_seed)

        for bay in bays_ordered:
            # --- Försök 1: sammanhängande slot ---
            if _bay_slot_is_free(db, bay.id, current, candidate_end, include_buffers=payload.include_buffers):
                ordered_users = _order_users_for_slot(
                    db=db,
                    users=employees,
                    preferred_user=preferred_user,
                    strategy=strategy,
                    slot_seed=slot_seed ^ bay.id,  # spridning per bay
                    window_start=current,
                    window_end=candidate_end,
                )
                for u in ordered_users:
                    if _user_is_available(db, u, current, candidate_end, tz):
                        key = _dedupe_key(bay.id, u.id, current, candidate_end)
                        if key in seen:
                            break
                        seen.add(key)
                        s_local = current.astimezone(tz)
                        e_local = candidate_end.astimezone(tz)
                        proposals.append(AvailabilityProposal(
                            bay_id=bay.id,
                            start_at=s_local,
                            end_at=e_local,
                            assigned_user_id=u.id,
                            notes=f"{getattr(bay, 'name', '') or 'Bay'}"
                        ))
                        break
                if len(proposals) >= payload.num_proposals:
                    break
                # gå vidare till nästa bay
                continue

            if len(proposals) >= payload.num_proposals:
                break

            # --- Försök 2: fragmenterat över flera dagar ---
            ordered_users = _order_users_for_slot(
                db=db,
                users=employees,
                preferred_user=preferred_user,
                strategy=strategy,
                slot_seed=(slot_seed * 31) ^ bay.id,
                window_start=current,
                window_end=min(latest_end, current + timedelta(days=3)),
            )

            for u in ordered_users:
                overlap_segments = _collect_overlap_segments_multi_day(
                    db=db,
                    bay_id=bay.id,
                    user_id=u.id,
                    start_from=current,
                    latest_end=latest_end,
                    tz=tz,
                    include_buffers=payload.include_buffers,
                    max_days=3,
                )
                if not overlap_segments:
                    continue

                remaining = timedelta(minutes=duration_min)
                candidate_parts: List[tuple[datetime, datetime]] = []

                for seg_s, seg_e in overlap_segments:
                    if remaining <= timedelta(0):
                        break
                    start_in_seg = max(seg_s, current)
                    if seg_e <= start_in_seg:
                        continue
                    take = min(remaining, seg_e - start_in_seg)
                    part_s = start_in_seg
                    part_e = start_in_seg + take
                    if _user_is_available(db, u, part_s, part_e, tz):
                        candidate_parts.append((part_s, part_e))
                        remaining -= take

                if remaining > timedelta(0) or not candidate_parts:
                    continue

                first_start = candidate_parts[0][0]
                last_end = candidate_parts[-1][1]
                key = _dedupe_key(bay.id, u.id, first_start, last_end)
                if key in seen:
                    break
                seen.add(key)

                s_local = first_start.astimezone(tz)
                e_local = last_end.astimezone(tz)

                pause_note = ""
                if len(candidate_parts) > 1:
                    gaps = []
                    for i in range(len(candidate_parts) - 1):
                        g_s = candidate_parts[i][1].astimezone(tz).strftime("%H:%M")
                        g_e = candidate_parts[i + 1][0].astimezone(tz).strftime("%H:%M")
                        gaps.append(f"{g_s}–{g_e}")
                    if gaps:
                        pause_note = f" (paus: {', '.join(gaps)})"

                parts_payload = [
                    AvailabilityPart(start_at=ps.astimezone(tz), end_at=pe.astimezone(tz))
                    for (ps, pe) in candidate_parts
                ]

                proposals.append(AvailabilityProposal(
                    bay_id=bay.id,
                    start_at=s_local,
                    end_at=e_local,
                    assigned_user_id=u.id,
                    notes=f"{getattr(bay, 'name', '') or 'Bay'}{pause_note}",
                    parts=parts_payload
                ))
                break  # klar med denna bay

        current += timedelta(minutes=step)

    reason = None if proposals else "Ingen ledig tid i valt datumintervall."
    return AvailabilityResponse(proposals=proposals, reason_if_empty=reason)


@router.post("/auto-schedule", response_model=schemas.BayBookingRead)
def auto_schedule(payload: AutoScheduleRequest, db: Session = Depends(get_db)):
    # 0) Workshop + tidszon + bay
    workshop = _ensure_workshop(db, payload.workshop_id)
    tz = _tz_for_workshop(workshop)
    bay = _ensure_bay_in_workshop(db, payload.workshop_id, payload.bay_id)

    # 1) Normalisera inkommande tider (om klienten råkar skicka naiva datums)
    start_at = _ensure_aware_utc(payload.start_at)
    end_at = _ensure_aware_utc(payload.end_at)

    if end_at <= start_at:
        raise HTTPException(status_code=400, detail="end_at måste vara efter start_at")

    # 2) Hämta bil (frivilligt via car_id eller regnr)
    car = None
    if payload.car_id:
        car = db.query(models.Car).filter(models.Car.id == payload.car_id).first()
        if not car:
            raise HTTPException(status_code=404, detail="Bil (car_id) hittades inte")
    elif payload.registration_number:
        car = _get_car_by_reg(db, payload.registration_number)

    # 3) Validera fordonsprofil mot bay
    _validate_vehicle_vs_bay(db, bay, car)

    # 4) Bay ledig?
    if not _bay_slot_is_free(db, bay.id, start_at, end_at, include_buffers=True):
        raise HTTPException(status_code=409, detail="Arbetsplatsen är upptagen i vald tid.")

    # 5) Mekaniker ledig? (om specificerad)
    if payload.assigned_user_id:
        user = db.query(models.User).filter(models.User.id == payload.assigned_user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Tilldelad användare hittades inte")
        if user.role.value not in ALLOWED_EMPLOYEE_ROLES:
            raise HTTPException(status_code=400, detail="Tilldelad användare har inte en verkstadsroll")
        if not _user_is_available(db, user, start_at, end_at, tz):
            raise HTTPException(status_code=409, detail="Tilldelad användare är upptagen i vald tid.")

    # 5.5) Enkel prisvalidering (MVP)
    if payload.vat_percent is not None and not (0 <= payload.vat_percent <= 100):
        raise HTTPException(status_code=400, detail="vat_percent måste vara 0..100")

    for k in ("price_net_ore", "price_gross_ore"):
        v = getattr(payload, k)
        if v is not None and v < 0:
            raise HTTPException(status_code=400, detail=f"{k} kan inte vara negativt")

    # ----- CHAIN_TOKEN-logik -----
    chain_token = getattr(payload, "chain_token", None)
    chain_master = None
    if chain_token:
        chain_master = (
            db.query(models.BayBooking)
              .filter(models.BayBooking.chain_token == chain_token)
              .order_by(models.BayBooking.id.asc())
              .first()
        )
        if chain_master:
            # Sanity: håll kedjan konsekvent
            if chain_master.workshop_id != payload.workshop_id:
                raise HTTPException(status_code=400, detail="Alla delar i en kedja måste tillhöra samma verkstad.")
            if chain_master.car_id and (car and chain_master.car_id != car.id):
                raise HTTPException(status_code=400, detail="Alla delar i en kedja måste vara kopplade till samma bil.")
            if chain_master.service_item_id and payload.service_item_id and \
               chain_master.service_item_id != payload.service_item_id:
                raise HTTPException(status_code=400, detail="Alla delar i en kedja måste referera samma service_item.")

    # 6) Skapa bokningen via samma core som /create
    data = payload.dict(exclude_unset=True)
    data["start_at"] = start_at
    data["end_at"] = end_at
    data["car_id"] = (car.id if car else payload.car_id)
    data["status"] = models.BookingStatus.BOOKED
    data["source"] = payload.source or "auto"

    # ta bort fält som inte finns i BayBookingCreate
    data.pop("registration_number", None)

    # Sätt chain_token om den finns
    if chain_token:
        data["chain_token"] = chain_token

        # Om kedjan redan har en bokning → ta bort alla prisfält här
        # (debitering ska ske på första delen för att undvika dubbeldebitering)
        if chain_master:
            for k in ("price_net_ore", "price_gross_ore", "final_price_ore", "price_note", "price_is_custom"):
                data.pop(k, None)

            # Lås bil / service_item om master har dem
            if chain_master.car_id and not data.get("car_id"):
                data["car_id"] = chain_master.car_id
            if chain_master.service_item_id and not data.get("service_item_id"):
                data["service_item_id"] = chain_master.service_item_id

    bay_create = schemas.BayBookingCreate(**data)
    return _create_booking_core(db, bay_create)


@router.post("/{booking_id}/complete-with-time", response_model=schemas.BayBookingRead)
def complete_with_time(
    booking_id: int,
    payload: CompleteWithTimeRequest,
    db: Session = Depends(get_db),
):
    booking = db.query(models.BayBooking).filter(models.BayBooking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")

    if payload.actual_minutes_spent < 0:
        raise HTTPException(status_code=400, detail="Tid (minuter) kan inte vara negativ")

    booking.actual_minutes_spent = payload.actual_minutes_spent

    # --- FALL 1: Eget slutpris (NETTO i öre) ---
    if payload.use_custom_final_price:
        if payload.custom_final_price_ore is None or payload.custom_final_price_ore < 0:
            raise HTTPException(
                status_code=400,
                detail="custom_final_price_ore måste vara >= 0 när use_custom_final_price=true."
            )
        booking.billed_from_time = False
        booking.final_price_ore = payload.custom_final_price_ore     # NETTO
        booking.price_net_ore   = payload.custom_final_price_ore     # NETTO
        booking.price_gross_ore = None                                # DB ska inte bära brutto
        # behåll befintlig moms (eller sätt om du vill låsa en viss)
        booking.status = models.BookingStatus.COMPLETED
        db.commit(); db.refresh(booking)
        return booking

    # --- FALL 2: Debitera tid × timpris ---
    if payload.charge_more_than_estimate:
        si = None
        if booking.service_item_id:
            si = db.query(models.WorkshopServiceItem).filter(
                models.WorkshopServiceItem.id == booking.service_item_id
            ).first()

        if not si or si.price_type != models.ServicePriceType.HOURLY or si.hourly_rate_ore is None:
            raise HTTPException(status_code=400, detail="Kan inte debitera tid: saknar giltigt timpris på service_item.")

        hours = payload.actual_minutes_spent / 60.0
        net_ore = int(round(hours * (si.hourly_rate_ore or 0)))

        # Moms: ta från service item om finns, annars fall back till bokning
        vat = si.vat_percent if si.vat_percent is not None else (booking.vat_percent or 0)
        if vat < 0 or vat > 100:
            vat = 0

        booking.billed_from_time = True
        booking.price_net_ore    = net_ore
        booking.price_gross_ore  = None
        booking.vat_percent      = vat
        booking.final_price_ore  = net_ore
        booking.status = models.BookingStatus.COMPLETED
        db.commit(); db.refresh(booking)
        return booking

    # --- FALL 3: Behåll uppskattat pris (ALLTID sätt final_price_ore) ---
    final_net = booking.price_net_ore
    if final_net is None:
        if booking.price_gross_ore is not None and (booking.vat_percent or 0) >= 0:
            factor = 1 + (booking.vat_percent or 0) / 100.0
            final_net = int(round(booking.price_gross_ore / factor))
        else:
            raise HTTPException(status_code=400, detail="Kan inte fastställa netto-pris att spara som slutpris.")

    booking.billed_from_time = False
    booking.final_price_ore  = final_net
    booking.price_net_ore    = final_net
    booking.price_gross_ore  = None
    booking.status = models.BookingStatus.COMPLETED

    db.commit(); db.refresh(booking)
    return booking


