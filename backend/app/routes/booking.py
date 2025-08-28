from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from fastapi import APIRouter, Depends, HTTPException, Path, Response
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import and_, func
from typing import List, Optional, Tuple, Dict
from datetime import datetime, timedelta, time, timezone, date
from pydantic import BaseModel
import random
from enum import Enum

from app.services.sms_service import SmsService
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
    phone_override_e164: str | None = None

class AvailabilityRequest(schemas.BaseModel):
    workshop_id: int
    registration_number: str
    service_item_id: int
    earliest_from: Optional[datetime] = None
    latest_end: Optional[datetime] = None
    prefer_user_id: Optional[int] = None
    num_proposals: int = 3
    interval_granularity_min: int = 15
    include_buffers: bool = True
    override_duration_min: Optional[int] = None
    assignment_strategy: AssignmentStrategy | None = AssignmentStrategy.RANDOM

    # HYBRID: styr vilka data vi vill få tillbaka
    return_candidates: bool = True
    max_candidates_per_slot: int = 5

    # NEW: minsta förbokningstid (lead time)
    min_lead_time_min: int = 30

    # NEW: förenklad logik default – bara sammanhängande slots
    allow_fragmented_parts: bool = False


class AvailabilityPart(schemas.BaseModel):
    start_at: datetime
    end_at: datetime


class MechanicCandidate(schemas.BaseModel):
    user_id: int
    score: int  # 0..100
    rank: int   # 1 = bäst
    reasons: List[str] = []


class SlotDiagnostics(schemas.BaseModel):
    disqualified: Optional[List[MechanicCandidate]] = None


class SlotMeta(schemas.BaseModel):
    recommended_user_id: Optional[int] = None
    candidates: Optional[List[MechanicCandidate]] = None
    diagnostics: Optional[SlotDiagnostics] = None


class AvailabilityProposal(schemas.BaseModel):
    bay_id: int
    start_at: datetime
    end_at: datetime
    assigned_user_id: Optional[int] = None  # lämnas normalt tom (UI väljer)
    notes: Optional[str] = None
    parts: Optional[List[AvailabilityPart]] = None
    meta: Optional[SlotMeta] = None


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
    registration_number: Optional[str] = None
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

def _candidate_bays_for_vehicle(db: Session, workshop_id: int, car: Optional[models.Car]) -> List[models.WorkshopBay]:
    # Enkelt: inga filters alls → alla bays i verkstaden är "all"
    return (
        db.query(models.WorkshopBay)
        .filter(models.WorkshopBay.workshop_id == workshop_id)
        .all()
    )

ALLOWED_EMPLOYEE_ROLES = {
    models.UserRole.WORKSHOP_USER.value,
    models.UserRole.WORKSHOP_EMPLOYEE.value,
}

STHLM_TZ = ZoneInfo("Europe/Stockholm")
MIN_FRAGMENT_MINUTES = 30
MAX_FRAGMENT_PARTS = 3
MAX_FRAGMENT_DAYS = 3

