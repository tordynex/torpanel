from pydantic import BaseModel, EmailStr, Field, validator, ConfigDict, model_validator
from typing import Optional, List
from datetime import date, datetime, time

from app import models

from .models import UserRole, BayType, VehicleClass, TimeOffType, ServicePriceType
import enum


# ----------------------------
# USER
# ----------------------------

class UserBase(BaseModel):
    username: str
    email: EmailStr
    role: UserRole


class UserCreate(UserBase):
    password: str
    workshop_ids: Optional[List[int]] = []

class UserSimple(BaseModel):
    id: int
    username: str
    email: EmailStr
    role: UserRole

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    token_type: str

# ----------------------------
# WORKSHOP
# ----------------------------

# Enkel workshop för användare
class WorkshopSimple(BaseModel):
    id: int
    name: str
    email: EmailStr

    model_config = ConfigDict(from_attributes=True)



# Basinformation för workshop
class WorkshopBase(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    website: Optional[str] = None

    street_address: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    country: Optional[str] = None

    latitude: Optional[float] = None
    longitude: Optional[float] = None

    org_number: Optional[str] = None
    active: Optional[bool] = True
    autonexo: Optional[bool] = True
    opening_hours: Optional[str] = None
    notes: Optional[str] = None


# Skapa workshop – inkluderar val av användare
class WorkshopCreate(WorkshopBase):
    user_ids: Optional[List[int]] = []


# Läs workshop – inkluderar kopplade användare
class WorkshopRead(WorkshopBase):
    id: int
    users: List[UserSimple] = []

    model_config = ConfigDict(from_attributes=True)


class UserRead(UserBase):
    id: int
    workshops: List[WorkshopRead] = []

    model_config = ConfigDict(from_attributes=True)


# ----------------------------
# CUSTOMER
# ----------------------------

# --- CUSTOMER ---
class CustomerBase(BaseModel):
    workshop_id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    last_workshop_visited: Optional[str] = None

class CustomerCreate(CustomerBase): pass

class CustomerRead(CustomerBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

class CustomerCarRead(BaseModel):
    customer_id: int
    car_id: int
    is_primary_owner: bool = True
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None
    model_config = ConfigDict(from_attributes=True)


class CustomerSummary(BaseModel):
    id: int
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)



# ----------------------------
# CAR
# ----------------------------

class CarBase(BaseModel):
    registration_number: str
    brand: str
    model_year: int

class CarCreate(CarBase):
    pass

class CarReadSimple(CarBase):
    id: int


class CarRead(CarBase):
    id: int
    service_logs: List['ServiceLogRead'] = []
    owners: List[CustomerCarRead] = []

    model_config = ConfigDict(from_attributes=True)

# ----------------------------
# SERVICE LOG
# ----------------------------

# ---------- SERVICE TASK (rader på serviceloggen) ----------

class ServiceTaskBase(BaseModel):
    title: str
    comment: Optional[str] = None

    catalog_item_id: Optional[int] = None
    hours: Optional[float] = Field(None, ge=0)       # vid timpris
    quantity: Optional[float] = Field(None, ge=0)    # om du prisar per styck
    unit_price_ore: Optional[int] = Field(None, ge=0)   # snapshot
    line_total_ore: Optional[int] = Field(None, ge=0)   # kan sättas explicit


class ServiceTaskCreate(ServiceTaskBase):
    pass


class ServiceTaskRead(ServiceTaskBase):
    id: int

    # read-only, kommer från hybrid properties på modellen om du väljer att exponera dem
    unit_price_sek: Optional[float] = None
    line_total_sek: Optional[float] = None

    # praktiskt att skicka med enkel kataloginfo i läsning
    catalog_item: Optional["WorkshopServiceItemRead"] = None

    model_config = ConfigDict(from_attributes=True)



class ServiceLogBase(BaseModel):
    work_performed: str
    date: date
    mileage: int

class ServiceLogCreate(ServiceLogBase):
    car_id: int
    workshop_id: int
    tasks: List[ServiceTaskCreate] = []

class ServiceLogRead(ServiceLogBase):
    id: int
    tasks: List[ServiceTaskRead] = []
    workshop_id: Optional[int]
    workshop_name: Optional[str]
    car: Optional[CarBase] = None

class ServiceLogUpdate(BaseModel):
    work_performed: Optional[str]
    date: date
    mileage: int
    workshop_id: Optional[int]
    tasks: Optional[List[ServiceTaskCreate]] = None

    model_config = ConfigDict(from_attributes=True)

# ---------- BAS ----------

class WorkshopBayBase(BaseModel):
    name: str
    bay_type: BayType
    max_length_mm: Optional[int] = None
    max_width_mm: Optional[int] = None
    max_height_mm: Optional[int] = None
    max_weight_kg: Optional[int] = None
    allow_overnight: Optional[bool] = True
    notes: Optional[str] = None
    vehicle_classes: Optional[List[VehicleClass]] = None  # Tillåtna fordonsklasser


# ---------- CREATE ----------

class WorkshopBayCreate(WorkshopBayBase):
    workshop_id: int


# ---------- UPDATE ----------

class WorkshopBayUpdate(BaseModel):
    name: Optional[str] = None
    bay_type: Optional[BayType] = None
    max_length_mm: Optional[int] = None
    max_width_mm: Optional[int] = None
    max_height_mm: Optional[int] = None
    max_weight_kg: Optional[int] = None
    allow_overnight: Optional[bool] = None
    notes: Optional[str] = None
    vehicle_classes: Optional[List[VehicleClass]] = None


# ---------- READ SIMPLE ----------

class WorkshopBayReadSimple(BaseModel):
    id: int
    workshop_id: int
    name: str
    bay_type: BayType

    model_config = ConfigDict(from_attributes=True)


# ---------- READ FULL ----------

class WorkshopBayRead(WorkshopBayReadSimple):
    max_length_mm: Optional[int]
    max_width_mm: Optional[int]
    max_height_mm: Optional[int]
    max_weight_kg: Optional[int]
    allow_overnight: bool
    notes: Optional[str]
    vehicle_classes: List[VehicleClass] = []

    model_config = ConfigDict(from_attributes=True)
# ---------- BayBooking ----------

class BayBookingBase(BaseModel):
    workshop_id: int
    bay_id: int
    title: str
    description: Optional[str] = None
    start_at: datetime
    end_at: datetime
    buffer_before_min: int = 0
    buffer_after_min: int = 0
    status: Optional[models.BookingStatus] = None  # default sätts i DB om None
    customer_id: Optional[int] = None
    car_id: Optional[int] = None
    service_log_id: Optional[int] = None
    assigned_user_id: Optional[int] = None
    source: Optional[str] = None
    price_net_ore: Optional[int] = None
    price_gross_ore: Optional[int] = None
    vat_percent: Optional[int] = None
    price_note: Optional[str] = None
    price_is_custom: Optional[bool] = None
    final_price_ore: Optional[int] = None
    service_item_id: Optional[int] = None
    actual_minutes_spent: Optional[int] = Field(None, ge=0)
    billed_from_time: Optional[bool] = None
    chain_token: Optional[str] = None



class BayBookingCreate(BayBookingBase):
    pass


class BayBookingUpdate(BaseModel):
    # Alla fält frivilliga; endast skickade fält uppdateras
    workshop_id: Optional[int] = None
    bay_id: Optional[int] = None
    title: Optional[str] = None
    description: Optional[str] = None
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    buffer_before_min: Optional[int] = None
    buffer_after_min: Optional[int] = None
    status: Optional[models.BookingStatus] = None
    customer_id: Optional[int] = None
    car_id: Optional[int] = None
    service_log_id: Optional[int] = None
    assigned_user_id: Optional[int] = None
    source: Optional[str] = None
    price_net_ore: Optional[int] = None
    price_gross_ore: Optional[int] = None
    vat_percent: Optional[int] = None
    price_note: Optional[str] = None
    price_is_custom: Optional[bool] = None
    final_price_ore: Optional[int] = None
    service_item_id: Optional[int] = None
    chain_token: Optional[str] = None

class BayBookingRead(BaseModel):
    id: int

    workshop_id: int
    bay_id: int

    title: str
    description: Optional[str] = None

    start_at: datetime
    end_at: datetime

    buffer_before_min: int
    buffer_after_min: int

    status: models.BookingStatus

    customer_id: Optional[int] = None
    car_id: Optional[int] = None
    service_log_id: Optional[int] = None
    assigned_user_id: Optional[int] = None
    source: Optional[str] = None

    price_net_ore: Optional[int] = None
    price_gross_ore: Optional[int] = None
    vat_percent: Optional[int] = None
    price_note: Optional[str] = None
    price_is_custom: Optional[bool] = None

    final_price_ore: Optional[int] = None

    service_item_id: Optional[int] = None

    service_item: Optional["WorkshopServiceItemRead"] = None

    chain_token: Optional[str] = None

    car: Optional["CarReadSimple"] = None
    customer: Optional["CustomerSummary"] = None
    car_primary_customer: Optional["CustomerSummary"] = None

    model_config = ConfigDict(from_attributes=True)


class BayAvailabilityResult(BaseModel):
    available: bool
    reason: Optional[str] = None


class UserWorkingHoursBase(BaseModel):
    user_id: int
    weekday: int = Field(..., ge=0, le=6, description="0=mån ... 6=sön")
    start_time: time
    end_time: time
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None

    @validator("end_time")
    def _end_after_start(cls, v, values):
        st = values.get("start_time")
        if st and v <= st:
            raise ValueError("end_time måste vara senare än start_time")
        return v

    @validator("valid_to")
    def _valid_to_after_from(cls, v, values):
        vf = values.get("valid_from")
        if v and vf and v < vf:
            raise ValueError("valid_to kan inte vara före valid_from")
        return v


class UserWorkingHoursCreate(UserWorkingHoursBase):
    pass


class UserWorkingHoursUpdate(BaseModel):
    weekday: Optional[int] = Field(None, ge=0, le=6)
    start_time: Optional[time] = None
    end_time: Optional[time] = None
    valid_from: Optional[date] = None
    valid_to: Optional[date] = None

    @validator("end_time")
    def _end_after_start_update(cls, v, values):
        st = values.get("start_time")
        # validera bara om båda skickas i samma update
        if st is not None and v is not None and v <= st:
            raise ValueError("end_time måste vara senare än start_time")
        return v

    @validator("valid_to")
    def _valid_to_after_from_update(cls, v, values):
        vf = values.get("valid_from")
        if v and vf and v < vf:
            raise ValueError("valid_to kan inte vara före valid_from")
        return v


class UserWorkingHoursRead(UserWorkingHoursBase):
    id: int

    model_config = ConfigDict(from_attributes=True)

class UserTimeOffBase(BaseModel):
    user_id: int
    start_at: datetime
    end_at: datetime
    type: TimeOffType = TimeOffType.VACATION
    reason: Optional[str] = None

    @validator("end_at")
    def _end_after_start(cls, v, values):
        st = values.get("start_at")
        if st and v <= st:
            raise ValueError("end_at måste vara senare än start_at")
        return v


class UserTimeOffCreate(UserTimeOffBase):
    pass


class UserTimeOffUpdate(BaseModel):
    start_at: Optional[datetime] = None
    end_at: Optional[datetime] = None
    type: Optional[TimeOffType] = None
    reason: Optional[str] = None

    @validator("end_at")
    def _end_after_start_update(cls, v, values):
        st = values.get("start_at")
        if st and v and v <= st:
            raise ValueError("end_at måste vara senare än start_at")
        return v


class UserTimeOffRead(UserTimeOffBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


# --- WorkshopServiceItemBase ---
class WorkshopServiceItemBase(BaseModel):
    name: str
    description: Optional[str] = None
    vehicle_class: Optional[VehicleClass] = None

    # GÖR price_type VALFRI
    price_type: Optional[ServicePriceType] = None
    hourly_rate_ore: Optional[int] = Field(None, ge=0)
    fixed_price_ore: Optional[int] = Field(None, ge=0)
    vat_percent: Optional[int] = Field(None, ge=0, le=100)

    default_duration_min: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = True

    request_only: Optional[bool] = False

    @model_validator(mode="after")
    def _validate_and_normalize_price_fields(self):
        if getattr(self, "request_only", False):
            # Request only: ta bort alla prisrelaterade fält
            self.price_type = None
            self.hourly_rate_ore = None
            self.fixed_price_ore = None
            self.vat_percent = None
            self.default_duration_min = None
            return self

        # Ej request_only: pris_type måste finnas och matcha rätt fält
        pt = self.price_type
        hr = self.hourly_rate_ore
        fx = self.fixed_price_ore

        if pt is None:
            raise ValueError("price_type måste anges när request_only = false")

        if pt == ServicePriceType.FIXED:
            if fx is None:
                raise ValueError("fixed_price_ore måste vara satt när price_type = fixed")
            self.hourly_rate_ore = None
        elif pt == ServicePriceType.HOURLY:
            if hr is None:
                raise ValueError("hourly_rate_ore måste vara satt när price_type = hourly")
            self.fixed_price_ore = None

        return self


# =========================
# Create
# =========================
class WorkshopServiceItemCreate(WorkshopServiceItemBase):
    workshop_id: int


# =========================
# Update (partial)
# =========================
class WorkshopServiceItemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    vehicle_class: Optional[VehicleClass] = None
    price_type: Optional[ServicePriceType] = None
    hourly_rate_ore: Optional[int] = Field(None, ge=0)
    fixed_price_ore: Optional[int] = Field(None, ge=0)
    vat_percent: Optional[int] = Field(None, ge=0, le=100)
    default_duration_min: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None
    request_only: Optional[bool] = None

    @model_validator(mode="after")
    def _normalize_partial_update(self):
        # Om vi sätter request_only=True i en update → nolla pris
        if getattr(self, "request_only", None) is True:
            self.price_type = None
            self.hourly_rate_ore = None
            self.fixed_price_ore = None
            self.vat_percent = None
            self.default_duration_min = None
            return self

        pt = self.price_type
        hr = self.hourly_rate_ore
        fx = self.fixed_price_ore

        if hr is not None and fx is not None:
            raise ValueError("Skicka inte både hourly_rate_ore och fixed_price_ore i samma uppdatering.")

        if pt == ServicePriceType.FIXED:
            self.hourly_rate_ore = None
        elif pt == ServicePriceType.HOURLY:
            self.fixed_price_ore = None

        return self

# =========================
# Read
# =========================
class WorkshopServiceItemRead(WorkshopServiceItemBase):
    id: int
    workshop_id: int

    # Pydantic v2
    model_config = ConfigDict(from_attributes=True)

class LunchPresetRequest(BaseModel):
    """
    Skapa veckoschema med lunchpaus genom att lägga två pass per vald veckodag.
    Ex: 08:00–12:00 och 13:00–17:00 (mån–fre).
    """
    weekdays: List[int] = Field(default_factory=lambda: [0,1,2,3,4], description="0=mån ... 6=sön")
    start_time: time = Field(default=time(8,0,0))
    lunch_start: time = Field(default=time(12,0,0))
    lunch_end: time   = Field(default=time(13,0,0))
    end_time: time   = Field(default=time(17,0,0))
    valid_from: Optional[date] = None
    valid_to: Optional[date]   = None

    @validator("weekdays")
    def _check_weekdays(cls, v):
        if not v:
            raise ValueError("Minst en veckodag måste anges")
        if any((d < 0 or d > 6) for d in v):
            raise ValueError("weekday måste vara 0..6")
        return sorted(set(v))

    @validator("lunch_start")
    def _order_checks(cls, v, values):
        st = values.get("start_time")
        le = values.get("lunch_end")
        et = values.get("end_time")
        if st and v <= st:
            raise ValueError("lunch_start måste vara efter start_time")
        if le and v >= le:
            raise ValueError("lunch_start måste vara före lunch_end")
        if et and v >= et:
            raise ValueError("lunch_start måste vara före end_time")
        return v

    @validator("lunch_end")
    def _order_checks2(cls, v, values):
        st = values.get("start_time")
        ls = values.get("lunch_start")
        et = values.get("end_time")
        if ls and v <= ls:
            raise ValueError("lunch_end måste vara efter lunch_start")
        if st and v <= st:
            raise ValueError("lunch_end måste vara efter start_time")
        if et and v >= et:
            raise ValueError("lunch_end måste vara före end_time")
        return v

    @validator("end_time")
    def _order_checks3(cls, v, values):
        st = values.get("start_time")
        if st and v <= st:
            raise ValueError("end_time måste vara efter start_time")
        return v

# ----------------------------
# BOOKING REQUEST (för request-only)
# ----------------------------

class BookingRequestStatus(str, enum.Enum):
    OPEN = "open"
    HANDLED = "handled"
    CONVERTED = "converted_to_booking"


class BookingRequestBase(BaseModel):
    workshop_id: int

    service_item_id: Optional[int] = None
    service_item_ids: Optional[List[int]] = None

    # Antingen referenser till befintliga poster...
    customer_id: Optional[int] = None
    car_id: Optional[int] = None

    # ...eller "gäst"-uppgifter:
    registration_number: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None

    message: Optional[str] = None

    @model_validator(mode="after")
    def _validate_minimum_contact(self):
        """
        Minimikrav: något sätt att nå kunden måste finnas.
        Antingen befintlig customer_id ELLER email/telefon.
        (Matchar DB-checken.)
        """
        if not self.customer_id and not (self.email or self.phone):
            raise ValueError("Ange minst e-post eller telefon om customer_id saknas.")
        return self


class BookingRequestCreate(BookingRequestBase):
    pass


class BookingRequestUpdate(BaseModel):
    # Verkstaden ska kunna uppdatera status och ev. komplettera info
    status: Optional[BookingRequestStatus] = None
    message: Optional[str] = None

    # Tillåt länkning i efterhand
    customer_id: Optional[int] = None
    car_id: Optional[int] = None
    registration_number: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None


class BookingRequestRead(BaseModel):
    id: int
    workshop_id: int
    service_item_id: Optional[int] = None
    service_items: List["WorkshopServiceItemRead"] = []

    customer_id: Optional[int] = None
    car_id: Optional[int] = None
    registration_number: Optional[str] = None

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None

    message: Optional[str] = None
    status: BookingRequestStatus

    created_at: datetime
    updated_at: datetime

    # Vill du skicka med enkel item-info? Avkommentera nästa rad och se till att din CRUD joinar in den:
    # service_item: Optional["WorkshopServiceItemRead"] = None

    model_config = ConfigDict(from_attributes=True)

# Pydantic v2: rebuild for forward refs
BayBookingRead.model_rebuild()
ServiceTaskRead.model_rebuild()
WorkshopServiceItemRead.model_rebuild()
ServiceLogRead.model_rebuild()
CarRead.model_rebuild()
