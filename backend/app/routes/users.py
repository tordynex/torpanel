import os
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, Query
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, DeclarativeMeta, joinedload
from sqlalchemy import and_, or_
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from datetime import datetime, date, time, timezone, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from app.config import settings


from app import models, schemas
from app.models import UserWorkingHours, UserTimeOff, TimeOffType, UserRole
from app.schemas import LunchPresetRequest
from app.database import get_db
from app.auth import verify_password, create_access_token, get_current_user
from passlib.context import CryptContext
from app.services.email_service import send_welcome_email, send_password_reset_email


router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str):
    return pwd_context.hash(password)

RESET_SALT = "password-reset"
RESET_TOKEN_MAX_AGE = settings.RESET_TOKEN_MAX_AGE
RESET_URL_BASE = settings.RESET_URL_BASE

ts = URLSafeTimedSerializer(settings.SECRET_KEY)

def make_reset_token(user_id: int) -> str:
    return ts.dumps({"uid": user_id}, salt=RESET_SALT)

def verify_reset_token(token: str) -> int:
    data = ts.loads(token, salt=RESET_SALT, max_age=RESET_TOKEN_MAX_AGE)
    return int(data["uid"])

ALLOWED_SCHEDULE_ROLES = {UserRole.WORKSHOP_USER.value, UserRole.WORKSHOP_EMPLOYEE.value}

def _get_user_or_404(db: Session, user_id: int) -> models.User:
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

def _assert_user_can_have_schedule(user: models.User):
    # tillåt endast verkstadsroller
    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    if role_val not in ALLOWED_SCHEDULE_ROLES:
        raise HTTPException(status_code=400, detail="Endast verkstadsroller kan ha arbetstider/semester.")


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

def _parse_ymd(s: str) -> date:
    try:
        return date.fromisoformat(s[:10])
    except Exception:
        raise HTTPException(status_code=400, detail="Ogiltigt datumformat, använd YYYY-MM-DD")

def _daterange(d0: date, d1: date):
    # inkl start, exkl slut
    cur = d0
    while cur < d1:
        yield cur
        cur += timedelta(days=1)

def _clip(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> tuple[datetime, datetime] | None:
    """Returnera överlapp [max(starts), min(ends)) eller None om ingen överlapp."""
    s = max(a_start, b_start)
    e = min(a_end, b_end)
    return (s, e) if e > s else None

def _tz_or_404(tz_name: Optional[str]) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name or "Europe/Stockholm")
    except ZoneInfoNotFoundError:
        raise HTTPException(status_code=400, detail="Ogiltig tidszon")

# ----------------------------------
#  Skapa användare / Create user
# ----------------------------------
@router.post("/create", response_model=schemas.UserRead)
def create_user(
    background_tasks: BackgroundTasks,
    user: schemas.UserCreate,
    db: Session = Depends(get_db),
):
    # 1) Unik email
    if db.query(models.User).filter(models.User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    # 2) Roll- & workshop-validering
    if user.role == schemas.UserRole.OWNER:
        # OWNER = plattformsroll, ska inte kopplas till verkstad
        if user.workshop_ids:
            raise HTTPException(
                status_code=400,
                detail="OWNER ska inte kopplas till verkstäder (lämna workshop_ids tomt).",
            )
        workshops = []
    else:
        # WORKSHOP_USER (ägare) eller WORKSHOP_EMPLOYEE (anställd) måste kopplas till minst en verkstad
        if not user.workshop_ids:
            raise HTTPException(
                status_code=400,
                detail="workshop_ids krävs för verkstadsroller.",
            )

        # Hämta verkstäder och kontrollera att alla efterfrågade finns
        wanted_ids = list(dict.fromkeys(user.workshop_ids))  # unika, behåll ordning
        workshops = (
            db.query(models.Workshop)
            .filter(models.Workshop.id.in_(wanted_ids))
            .all()
        )
        found_ids = {w.id for w in workshops}
        missing = [wid for wid in wanted_ids if wid not in found_ids]
        if missing:
            raise HTTPException(
                status_code=404,
                detail=f"Följande workshops finns inte: {missing}",
            )

        # (Valfritt) tillåt bara 1 verkstadsägare per verkstad
        if user.role == schemas.UserRole.WORKSHOP_USER:
            clash = (
                db.query(models.User)
                .join(models.user_workshop_association,
                      models.user_workshop_association.c.user_id == models.User.id)
                .filter(models.user_workshop_association.c.workshop_id.in_(found_ids))
                .filter(models.User.role == models.UserRole.WORKSHOP_USER)
                .first()
            )
            if clash:
                raise HTTPException(
                    status_code=409,
                    detail="Minst en av valda verkstäder har redan en verkstadsägare (workshop_user).",
                )

    # --- create_user ---
    hashed_pw = hash_password(user.password)

    role_value = user.role.value if hasattr(user.role, "value") else str(user.role).lower()
    # sanity:
    assert role_value in {"owner", "workshop_user", "workshop_employee"}

    new_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_pw,
        role=role_value,  # <-- str value till DB
    )

    if workshops:
        new_user.workshops = workshops

    try:
        db.add(new_user)
        db.commit()
    except Exception:
        db.rollback()
        raise
    db.refresh(new_user)

    # 4) Välkomstmail i bakgrund
    background_tasks.add_task(send_welcome_email, user.email, user.username)

    return new_user