def _ensure_aware_utc(dt: datetime | None) -> datetime | None:
    """
    Säkerställ att datetime är tidszonsmedveten (UTC).
    Om den är naiv (ingen tzinfo), anta att den är lokal och konvertera till UTC.
    Returnerar None om dt är None.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        # Anta att inkommande är UTC om inget anges
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

def _least_busy_order(db: Session, users: list[models.User], window_start: datetime, window_end: datetime) -> list[models.User]:
    counts = {}
    for u in users:
        cnt = (
            db.query(models.BayBooking)
            .filter(
                models.BayBooking.assigned_user_id == u.id,
                models.BayBooking.start_at < window_end,
                models.BayBooking.end_at > window_start,
            )
            .count()
        )
        counts[u.id] = cnt
    return sorted(users, key=lambda x: (counts.get(x.id, 0), x.id))

def _next_any_bay_cover_start(
    db: Session,
    bays: List[models.WorkshopBay],
    users: List[models.User],
    from_utc: datetime,
    duration_min: int,
    tz: ZoneInfo,
    step_min: int,
    latest_end: datetime,
    include_buffers: bool,
) -> Optional[datetime]:
    """
    Skanna framåt från from_utc (rundat i _caller_) och hitta NÄSTA starttid där:
      a) Minst en mek har arbetspass som rymmer hela varaktigheten (billig koll), OCH
      b) Minst en bay är fri i samma intervall (inkl. buffers).
    Returnerar UTC-datetime eller None om ingen hittas före latest_end.
    """
    dur = timedelta(minutes=duration_min)
    limit = latest_end
    t = from_utc
    while t + dur <= limit:
        cand_end = t + dur

        # a) mektäckning (billig prefilter)
        if _cheap_wallclock_cover(users, t, cand_end, tz, db):
            # b) någon bay fri?
            for bay in bays:
                if _bay_slot_is_free(db, bay.id, t, cand_end, include_buffers=include_buffers):
                    return t

        # öka i steg och runda i lokal TZ så vi inte vandrar ur sync
        t = _round_up_local(t + timedelta(minutes=step_min), step_min, tz)

    return None

def _order_users_for_slot(
    db: Session,
    users: list[models.User],
    strategy: AssignmentStrategy,
    slot_seed: int,
    window_start: datetime,
    window_end: datetime,
) -> list[models.User]:
    arr = list(users)
    if strategy == AssignmentStrategy.RANDOM:
        rnd = random.Random(slot_seed)
        rnd.shuffle(arr)
    elif strategy == AssignmentStrategy.ROUND_ROBIN:
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


def _tz_for_workshop(ws: models.Workshop) -> ZoneInfo:
    tz_name = getattr(ws, "timezone", None) or "Europe/Stockholm"
    try:
        return ZoneInfo(tz_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


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
    if bay.supported_vehicle_classes and profile.vehicle_class not in bay.supported_vehicle_classes:
        raise HTTPException(status_code=400, detail=f"Arbetsplatsen stödjer inte fordonsklassen '{profile.vehicle_class.value}'.")
    if bay.max_length_mm and profile.length_mm and profile.length_mm > bay.max_length_mm:
        raise HTTPException(status_code=400, detail="Fordonets längd överskrider arbetsplatsens maxlängd.")
    if bay.max_width_mm and profile.width_mm and profile.width_mm > bay.max_width_mm:
        raise HTTPException(status_code=400, detail="Fordonets bredd överskrider arbetsplatsens maxbredd.")
    if bay.max_height_mm and profile.height_mm and profile.height_mm > bay.max_height_mm:
        raise HTTPException(status_code=400, detail="Fordonets höjd överskrider arbetsplatsens maxhöjd.")
    if bay.max_weight_kg and profile.weight_kg and profile.weight_kg > bay.max_weight_kg:
        raise HTTPException(status_code=400, detail="Fordonets vikt överskrider arbetsplatsens maxvikt.")


def _round_up(dt: datetime, minutes: int) -> datetime:
    k = dt.minute % minutes
    if k == 0 and dt.second == 0 and dt.microsecond == 0:
        return dt.replace(second=0, microsecond=0)
    delta = minutes - k
    return (dt.replace(second=0, microsecond=0) + timedelta(minutes=delta))


def _round_up_local(dt_utc: datetime, minutes: int, tz: ZoneInfo) -> datetime:
    local = dt_utc.astimezone(tz)
    rounded_local = _round_up(local, minutes)
    return rounded_local.astimezone(timezone.utc)


def _duration_for_service_item(si: models.WorkshopServiceItem) -> int:
    return int(si.default_duration_min or 60)


def _employees_in_workshop(db: Session, workshop_id: int) -> List[models.User]:
    return (
        db.query(models.User)
        .join(models.user_workshop_association, models.user_workshop_association.c.user_id == models.User.id)
        .filter(models.user_workshop_association.c.workshop_id == workshop_id)
        .filter(models.User.role.in_(list(ALLOWED_EMPLOYEE_ROLES)))
        .all()
    )


def _user_work_windows_for_date(db, user_id: int, the_date: date, tz: ZoneInfo) -> List[Tuple[datetime, datetime]]:
    weekday = the_date.weekday()
    rows = (
        db.query(models.UserWorkingHours)
        .filter(models.UserWorkingHours.user_id == user_id, models.UserWorkingHours.weekday == weekday)
        .all()
    )
    wins: List[Tuple[datetime, datetime]] = []
    for r in rows:
        if r.valid_from and the_date < r.valid_from:
            continue
        if r.valid_to and the_date > r.valid_to:
            continue
        s = datetime.combine(the_date, r.start_time, tz)
        e = datetime.combine(the_date, r.end_time, tz)
        wins.append((s, e))
    wins.sort()
    merged = []
    for s, e in wins:
        if not merged or s >= merged[-1][1]:
            merged.append([s, e])
        else:
            merged[-1][1] = max(merged[-1][1], e)
    return [(s, e) for s, e in merged]


def _user_timeoff_overlaps(db: Session, user_id: int, start_at: datetime, end_at: datetime) -> bool:
    q = (
        db.query(models.UserTimeOff.id)
        .filter(
            models.UserTimeOff.user_id == user_id,
            func.tstzrange(func.least(start_at, end_at), func.greatest(start_at, end_at), "[]")
            .op("&&")(func.tstzrange(models.UserTimeOff.start_at, models.UserTimeOff.end_at, "[]")),
        )
        .limit(1)
    )
    return db.query(q.exists()).scalar()


def _user_is_available(db: Session, user: models.User, start_at: datetime, end_at: datetime, tz: ZoneInfo) -> bool:
    if end_at <= start_at:
        return False

    # 1) Full täckning av arbetspass (lokal TZ)
    d1: date = start_at.astimezone(tz).date()
    d2: date = end_at.astimezone(tz).date()
    wins: List[Tuple[datetime, datetime]] = []
    wins.extend(_user_work_windows_for_date(db, user.id, d1, tz))
    if d2 != d1:
        wins.extend(_user_work_windows_for_date(db, user.id, d2, tz))
    wins.sort(key=lambda se: se[0])
    if not any(ws <= start_at and end_at <= we for (ws, we) in wins):
        return False

    # 2) Ingen frånvaro
    if _user_timeoff_overlaps(db, user.id, start_at, end_at):
        return False

    # 3) Ingen dubbelbokning inkl. buffertar
    assigned = (
        db.query(models.BayBooking)
        .filter(
            models.BayBooking.assigned_user_id == user.id,
            ~((models.BayBooking.end_at <= start_at) | (models.BayBooking.start_at >= end_at)),
        )
        .all()
    )
    for b in assigned:
        ob = timedelta(minutes=b.buffer_before_min or 0)
        oa = timedelta(minutes=b.buffer_after_min or 0)
        if not ((b.end_at + oa) <= start_at or (b.start_at - ob) >= end_at):
            return False
    return True


def _mechanic_load_count(db: Session, user_id: int, window_start: datetime, window_end: datetime) -> int:
    return (
        db.query(models.BayBooking)
        .filter(
            models.BayBooking.assigned_user_id == user_id,
            models.BayBooking.start_at < window_end,
            models.BayBooking.end_at > window_start,
        )
        .count()
    )


def _score_mechanic(
    db: Session,
    user: models.User,
    window_start: datetime,
    window_end: datetime,
    prefer_user_id: Optional[int] = None,
) -> Tuple[int, List[str]]:
    reasons: List[str] = []
    score = 50
    load = _mechanic_load_count(db, user.id, window_start, window_end)
    if load <= 0:
        score += 30; reasons.append("least_busy:0")
    elif load == 1:
        score += 20; reasons.append("least_busy:1")
    elif load == 2:
        score += 10; reasons.append("least_busy:2")
    else:
        reasons.append(f"busy:{load}")
    if prefer_user_id and user.id == prefer_user_id:
        score += 10; reasons.append("preference")
    score = max(0, min(100, score))
    return score, reasons


def _bay_slot_is_free(db: Session, bay_id: int, start_at: datetime, end_at: datetime, include_buffers: bool) -> bool:
    bookings = (
        db.query(models.BayBooking)
        .filter(
            models.BayBooking.bay_id == bay_id,
            _overlap_clause(
                models.BayBooking.start_at, models.BayBooking.end_at,
                start_at - timedelta(minutes=120), end_at + timedelta(minutes=120)
            ),
        )
        .all()
    )
    for b in bookings:
        other_start = b.start_at - timedelta(minutes=b.buffer_before_min or 0)
        other_end   = b.end_at   + timedelta(minutes=b.buffer_after_min or 0)
        if _overlap(start_at, end_at, other_start, other_end):
            return False

    closure = (
        db.query(models.BayClosure)
        .filter(
            models.BayClosure.bay_id == bay_id,
            _overlap_clause(models.BayClosure.start_at, models.BayClosure.end_at, start_at, end_at),
        )
        .first()
    )
    return False if closure else True


def _bay_free_segments(db: Session, bay_id: int, segments: List[Tuple[datetime, datetime]], include_buffers: bool):
    free: List[Tuple[datetime, datetime]] = []
    for seg_s, seg_e in segments:
        blks: List[Tuple[datetime, datetime]] = []
        bookings = (
            db.query(models.BayBooking)
            .filter(models.BayBooking.bay_id == bay_id, models.BayBooking.start_at < seg_e, models.BayBooking.end_at > seg_s)
            .all()
        )
        for b in bookings:
            bs = b.start_at - timedelta(minutes=b.buffer_before_min or 0)
            be = b.end_at   + timedelta(minutes=b.buffer_after_min or 0)
            blks.append((max(bs, seg_s), min(be, seg_e)))
        closures = (
            db.query(models.BayClosure)
            .filter(models.BayClosure.bay_id == bay_id, models.BayClosure.start_at < seg_e, models.BayClosure.end_at > seg_s)
            .all()
        )
        for c in closures:
            blks.append((max(c.start_at, seg_s), min(c.end_at, seg_e)))
        blks.sort()
        pos = seg_s
        for bs, be in blks:
            if pos < bs:
                free.append((pos, bs))
            pos = max(pos, be)
        if pos < seg_e:
            free.append((pos, seg_e))
    return [(s, e) for s, e in free if e > s]


def _cheap_wallclock_cover(users: List[models.User], start_at: datetime, end_at: datetime, tz: ZoneInfo, db: Session) -> bool:
    if end_at <= start_at:
        return False
    d1 = start_at.astimezone(tz).date()
    d2 = end_at.astimezone(tz).date()
    for u in users:
        wins: List[Tuple[datetime, datetime]] = []
        wins.extend(_user_work_windows_for_date(db, u.id, d1, tz))
        if d2 != d1:
            wins.extend(_user_work_windows_for_date(db, u.id, d2, tz))
        if any(ws <= start_at and end_at <= we for (ws, we) in wins):
            return True
    return False


def _next_cover_start(
    db: Session,
    users: List[models.User],
    from_utc: datetime,
    duration_min: int,
    tz: ZoneInfo,
    step_min: int,
    latest_end: datetime,
) -> Optional[datetime]:
    """
    Hitta nästa lokala start (rundad till granulat) >= from_utc där *minst en* mek
    har arbetspass som rymmer hela varaktigheten. Bay beaktas inte här (billigt hopp).
    """
    dur = timedelta(minutes=duration_min)
    # Sök upp till 30 dagar som hård gräns, men stanna vid latest_end
    limit = min(latest_end, from_utc + timedelta(days=30))
    cursor = from_utc
    while cursor + dur <= limit:
        d_local = cursor.astimezone(tz).date()
        for u in users:
            for ws, we in _user_work_windows_for_date(db, u.id, d_local, tz):
                # Start måste ligga inom [ws, we - dur]
                win_start = max(ws, cursor)
                if win_start + dur > we:
                    continue
                cand = _round_up_local(win_start, step_min, tz)
                if cand < ws:
                    cand = ws
                if cand + dur <= we and cand + dur <= latest_end:
                    return cand
        # hoppa till nästa dag 00:00 lokal tid
        nxt_local_day = datetime.combine(d_local + timedelta(days=1), time(0,0,0), tz)
        cursor = max(cursor + timedelta(minutes=step_min), nxt_local_day.astimezone(timezone.utc))
    return None


def _segment_subtract(base: List[Tuple[datetime, datetime]], blocks: List[Tuple[datetime, datetime]]) -> List[Tuple[datetime, datetime]]:
    """Subtrahera en mängd block-intervall från basintervall och returnera fria segment."""
    if not base:
        return []
    blocks = sorted(blocks)
    out: List[Tuple[datetime, datetime]] = []
    for s, e in base:
        cur = s
        for bs, be in blocks:
            if be <= cur or bs >= e:
                continue
            if bs > cur:
                out.append((cur, bs))
            cur = max(cur, be)
            if cur >= e:
                break
        if cur < e:
            out.append((cur, e))
    return [(s, e) for s, e in out if e > s]


def _user_free_segments(db: Session, user: models.User, seg_start: datetime, seg_end: datetime, tz: ZoneInfo) -> List[Tuple[datetime, datetime]]:
    """Returnerar fria segment för användaren inom [seg_start, seg_end) där hen kan jobba."""
    # 1) Arbetspass
    d1 = seg_start.astimezone(tz).date()
    d2 = seg_end.astimezone(tz).date()
    work_wins: List[Tuple[datetime, datetime]] = []
    day = d1
    while day <= d2:
        work_wins.extend(_user_work_windows_for_date(db, user.id, day, tz))
        day = day + timedelta(days=1)
    work_wins = [(max(seg_start, s), min(seg_end, e)) for s, e in work_wins if min(seg_end, e) > max(seg_start, s)]
    work_wins.sort()
    if not work_wins:
        return []

    # 2) Blockers: frånvaro + bokningar (med buffertar)
    blocks: List[Tuple[datetime, datetime]] = []
    # Fromvaro
    tos = (
        db.query(models.UserTimeOff)
        .filter(models.UserTimeOff.user_id == user.id, _overlap_clause(models.UserTimeOff.start_at, models.UserTimeOff.end_at, seg_start, seg_end))
        .all()
    )
    for t in tos:
        blocks.append((max(seg_start, t.start_at), min(seg_end, t.end_at)))
    # Bokningar
    assigned = (
        db.query(models.BayBooking)
        .filter(models.BayBooking.assigned_user_id == user.id, _overlap_clause(models.BayBooking.start_at, models.BayBooking.end_at, seg_start - timedelta(hours=2), seg_end + timedelta(hours=2)))
        .all()
    )
    for b in assigned:
        bs = b.start_at - timedelta(minutes=b.buffer_before_min or 0)
        be = b.end_at   + timedelta(minutes=b.buffer_after_min or 0)
        bs = max(bs, seg_start); be = min(be, seg_end)
        if be > bs:
            blocks.append((bs, be))
    blocks.sort()

    # 3) Subtrahera blockers från arbetspass → fria segment
    free = _segment_subtract(work_wins, blocks)
    return free


def _intersect_segments(a: List[Tuple[datetime, datetime]], b: List[Tuple[datetime, datetime]]) -> List[Tuple[datetime, datetime]]:
    """Snitt av två segmentlistor."""
    out: List[Tuple[datetime, datetime]] = []
    i = j = 0
    while i < len(a) and j < len(b):
        s = max(a[i][0], b[j][0])
        e = min(a[i][1], b[j][1])
        if e > s:
            out.append((s, e))
        if a[i][1] < b[j][1]:
            i += 1
        else:
            j += 1
    return out


@router.post("/availability/auto", response_model=AvailabilityResponse)
def availability_auto(payload: AvailabilityRequest, db: Session = Depends(get_db)):
    """
    HYBRID (förenklad & strikt):
    - Föreslå ALDRIG en slot utan personaltäckning.
    - prefer_user_id = poängpåslag, inte filter.
    - Runda/scan i verkstadens lokala tid; starta på nästa steggräns.
    - Lead time: start >= now + min_lead_time_min.
    - Hoppa till _next_cover_start om nuvarande start saknar arbetspasstäckning.
    - Fragmenterade förslag endast om allow_fragmented_parts==True (max 3 delar, max 3 dagar, min 30 min/del).
    - Deterministisk rankning och diagnostik.
    """

    def _dedupe_key(bay_id: int, user_id: Optional[int], s: datetime, e: datetime):
        su = s.astimezone(timezone.utc)
        eu = e.astimezone(timezone.utc)
        return (bay_id, user_id or 0, int(su.timestamp()), int(eu.timestamp()))

    ws = _ensure_workshop(db, payload.workshop_id)
    tz = _tz_for_workshop(ws)

    # 0) Service item
    si = (
        db.query(models.WorkshopServiceItem)
        .filter(models.WorkshopServiceItem.id == payload.service_item_id, models.WorkshopServiceItem.workshop_id == payload.workshop_id)
        .first()
    )
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

    # 4) Tidsfönster + lead time + lokal rundning
    start_from_raw = _ensure_aware_utc(payload.earliest_from) or _now_utc()
    min_start = _now_utc() + timedelta(minutes=max(0, int(payload.min_lead_time_min or 0)))
    start_from = max(start_from_raw, min_start)

    latest_end = _ensure_aware_utc(payload.latest_end) or (start_from + timedelta(days=30))
    if latest_end <= start_from:
        raise HTTPException(status_code=400, detail="latest_end måste vara efter earliest_from")

    step = 1
    current = _round_up_local(start_from, 1, tz)
    slot_delta = timedelta(minutes=duration_min)
    strategy = payload.assignment_strategy or AssignmentStrategy.RANDOM

    proposals: List[AvailabilityProposal] = []
    seen_slots = set()

    while current + slot_delta <= latest_end and len(proposals) < payload.num_proposals:
        candidate_end = current + slot_delta
        slot_seed = int(current.timestamp()) ^ payload.workshop_id

        # COARSE: om ingen har mektäckning eller ingen bay är fri -> hoppa till nästa tid då båda villkoren uppfylls
        if not _cheap_wallclock_cover(employees, current, candidate_end, tz, db) \
                or not any(
            _bay_slot_is_free(db, b.id, current, candidate_end, include_buffers=payload.include_buffers) for b in bays):
            nxt = _next_any_bay_cover_start(
                db=db,
                bays=bays,
                users=employees,
                from_utc=current,
                duration_min=duration_min,
                tz=tz,
                step_min=step,
                latest_end=latest_end,
                include_buffers=payload.include_buffers,
            )
            if not nxt:
                break
            current = nxt
            candidate_end = current + slot_delta
            slot_seed = int(current.timestamp()) ^ payload.workshop_id

        # Bygg coverers-lista (mekar vars arbetspass täcker hela intervallet)
        coverers: List[models.User] = []
        d1 = current.astimezone(tz).date()
        d2 = candidate_end.astimezone(tz).date()
        for u in employees:
            wins: List[Tuple[datetime, datetime]] = []
            wins.extend(_user_work_windows_for_date(db, u.id, d1, tz))
            if d2 != d1:
                wins.extend(_user_work_windows_for_date(db, u.id, d2, tz))
            if any(ws <= current and candidate_end <= we for (ws, we) in wins):
                coverers.append(u)
        if not coverers:
            # säkerhetsnät: hoppa framåt till när både mek+bay kan täcka
            nxt = _next_any_bay_cover_start(
                db=db,
                bays=bays,
                users=employees,
                from_utc=_round_up_local(current + timedelta(minutes=step), step, tz),
                duration_min=duration_min,
                tz=tz,
                step_min=step,
                latest_end=latest_end,
                include_buffers=payload.include_buffers,
            )
            if not nxt:
                break
            current = nxt
            continue

        bays_ordered = sorted(bays, key=lambda b: b.id)
        slot_added = False

        for bay in bays_ordered:
            # ---- Försök 1: sammanhängande slot
            if _bay_slot_is_free(db, bay.id, current, candidate_end, include_buffers=payload.include_buffers):
                users_in_order = _order_users_for_slot(db, coverers, strategy, slot_seed ^ bay.id, current, candidate_end)
                eligible: List[Tuple[models.User, int, List[str]]] = []
                disq: List[MechanicCandidate] = []

                for u in users_in_order:
                    # snabb diagnos: väggklocka
                    wins_day: List[Tuple[datetime, datetime]] = []
                    wins_day.extend(_user_work_windows_for_date(db, u.id, d1, tz))
                    if d2 != d1:
                        wins_day.extend(_user_work_windows_for_date(db, u.id, d2, tz))
                    if not any(ws <= current and candidate_end <= we for (ws, we) in wins_day):
                        disq.append(MechanicCandidate(user_id=u.id, score=0, rank=0, reasons=["outside_working_hours"]))
                        continue
                    # frånvaro?
                    if _user_timeoff_overlaps(db, u.id, current, candidate_end):
                        disq.append(MechanicCandidate(user_id=u.id, score=0, rank=0, reasons=["time_off"]))
                        continue
                    # krock inkl. buffert?
                    assigned = (
                        db.query(models.BayBooking)
                        .filter(
                            models.BayBooking.assigned_user_id == u.id,
                            ~((models.BayBooking.end_at <= current) | (models.BayBooking.start_at >= candidate_end)),
                        )
                        .all()
                    )
                    clash = False
                    for b2 in assigned:
                        ob = timedelta(minutes=b2.buffer_before_min or 0)
                        oa = timedelta(minutes=b2.buffer_after_min or 0)
                        if not ((b2.end_at + oa) <= current or (b2.start_at - ob) >= candidate_end):
                            clash = True; break
                    if clash:
                        disq.append(MechanicCandidate(user_id=u.id, score=0, rank=0, reasons=["busy_with_buffer"]))
                        continue

                    if _user_is_available(db, u, current, candidate_end, tz):
                        sc, reasons = _score_mechanic(db, u, current, candidate_end, payload.prefer_user_id)
                        eligible.append((u, sc, reasons))
                    else:
                        disq.append(MechanicCandidate(user_id=u.id, score=0, rank=0, reasons=["not_available"]))

                if eligible:
                    # Slumpa ordningen så vi inte favoriserar samma mek varje gång
                    rnd = random.Random(slot_seed ^ bay.id ^ 0xA17C)
                    rnd.shuffle(eligible)

                    # Gör ETT förslag per tillgänglig mekaniker för just denna tid
                    max_per_time = max(1, payload.max_candidates_per_slot)
                    for idx, (u, sc, reasons) in enumerate(eligible[:max_per_time]):
                        key = _dedupe_key(bay.id, u.id, current, candidate_end)
                        if key in seen_slots:
                            continue
                        seen_slots.add(key)

                        proposals.append(
                            AvailabilityProposal(
                                bay_id=bay.id,
                                start_at=current.astimezone(tz),
                                end_at=candidate_end.astimezone(tz),
                                assigned_user_id=u.id,  # <-- viktigt: en rad per mek
                                notes=f"{getattr(bay, 'name', '') or 'Bay'}",
                                meta=SlotMeta(
                                    recommended_user_id=u.id,  # speglar assigned_user_id
                                    candidates=None,  # inte nödvändigt längre
                                    diagnostics=SlotDiagnostics(disqualified=disq or None),
                                ),
                            )
                        )

                        if len(proposals) >= payload.num_proposals:
                            slot_added = True
                            break

                    if len(proposals) > 0:
                        slot_added = True

            if slot_added:
                break

            # ---- Försök 2: fragmenterad slot (endast om explicit tillåtet)
            if not payload.allow_fragmented_parts:
                continue

            end_limit = min(latest_end, current + timedelta(days=MAX_FRAGMENT_DAYS))
            bay_free = _bay_free_segments(db, bay.id, [(current, end_limit)], include_buffers=payload.include_buffers)
            if not bay_free:
                continue

            users_in_order = _order_users_for_slot(db, employees, strategy, (slot_seed * 31) ^ bay.id, current, end_limit)
            covering_results: List[Tuple[models.User, List[Tuple[datetime, datetime]]]] = []
            disq_frag: Dict[int, List[str]] = {}

            for u in users_in_order:
                user_free = _user_free_segments(db, u, current, end_limit, tz)
                if not user_free:
                    disq_frag.setdefault(u.id, []).append("not_available")
                    continue
                # Intersektion: bay fri ∩ user fri
                cand_segs = _intersect_segments(bay_free, user_free)
                # filtrera bort för korta segment
                cand_segs = [(s, e) for (s, e) in cand_segs if (e - s) >= timedelta(minutes=MIN_FRAGMENT_MINUTES)]
                if not cand_segs:
                    disq_frag.setdefault(u.id, []).append("too_short_part")
                    continue

                # Greedy fyll upp till duration, max 3 delar
                remaining = timedelta(minutes=duration_min)
                parts_utc: List[Tuple[datetime, datetime]] = []
                for s, e in cand_segs:
                    if remaining <= timedelta(0) or len(parts_utc) >= MAX_FRAGMENT_PARTS:
                        break
                    take = min(remaining, e - s)
                    if take >= timedelta(minutes=MIN_FRAGMENT_MINUTES):
                        parts_utc.append((s, s + take))
                        remaining -= take
                if remaining <= timedelta(0) and 1 <= len(parts_utc) <= MAX_FRAGMENT_PARTS:
                    covering_results.append((u, parts_utc))
                else:
                    disq_frag.setdefault(u.id, []).append("insufficient_cover")

            if covering_results:
                # rangordna på score inom fönstret first_start..last_end
                first_start = min(p[0][0] for _, p in covering_results)
                last_end = max(p[-1][1] for _, p in covering_results)
                window_users = []
                for u, parts in covering_results:
                    sc, reasons = _score_mechanic(db, u, first_start, last_end, payload.prefer_user_id)
                    window_users.append((u, sc, reasons))
                window_users.sort(key=lambda t: (-t[1], t[0].id))

                recommended = window_users[0][0].id
                candidates = [
                    MechanicCandidate(user_id=u.id, score=int(sc), rank=idx + 1, reasons=reasons)
                    for idx, (u, sc, reasons) in enumerate(window_users[: max(1, payload.max_candidates_per_slot)])
                ]
                key = _dedupe_key(bay.id, None, first_start, last_end)
                if key not in seen_slots:
                    seen_slots.add(key)
                    parts_payload = [
                        AvailabilityPart(start_at=ps.astimezone(tz), end_at=pe.astimezone(tz))
                        for (ps, pe) in covering_results[0][1]  # visa bästa täckningen
                    ]
                    pause_note = ""
                    if len(parts_payload) > 1:
                        gaps = []
                        for i in range(len(parts_payload) - 1):
                            g_s = parts_payload[i].end_at.strftime("%H:%M")
                            g_e = parts_payload[i + 1].start_at.strftime("%H:%M")
                            gaps.append(f"{g_s}–{g_e}")
                        if gaps:
                            pause_note = f" (paus: {', '.join(gaps)})"

                    disq_list = [
                        MechanicCandidate(user_id=uid, score=0, rank=0, reasons=sorted(set(rsns)))
                        for uid, rsns in disq_frag.items()
                    ] or None

                    proposals.append(
                        AvailabilityProposal(
                            bay_id=bay.id,
                            start_at=first_start.astimezone(tz),
                            end_at=last_end.astimezone(tz),
                            notes=f"{getattr(bay, 'name', '') or 'Bay'}{pause_note}",
                            parts=parts_payload,
                            meta=SlotMeta(
                                recommended_user_id=recommended,
                                candidates=candidates if payload.return_candidates else None,
                                diagnostics=SlotDiagnostics(disqualified=disq_list),
                            ),
                        )
                    )
                    slot_added = True

            if slot_added:
                break

        # Nästa steg – i lokal TZ men vi ökar UTC-tiden med step (rundning hanteras i _next_cover_start)
        current = current + timedelta(minutes=step)

    reason = None if proposals else "Ingen ledig tid (med tillgänglig mekaniker) i valt intervall. Välj en annan dag"
    return AvailabilityResponse(proposals=proposals, reason_if_empty=reason)


@router.post("/auto-schedule", response_model=schemas.BayBookingRead)
def auto_schedule(payload: AutoScheduleRequest, db: Session = Depends(get_db)):
    """
    Atomisk bokning:
    - Verifiera bay + (valfri) mekaniker på nytt precis före skapande.
    - Vid konflikt: 409 + rimliga 'alternatives'.
    """
    workshop = _ensure_workshop(db, payload.workshop_id)
    tz = _tz_for_workshop(workshop)
    bay = _ensure_bay_in_workshop(db, payload.workshop_id, payload.bay_id)

    start_at = _ensure_aware_utc(payload.start_at)
    end_at = _ensure_aware_utc(payload.end_at)
    if end_at <= start_at:
        raise HTTPException(status_code=400, detail="end_at måste vara efter start_at")

    # Bil (frivilligt via car_id eller regnr)
    car = None
    if payload.car_id:
        car = db.query(models.Car).filter(models.Car.id == payload.car_id).first()
        if not car:
            raise HTTPException(status_code=404, detail="Bil (car_id) hittades inte")
    elif payload.registration_number:
        car = _get_car_by_reg(db, payload.registration_number)

    _validate_vehicle_vs_bay(db, bay, car)

    # Sista kontroll (bay)
    if not _bay_slot_is_free(db, bay.id, start_at, end_at, include_buffers=True):
        alternatives = []
        if payload.assigned_user_id:
            step = 15
            for k in range(1, 5):  # 4 steg ≈ 60 min
                alt_s = start_at + timedelta(minutes=step * k)
                alt_e = end_at + timedelta(minutes=step * k)
                if _bay_slot_is_free(db, bay.id, alt_s, alt_e, include_buffers=True):
                    u = db.query(models.User).filter(models.User.id == payload.assigned_user_id).first()
                    if u and _user_is_available(db, u, alt_s, alt_e, tz):
                        alternatives.append({
                            "user_id": u.id,
                            "bay_id": bay.id,
                            "start_at": alt_s.isoformat(),
                            "end_at": alt_e.isoformat(),
                            "reason": f"same mechanic; next free +{step*k}m",
                        })
                        break
        raise HTTPException(status_code=409, detail={"message": "Arbetsplatsen är upptagen i vald tid.", "alternatives": alternatives})

    # Mekaniker (om specificerad)
    if payload.assigned_user_id:
        user = db.query(models.User).filter(models.User.id == payload.assigned_user_id).first()
        if not user:
            raise HTTPException(status_code=404, detail="Tilldelad användare hittades inte")
        if user.role.value not in ALLOWED_EMPLOYEE_ROLES:
            raise HTTPException(status_code=400, detail="Tilldelad användare har inte en verkstadsroll")
        if not _user_is_available(db, user, start_at, end_at, tz):
            employees = _employees_in_workshop(db, payload.workshop_id)
            alternatives = []
            for u2 in employees:
                if u2.id == payload.assigned_user_id:
                    continue
                if _user_is_available(db, u2, start_at, end_at, tz):
                    alternatives.append({
                        "user_id": u2.id,
                        "bay_id": bay.id,
                        "start_at": start_at.isoformat(),
                        "end_at": end_at.isoformat(),
                        "reason": "same slot; different mechanic",
                    })
                    break
            raise HTTPException(status_code=409, detail={"message": "Tilldelad användare är upptagen i vald tid.", "alternatives": alternatives})

    # Prisvalidering (MVP)
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
            if chain_master.workshop_id != payload.workshop_id:
                raise HTTPException(status_code=400, detail="Alla delar i en kedja måste tillhöra samma verkstad.")
            if chain_master.car_id and (car and chain_master.car_id != car.id):
                raise HTTPException(status_code=400, detail="Alla delar i en kedja måste vara kopplade till samma bil.")
            if chain_master.service_item_id and payload.service_item_id and chain_master.service_item_id != payload.service_item_id:
                raise HTTPException(status_code=400, detail="Alla delar i en kedja måste referera samma service_item.")

    # Skapa bokningen
    data = payload.dict(exclude_unset=True)
    data["start_at"] = start_at
    data["end_at"] = end_at
    data["car_id"] = (car.id if car else payload.car_id)
    data["status"] = models.BookingStatus.BOOKED
    data["source"] = payload.source or "auto"
    data.pop("registration_number", None)

    if chain_token:
        data["chain_token"] = chain_token
        if chain_master:
            for k in ("price_net_ore", "price_gross_ore", "final_price_ore", "price_note", "price_is_custom"):
                data.pop(k, None)
            if chain_master.car_id and not data.get("car_id"):
                data["car_id"] = chain_master.car_id
            if chain_master.service_item_id and not data.get("service_item_id"):
                data["service_item_id"] = chain_master.service_item_id

    bay_create = schemas.BayBookingCreate(**data)
    return _create_booking_core(db, bay_create)

@router.post("/{booking_id}/complete-with-time", response_model=schemas.BayBookingRead)
def complete_with_time(
    booking_id: int = Path(..., ge=1),
    payload: CompleteWithTimeRequest = ...,   # <- obligatorisk body
    db: Session = Depends(get_db),
    response: Response = None,
):
    # 1) Hämta bokningen
    booking: models.BayBooking | None = (
        db.query(models.BayBooking)
        .filter(models.BayBooking.id == booking_id)
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Bokning hittades inte")

    # 2) Validera minuter
    minutes = int(payload.actual_minutes_spent or 0)
    if minutes < 0:
        raise HTTPException(status_code=400, detail="actual_minutes_spent kan inte vara negativt")

    # 3) Om redan klar – returnera som den är
    if booking.status == models.BookingStatus.COMPLETED:
        return schemas.BayBookingRead.model_validate(booking, from_attributes=True)

    # 4) Hämta ev. service item för timdebitering
    service_item = None
    if booking.service_item_id:
        service_item = (
            db.query(models.WorkshopServiceItem)
            .filter(models.WorkshopServiceItem.id == booking.service_item_id)
            .first()
        )

    # 5) Räkna ut final_price_ore (NETTO)
    if payload.use_custom_final_price:
        if payload.custom_final_price_ore is None or payload.custom_final_price_ore < 0:
            raise HTTPException(
                status_code=400,
                detail="custom_final_price_ore måste vara ≥ 0 när use_custom_final_price = true",
            )
        new_final_net_ore = int(payload.custom_final_price_ore)
    elif payload.charge_more_than_estimate:
        if not service_item or service_item.price_type != models.ServicePriceType.HOURLY or not service_item.hourly_rate_ore:
            raise HTTPException(
                status_code=400,
                detail="Timdebitering är inte tillgänglig för denna bokning (service item saknar timpris eller är inte 'hourly').",
            )
        if minutes <= 0:
            raise HTTPException(status_code=400, detail="Ange ett antal minuter större än 0 för timdebitering.")
        hourly = int(service_item.hourly_rate_ore)
        new_final_net_ore = max(0, round((minutes / 60) * hourly))
    else:
        if booking.final_price_ore is not None:
            new_final_net_ore = int(booking.final_price_ore)
        elif booking.price_net_ore is not None:
            new_final_net_ore = int(booking.price_net_ore)
        else:
            new_final_net_ore = 0

    # 6) Uppdatera och spara bokningen
    now_utc = _now_utc()
    try:
        if hasattr(booking, "actual_minutes_spent"):
            booking.actual_minutes_spent = minutes
        elif hasattr(booking, "duration_actual_min"):
            booking.duration_actual_min = minutes

        booking.final_price_ore = new_final_net_ore
        booking.status = models.BookingStatus.COMPLETED
        if hasattr(booking, "completed_at"):
            booking.completed_at = now_utc

        db.add(booking)
        db.commit()
        db.refresh(booking)
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(status_code=500, detail="Kunde inte spara bokningen.")

    # 7) Försök skicka SMS (blockerar inte bokningen)
    try:
        # --- Samla data till SMS ---
        regnr_str = None
        customer_name = None
        workshop_name = None
        workshop_phone = None
        workshop_hours = None
        phone_e164 = None

        # 7.0: Verkstadsinfo (namn, telefon, öppettider)
        try:
            if booking.workshop_id:
                ws = db.query(models.Workshop).filter(models.Workshop.id == booking.workshop_id).first()
                if ws:
                    workshop_name = ws.name
                    workshop_phone = ws.phone
                    workshop_hours = ws.opening_hours
        except Exception:
            pass

        # 7.1: Registreringsnummer – hämta alltid om bil finns
        try:
            if getattr(booking, "car", None) and getattr(booking.car, "registration_number", None):
                regnr_str = booking.car.registration_number
            elif booking.car_id:
                car = db.query(models.Car).filter(models.Car.id == booking.car_id).first()
                if car:
                    regnr_str = getattr(car, "registration_number", None)
                    # Om ingen kund på bokningen – testa primär ägare via relation
                    if not getattr(booking, "customer_id", None) and hasattr(car,
                                                                             "primary_owner") and car.primary_owner:
                        po = car.primary_owner
                        fn = getattr(po, "first_name", None) or ""
                        ln = getattr(po, "last_name", None) or ""
                        full = (fn + " " + ln).strip()
                        customer_name = full or customer_name
                        if not phone_e164:
                            phone_e164 = getattr(po, "phone_e164", None) or getattr(po, "phone", None)
        except Exception:
            pass

        # 7.2: Kundnamn/telefon från bokningen
        try:
            if getattr(booking, "customer_id", None):
                cust = db.query(models.Customer).filter(models.Customer.id == booking.customer_id).first()
                if cust:
                    fn = getattr(cust, "first_name", None) or ""
                    ln = getattr(cust, "last_name", None) or ""
                    full = (fn + " " + ln).strip()
                    customer_name = full or customer_name
                    if not phone_e164:
                        phone_e164 = getattr(cust, "phone_e164", None) or getattr(cust, "phone", None)
        except Exception:
            pass

        # 7.3: Override från payload vinner alltid
        if getattr(payload, "phone_override_e164", None):
            cand = str(payload.phone_override_e164).strip()
            if cand.startswith("+"):
                phone_e164 = cand

        # 7.4: Skicka endast om E.164
        if phone_e164 and str(phone_e164).startswith("+"):
            SmsService().send_ready_message(
                to_e164=str(phone_e164),
                regnr=regnr_str or "din bil",
                customer_name=customer_name,
                workshop_name=workshop_name,
                workshop_phone=workshop_phone,
                workshop_opening_hours=workshop_hours,
                pickup_info=None,
                link=None,
                metadata={"booking_id": booking.id},
                status_callback_url=None,  # använder default från settings om satt
            )
        else:
            import logging
            logging.getLogger("sms").warning(
                "[SmsService] Inget SMS skickat: saknar giltigt telefonnummer för booking_id=%s", booking.id
            )

    except Exception as e:
        import logging
        logging.getLogger("sms").exception(
            "[SmsService] SMS-försök misslyckades för booking_id=%s: %r", booking.id, e
        )

    # 8) Returnera den uppdaterade bokningen
    return schemas.BayBookingRead.model_validate(booking, from_attributes=True)
