from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import date
import enum


# ----------------------------
# USER
# ----------------------------

class UserRole(str, enum.Enum):
    OWNER = "owner"
    WORKSHOP_USER = "workshop_user"


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

    class Config:
        from_attributes = True

class WorkshopSimple(BaseModel):
    id: int
    name: str
    email: EmailStr

    class Config:
        from_attributes = True


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

    class Config:
        from_attributes = True


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
    opening_hours: Optional[str] = None
    notes: Optional[str] = None


# Skapa workshop – inkluderar val av användare
class WorkshopCreate(WorkshopBase):
    user_ids: Optional[List[int]] = []


# Läs workshop – inkluderar kopplade användare
class WorkshopRead(WorkshopBase):
    id: int
    users: List[UserSimple] = []

    class Config:
        from_attributes = True

class UserRead(UserBase):
    id: int
    workshops: List[WorkshopRead] = []

    class Config:
        from_attributes = True

# ----------------------------
# CUSTOMER
# ----------------------------

class CustomerBase(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    phone: Optional[str] = None
    last_workshop_visited: Optional[str] = None

class CustomerCreate(CustomerBase):
    pass

class CustomerRead(CustomerBase):
    id: int

    class Config:
        from_attributes = True

# ----------------------------
# CAR
# ----------------------------

class CarBase(BaseModel):
    registration_number: str
    brand: str
    model_year: int

class CarCreate(CarBase):
    customer_id: Optional[int] = None


class CarRead(CarBase):
    id: int
    owner: Optional[CustomerRead]
    service_logs: List['ServiceLogRead'] = []

    class Config:
        from_attributes = True

# ----------------------------
# SERVICE LOG
# ----------------------------

class ServiceTaskBase(BaseModel):
    title: str
    comment: Optional[str] = None

class ServiceTaskCreate(BaseModel):
    title: str
    comment: str = ""

class ServiceTaskRead(BaseModel):
    id: int
    title: str
    comment: str

    class Config:
        from_attributes = True


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
    car: Optional[CarBase] = None

class ServiceLogUpdate(BaseModel):
    work_performed: Optional[str]
    date: date
    mileage: int
    workshop_id: Optional[int]
    tasks: Optional[List[ServiceTaskCreate]] = None

    class Config:
        from_attributes = True



CarRead.update_forward_refs()