# ----------------------------------
# Lista användare / List users
# ----------------------------------

@router.get("/all", response_model=List[schemas.UserRead])
def get_all_users(db: Session = Depends(get_db)):
    users = db.query(models.User).all()
    return users

# ----------------------------------
# Radera användare / Delete user
# ----------------------------------
@router.delete("/delete/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()
    return


# ----------------------------------
# Redigera användare / Edit user
# ----------------------------------
@router.put("/edit/{user_id}", response_model=schemas.UserRead)
def update_user(user_id: int, user_data: schemas.UserCreate, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.username = user_data.username
    user.email = user_data.email
    user.role = user_data.role
    user.hashed_password = hash_password(user_data.password)

    if user_data.workshop_ids is not None:
        workshops = db.query(models.Workshop).filter(models.Workshop.id.in_(user_data.workshop_ids)).all()
        user.workshops = workshops

    db.commit()
    db.refresh(user)
    return user

@router.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Fel e-post eller lösenord")

    role_val = user.role.value if hasattr(user.role, "value") else str(user.role)
    token_data = {"sub": str(user.id), "role": role_val, "username": user.username}

    access_token = create_access_token(token_data)

    resp = JSONResponse({"access_token": access_token, "token_type": "bearer"})
    resp.set_cookie(
        "access_token",
        access_token,
        httponly=True,
        secure=True,
        samesite="none",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    return resp

@router.post("/logout")
def logout():
    resp = JSONResponse({"message": "Logged out"})
    resp.delete_cookie(
        "access_token",
        httponly=True,
        secure=True,
        samesite="none",
    )
    return resp

# ----------------------------------
# Hitta verkstadskoppling
# ----------------------------------

@router.get("/me", response_model=schemas.UserRead)
def get_profile(current_user: models.User = Depends(get_current_user)):
    return current_user

# --- 1) Begär återställningslänk ---
@router.post("/reset-password-request")
def reset_password_request(
    payload: dict,
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None,
):
    email = (payload.get("email") or "").strip().lower()

    # Svara alltid 200 – läck inte om mail finns
    user = db.query(models.User).filter(models.User.email == email).first()
    if user:
        token = make_reset_token(user.id)
        reset_link = f"{RESET_URL_BASE}?token={token}"

        if background_tasks is not None:
            background_tasks.add_task(
                send_password_reset_email, user.email, user.username, reset_link
            )
        else:
            # fallback om ingen BackgroundTasks injiceras (bör inte hända i FastAPI)
            import asyncio
            asyncio.create_task(send_password_reset_email(user.email, user.username, reset_link))

    return {"message": "Om kontot finns har vi skickat ett mail med instruktioner."}

# --- 2) Sätt nytt lösenord ---
@router.post("/reset-password")
def reset_password(payload: dict, db: Session = Depends(get_db)):
    token = payload.get("token") or ""
    new_password = payload.get("new_password") or ""

    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail="Lösenordet måste vara minst 8 tecken.")

    try:
        user_id = verify_reset_token(token)
    except SignatureExpired:
        raise HTTPException(status_code=400, detail="Länken har gått ut.")
    except BadSignature:
        raise HTTPException(status_code=400, detail="Ogiltig länk.")

    user = db.get(models.User, user_id)  # SQLAlchemy 1.4+ sätt
    if not user:
        raise HTTPException(status_code=404, detail="Användare saknas.")

    user.hashed_password = hash_password(new_password)
    db.add(user)
    db.commit()

    return {"message": "Lösenord uppdaterat."}

@router.post("/{user_id}/working-hours", response_model=schemas.UserWorkingHoursRead)
def create_working_hours(
    user_id: int,
    payload: schemas.UserWorkingHoursCreate,
    db: Session = Depends(get_db),
):
    user = _get_user_or_404(db, user_id)
    _assert_user_can_have_schedule(user)

    # säkerställ att payload.user_id matchar path
    if payload.user_id != user_id:
        raise HTTPException(status_code=400, detail="user_id i body måste matcha path-parametern.")

    wh = UserWorkingHours(
        user_id=user_id,
        weekday=payload.weekday,
        start_time=payload.start_time,
        end_time=payload.end_time,
        valid_from=payload.valid_from,
        valid_to=payload.valid_to,
    )
    db.add(wh)
    db.commit()
    db.refresh(wh)
    return wh


@router.get("/{user_id}/working-hours", response_model=List[schemas.UserWorkingHoursRead])
def list_working_hours(user_id: int, db: Session = Depends(get_db)):
    user = _get_user_or_404(db, user_id)
    _assert_user_can_have_schedule(user)
    items = (
        db.query(UserWorkingHours)
        .filter(UserWorkingHours.user_id == user_id)
        .order_by(UserWorkingHours.weekday, UserWorkingHours.start_time)
        .all()
    )
    return items


@router.patch("/working-hours/{wh_id}", response_model=schemas.UserWorkingHoursRead)
def update_working_hours(
    wh_id: int,
    payload: schemas.UserWorkingHoursUpdate,
    db: Session = Depends(get_db),
):
    wh = db.query(UserWorkingHours).filter(UserWorkingHours.id == wh_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Arbetstid hittades inte")

    # uppdatera fält selektivt
    if payload.weekday is not None:
        wh.weekday = payload.weekday
    if payload.start_time is not None:
        wh.start_time = payload.start_time
    if payload.end_time is not None:
        wh.end_time = payload.end_time
    if payload.valid_from is not None:
        wh.valid_from = payload.valid_from
    if payload.valid_to is not None:
        wh.valid_to = payload.valid_to

    db.commit()
    db.refresh(wh)
    return wh


@router.delete("/working-hours/{wh_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_working_hours(wh_id: int, db: Session = Depends(get_db)):
    wh = db.query(UserWorkingHours).filter(UserWorkingHours.id == wh_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Arbetstid hittades inte")
    db.delete(wh)
    db.commit()
    return

# ----------------------------
# USER TIME OFF (semester/sjuk)
# ----------------------------

@router.post("/{user_id}/time-off", response_model=schemas.UserTimeOffRead)
def create_time_off(
    user_id: int,
    payload: schemas.UserTimeOffCreate,
    db: Session = Depends(get_db),
):
    user = _get_user_or_404(db, user_id)
    _assert_user_can_have_schedule(user)

    if payload.user_id != user_id:
        raise HTTPException(status_code=400, detail="user_id i body måste matcha path-parametern.")

    start_utc = _ensure_aware_utc(payload.start_at)
    end_utc   = _ensure_aware_utc(payload.end_at)
    if not start_utc or not end_utc or end_utc <= start_utc:
        raise HTTPException(status_code=400, detail="Ogiltigt tidsintervall för time-off.")

    to = UserTimeOff(
        user_id=user_id,
        start_at=start_utc,
        end_at=end_utc,
        type=payload.type,
        reason=payload.reason,
    )
    db.add(to)
    db.commit()
    db.refresh(to)
    return to

@router.get("/{user_id}/time-off", response_model=List[schemas.UserTimeOffRead])
def list_time_off(user_id: int, db: Session = Depends(get_db)):
    user = _get_user_or_404(db, user_id)
    _assert_user_can_have_schedule(user)
    items = (
        db.query(UserTimeOff)
        .filter(UserTimeOff.user_id == user_id)
        .order_by(UserTimeOff.start_at)
        .all()
    )
    return items


@router.patch("/time-off/{to_id}", response_model=schemas.UserTimeOffRead)
def update_time_off(
    to_id: int,
    payload: schemas.UserTimeOffUpdate,
    db: Session = Depends(get_db),
):
    to = db.query(UserTimeOff).filter(UserTimeOff.id == to_id).first()
    if not to:
        raise HTTPException(status_code=404, detail="Frånvaro hittades inte")

    if payload.start_at is not None:
        to.start_at = payload.start_at
    if payload.end_at is not None:
        to.end_at = payload.end_at
    if payload.type is not None:
        to.type = payload.type
    if payload.reason is not None:
        to.reason = payload.reason

    db.commit()
    db.refresh(to)
    return to


@router.delete("/time-off/{to_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_time_off(to_id: int, db: Session = Depends(get_db)):
    to = db.query(UserTimeOff).filter(UserTimeOff.id == to_id).first()
    if not to:
        raise HTTPException(status_code=404, detail="Frånvaro hittades inte")
    db.delete(to)
    db.commit()
    return

@router.post("/{user_id}/working-hours/preset/office", response_model=List[schemas.UserWorkingHoursRead])
def set_office_hours(user_id: int, db: Session = Depends(get_db)):
    user = _get_user_or_404(db, user_id)
    _assert_user_can_have_schedule(user)

    # rensa befintligt schema om du vill:
    db.query(UserWorkingHours).filter(UserWorkingHours.user_id == user_id).delete()

    items = []
    for weekday in range(0, 5):  # mån–fre
        wh = UserWorkingHours(
            user_id=user_id, weekday=weekday,
            start_time=time(8, 0, 0), end_time=time(17, 0, 0),
        )
        db.add(wh)
        items.append(wh)
    db.commit()
    for it in items:
        db.refresh(it)
    return items

@router.post("/{user_id}/working-hours/preset/with-lunch",
             response_model=List[schemas.UserWorkingHoursRead])
def set_office_hours_with_lunch(
    user_id: int,
    payload: LunchPresetRequest,
    db: Session = Depends(get_db),
):
    user = _get_user_or_404(db, user_id)
    _assert_user_can_have_schedule(user)

    # 1) Rensa existerande arbetspass för dessa veckodagar (valfritt men enklast)
    (db.query(UserWorkingHours)
       .filter(UserWorkingHours.user_id == user_id,
               UserWorkingHours.weekday.in_(payload.weekdays))
       .delete(synchronize_session=False))

    # 2) Lägg två pass per dag (före/efter lunch)
    items = []
    for wd in payload.weekdays:
        morning = UserWorkingHours(
            user_id=user_id,
            weekday=wd,
            start_time=payload.start_time,
            end_time=payload.lunch_start,
            valid_from=payload.valid_from,
            valid_to=payload.valid_to,
        )
        afternoon = UserWorkingHours(
            user_id=user_id,
            weekday=wd,
            start_time=payload.lunch_end,
            end_time=payload.end_time,
            valid_from=payload.valid_from,
            valid_to=payload.valid_to,
        )
        db.add(morning)
        db.add(afternoon)
        items.extend([morning, afternoon])

    db.commit()
    for it in items:
        db.refresh(it)
    return items

from datetime import datetime, timezone

@router.get("/{user_id}/bookings", response_model=list[schemas.BayBookingRead])
def list_user_bookings(
    user_id: int,
    date_from: datetime = Query(..., alias="date_from"),
    date_to: datetime   = Query(..., alias="date_to"),
    include: str = Query("", alias="include"),
    db: Session = Depends(get_db),
):
    inc = {p.strip() for p in (include or "").split(",") if p.strip()}

    q = (
        db.query(models.BayBooking)
        .filter(
            models.BayBooking.assigned_user_id == user_id,
            models.BayBooking.start_at < date_to,
            models.BayBooking.end_at > date_from,
        )
    )

    if "car" in inc:
        q = q.options(joinedload(models.BayBooking.car))
    if "customer" in inc:
        q = q.options(joinedload(models.BayBooking.customer))
    if "service_item" in inc:
        q = q.options(joinedload(models.BayBooking.service_item))

    bookings = q.all()

    # === Primär kund per bil ===
    if "car_primary_customer" in inc:
        car_ids = [b.car_id for b in bookings if b.car_id]
        primaries_by_car: dict[int, models.Customer] = {}
        if car_ids:
            today = date.today()

            # Hämta relationer som markerats som primära, och välj den som är "giltig" idag.
            rels = (
                db.query(models.CustomerCar)  # din assoc-modell
                .join(models.Customer, models.Customer.id == models.CustomerCar.customer_id)
                .filter(
                    models.CustomerCar.car_id.in_(car_ids),
                    models.CustomerCar.is_primary_owner.is_(True),
                )
                .all()
            )

            # Välj bästa kandidat per bil (giltig period prioriteras; annars senaste)
            for rel in rels:
                ok_period = (
                    (rel.valid_from is None or rel.valid_from <= today)
                    and (rel.valid_to is None or rel.valid_to >= today)
                )
                prev = primaries_by_car.get(rel.car_id)
                if prev is None and ok_period:
                    primaries_by_car[rel.car_id] = rel.customer

            # Fallback: om ingen giltig period hittades, välj första träffen per bil
            for rel in rels:
                primaries_by_car.setdefault(rel.car_id, rel.customer)

        # Sätt fältet på varje booking
        for b in bookings:
            # Om bokningen redan har en explicit kund → använd den i första hand
            if getattr(b, "customer", None):
                b.car_primary_customer = b.customer
            elif b.car_id and b.car_id in primaries_by_car:
                b.car_primary_customer = primaries_by_car[b.car_id]
            else:
                b.car_primary_customer = None

    return bookings


@router.get("/{user_id}/schedule")
def get_user_schedule_window(
    user_id: int,
    day_from: str,
    day_to: str,
    include_bookings: bool = False,
    tz: Optional[str] = "Europe/Stockholm",
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """
    Bygger ett kalenderfönster per dag:
      - working_blocks: expanderade arbetstidspass enligt veckodag + valid_from/to
      - time_off: frånvaro som klipps per dag
      - (valfritt) bookings: bokningar per dag (klippta)
    day_from/day_to är datum (YYYY-MM-DD). Intervallet är [day_from, day_to) (dvs. day_to exkluderas).
    """
    user = _get_user_or_404(db, user_id)
    _assert_user_can_have_schedule(user)

    local_tz = _tz_or_404(tz)
    d0 = _parse_ymd(day_from)
    d1 = _parse_ymd(day_to)
    if d1 <= d0:
        raise HTTPException(status_code=400, detail="day_to måste vara efter day_from")

    # 1) Hämta regler
    wh_rules = (
        db.query(UserWorkingHours)
        .filter(UserWorkingHours.user_id == user_id)
        .all()
    )
    time_off_items = (
        db.query(UserTimeOff)
        .filter(UserTimeOff.user_id == user_id)
        .filter(UserTimeOff.end_at > datetime(d0.year, d0.month, d0.day, tzinfo=local_tz).astimezone(timezone.utc))
        .filter(UserTimeOff.start_at < datetime(d1.year, d1.month, d1.day, tzinfo=local_tz).astimezone(timezone.utc))
        .order_by(UserTimeOff.start_at.asc())
        .all()
    )

    # (Valfritt) Hämta alla bokningar i spannet en gång, vi klipper per dag i svaret
    bookings_all: List[models.BayBooking] = []
    if include_bookings:
        span_start_local = datetime(d0.year, d0.month, d0.day, tzinfo=local_tz).astimezone(timezone.utc)
        span_end_local = datetime(d1.year, d1.month, d1.day, tzinfo=local_tz).astimezone(timezone.utc)
        bookings_all = (
            db.query(models.BayBooking)
            .filter(models.BayBooking.assigned_user_id == user_id)
            .filter(models.BayBooking.start_at < span_end_local)
            .filter(models.BayBooking.end_at > span_start_local)
            .order_by(models.BayBooking.start_at.asc())
            .all()
        )

    # 2) Bygg dagar
    days_out = []
    for cur in _daterange(d0, d1):
        # dagens lokala start/slut
        day_start_local = datetime(cur.year, cur.month, cur.day, 0, 0, 0, tzinfo=local_tz)
        day_end_local   = day_start_local.replace(hour=23, minute=59, second=59, microsecond=999999)
        day_start_utc   = day_start_local.astimezone(timezone.utc)
        day_end_utc     = day_end_local.astimezone(timezone.utc)

        # Working blocks: matcha veckodag + valid_from/to
        wd = (cur.weekday())  # 0=måndag
        wb = []
        for r in wh_rules:
            if r.weekday != wd:
                continue
            # validitetsfönster (datum, lokalt)
            if r.valid_from and cur < r.valid_from:
                continue
            if r.valid_to and cur > r.valid_to:
                continue

            # bygg lokala start/slut för passet
            sh, sm, *_ = str(r.start_time).split(":")
            eh, em, *_ = str(r.end_time).split(":")
            s_local = day_start_local.replace(hour=int(sh), minute=int(sm), second=0, microsecond=0)
            e_local = day_start_local.replace(hour=int(eh), minute=int(em), second=0, microsecond=0)

            if e_local <= s_local:
                continue

            # klipp mot dagens fönster (i lokal tid), returnera i både local & utc
            clip_local = _clip(s_local, e_local, day_start_local, day_end_local)
            if not clip_local:
                continue
            s_loc, e_loc = clip_local
            wb.append({
                "start_local": s_loc.isoformat(),
                "end_local": e_loc.isoformat(),
                "start_utc": s_loc.astimezone(timezone.utc).isoformat(),
                "end_utc": e_loc.astimezone(timezone.utc).isoformat(),
            })

        # Time off (klipp per dag)
        to_out = []
        for t in time_off_items:
            clip_utc = _clip(t.start_at, t.end_at, day_start_utc, day_end_utc)
            if not clip_utc:
                continue
            s_utc, e_utc = clip_utc
            to_out.append({
                "type": t.type.value if hasattr(t.type, "value") else str(t.type),
                "reason": t.reason,
                "start_utc": s_utc.isoformat(),
                "end_utc": e_utc.isoformat(),
                "start_local": s_utc.astimezone(local_tz).isoformat(),
                "end_local": e_utc.astimezone(local_tz).isoformat(),
            })

        # Bokningar (valfritt, klipp per dag)
        bk_out = []
        if include_bookings and bookings_all:
            for b in bookings_all:
                clip_utc = _clip(b.start_at, b.end_at, day_start_utc, day_end_utc)
                if not clip_utc:
                    continue
                s_utc, e_utc = clip_utc
                bk_out.append({
                    "id": b.id,
                    "title": b.title,
                    "status": b.status.value if hasattr(b.status, "value") else str(b.status),
                    "workshop_id": b.workshop_id,
                    "bay_id": b.bay_id,
                    "start_utc": s_utc.isoformat(),
                    "end_utc": e_utc.isoformat(),
                    "start_local": s_utc.astimezone(local_tz).isoformat(),
                    "end_local": e_utc.astimezone(local_tz).isoformat(),
                    "customer_id": b.customer_id,
                    "car_id": b.car_id,
                    "service_item_id": b.service_item_id,
                    "assigned_user_id": b.assigned_user_id,
                })

        days_out.append({
            "date": cur.isoformat(),
            "working_blocks": wb,
            "time_off": to_out,
            "bookings": bk_out if include_bookings else [],
        })

    return {
        "user_id": user_id,
        "tz": local_tz.key,
        "from": d0.isoformat(),
        "to": d1.isoformat(),
        "days": days_out,
    }
