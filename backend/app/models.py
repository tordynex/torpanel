from sqlalchemy import Column, Integer, String, Enum, ForeignKey, Table, Date, Text, Boolean, Float
from sqlalchemy.orm import relationship, declarative_base
import enum

Base = declarative_base()


class UserRole(str, enum.Enum):
    OWNER = "owner"
    WORKSHOP_USER = "workshop_user"


# Assoc-tabell för many-to-many User <-> Workshop
user_workshop_association = Table(
    "user_workshop_association",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("workshop_id", Integer, ForeignKey("workshops.id", ondelete="CASCADE"), primary_key=True),
)


class Workshop(Base):
    __tablename__ = "workshops"

    id = Column(Integer, primary_key=True, index=True)

    # Grundinformation
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    phone = Column(String, nullable=False)
    website = Column(String, nullable=True)

    # Adress
    street_address = Column(String, nullable=False)
    postal_code = Column(String, nullable=False)
    city = Column(String, nullable=False)
    country = Column(String, nullable=False)

    # Koordinater
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    # Företagsinfo
    org_number = Column(String, nullable=True)
    active = Column(Boolean, default=True)
    opening_hours = Column(String, nullable=True)
    notes = Column(String, nullable=True)

    # Relationer
    users = relationship(
        "User",
        secondary=user_workshop_association,
        back_populates="workshops",
        cascade="all, delete",
        passive_deletes=True,
    )

    service_logs = relationship("ServiceLog", back_populates="workshop")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), nullable=False)

    workshops = relationship(
        "Workshop",
        secondary=user_workshop_association,
        back_populates="users",
        passive_deletes=True,
    )

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    phone = Column(String, nullable=True)
    last_workshop_visited = Column(String, nullable=True)  # Kan ersättas med ForeignKey om du vill koppla till Workshop

    cars = relationship("Car", back_populates="owner")


class Car(Base):
    __tablename__ = "cars"

    id = Column(Integer, primary_key=True, index=True)
    registration_number = Column(String, unique=True, nullable=False)
    brand = Column(String, nullable=False)
    model_year = Column(Integer, nullable=False)

    # relation till kund
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"))
    owner = relationship("Customer", back_populates="cars")

    # relation till serviceloggar
    service_logs = relationship("ServiceLog", back_populates="car", cascade="all, delete-orphan")


class ServiceLog(Base):
    __tablename__ = "servicelogs"

    id = Column(Integer, primary_key=True, index=True)
    work_performed = Column(String, nullable=True)  # Ev. sammansatt summering
    date = Column(Date, nullable=False)
    mileage = Column(Integer, nullable=False)

    car_id = Column(Integer, ForeignKey("cars.id", ondelete="CASCADE"))
    car = relationship("Car", back_populates="service_logs")
    workshop_id = Column(Integer, ForeignKey("workshops.id", ondelete="SET NULL"))

    # Ny relation till ServiceTask
    tasks = relationship("ServiceTask", back_populates="service_log", cascade="all, delete-orphan")

    workshop = relationship("Workshop", back_populates="service_logs")

class ServiceTask(Base):
    __tablename__ = "servicetasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)  # t.ex. "Service", "Däckbyte"
    comment = Column(Text, nullable=True)

    service_log_id = Column(Integer, ForeignKey("servicelogs.id", ondelete="CASCADE"))
    service_log = relationship("ServiceLog", back_populates="tasks")