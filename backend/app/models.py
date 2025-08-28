from sqlalchemy import (
    Column, Integer, String, ForeignKey, Table, Date, DateTime, Text, Boolean, Float,
    select, UniqueConstraint, Index, CheckConstraint, Time, func
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import relationship, declarative_base, column_property
import enum
from sqlalchemy.dialects.postgresql import ExcludeConstraint
from sqlalchemy.ext.associationproxy import association_proxy
from datetime import date
from sqlalchemy.ext.hybrid import hybrid_property

Base = declarative_base()


class UserRole(str, enum.Enum):
    OWNER = "owner"
    WORKSHOP_USER = "workshop_user"
    WORKSHOP_EMPLOYEE = "workshop_employee"


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
    autonexo = Column(Boolean, default=True)
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

    workshops = relationship(
        "Workshop",
        secondary=user_workshop_association,
        back_populates="users",
        passive_deletes=True,
    )

    role = Column(
        SAEnum(
            UserRole,
            name="userrole",
            values_callable=lambda e: [x.value for x in e],
            native_enum=True,
            validate_strings=True,
            create_constraint=False,
        ),
        nullable=False,
        server_default=UserRole.WORKSHOP_USER.value,
    )



class Car(Base):
    __tablename__ = "cars"

    id = Column(Integer, primary_key=True, index=True)
    registration_number = Column(String, unique=True, nullable=False)
    brand = Column(String, nullable=False)
    model_year = Column(Integer, nullable=False)

    # ny relation
    customer_links = relationship("CustomerCar", back_populates="car", cascade="all, delete-orphan")
    service_logs = relationship("ServiceLog", back_populates="car", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_car_regnr", "registration_number"),
    )

    # Hjälp: aktiv primär ägare
    @property
    def primary_owner(self):
        today = date.today()
        for link in self.customer_links:
            if link.is_primary_owner and (link.valid_from is None or link.valid_from <= today) and (link.valid_to is None or link.valid_to >= today):
                return link.customer
        return None

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    workshop_id = Column(Integer, ForeignKey("workshops.id", ondelete="CASCADE"), nullable=False, index=True)

    first_name = Column(String, nullable=True)
    last_name  = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    last_workshop_visited = Column(String, nullable=True)

    workshop = relationship("Workshop", backref="customers", passive_deletes=True)

    __table_args__ = (
        UniqueConstraint("workshop_id", "email", name="uq_customer_workshop_email"),
        UniqueConstraint("workshop_id", "phone", name="uq_customer_workshop_phone"),
        Index("ix_customer_workshop", "workshop_id"),
    )

class CustomerCar(Base):
    __tablename__ = "customer_cars"
    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="CASCADE"), primary_key=True)
    car_id      = Column(Integer, ForeignKey("cars.id", ondelete="CASCADE"), primary_key=True)

    is_primary_owner = Column(Boolean, nullable=False, server_default="true")
    valid_from = Column(Date, nullable=True)
    valid_to   = Column(Date, nullable=True)
    notes      = Column(Text, nullable=True)

    customer = relationship("Customer", backref="car_links")
    car      = relationship("Car", back_populates="customer_links")

    __table_args__ = (
        CheckConstraint("valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from", name="ck_cc_valid_range"),
        Index("ix_cc_car", "car_id"),
        Index("ix_cc_customer", "customer_id"),
    )

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

    workshop_name = column_property(
        select(Workshop.name)
        .where(Workshop.id == workshop_id)
        .scalar_subquery()
    )


class ServiceTask(Base):
    __tablename__ = "servicetasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)  # t.ex. "Service", "Däckbyte"
    comment = Column(Text, nullable=True)

    service_log_id = Column(Integer, ForeignKey("servicelogs.id", ondelete="CASCADE"), index=True)
    service_log = relationship("ServiceLog", back_populates="tasks")

    # NYA FÄLT – deklareras direkt (utan ServiceTask.-prefix)
    catalog_item_id = Column(
        Integer,
        ForeignKey("workshop_service_items.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Antal/förbrukning på raden
    hours = Column(Float, nullable=True)       # hur många timmar (om timpris)
    quantity = Column(Float, nullable=True)    # om du vill prisa per "styck"

    # Pris-snapshot i öre
    unit_price_ore = Column(Integer, nullable=True)

    # Radbelopp i öre (kan beräknas eller sättas explicit)
    line_total_ore = Column(Integer, nullable=True)

    # Relation tillbaka till katalogen
    catalog_item = relationship("WorkshopServiceItem", back_populates="tasks")

    # Hjälp-props i SEK och auto-beräkning
    @hybrid_property
    def unit_price_sek(self):
        return (self.unit_price_ore or 0) / 100.0

    @hybrid_property
    def line_total_sek(self):
        # Om radbelopp explicit satt, använd det
        if self.line_total_ore is not None:
            return self.line_total_ore / 100.0

        # Annars härled från kopplad katalograd + timmar/quantity
        if self.catalog_item is not None:
            if self.catalog_item.price_type == ServicePriceType.FIXED:
                return (self.catalog_item.fixed_price_ore or 0) / 100.0
            else:
                hours = self.hours or 0.0
                rate = self.catalog_item.hourly_rate_ore or 0
                return (hours * rate) / 100.0

        # Fallback: unit_price * quantity/hours om satt
        if self.unit_price_ore is not None:
            qty = (self.quantity if self.quantity is not None else (self.hours or 1.0))
            return (qty * self.unit_price_ore) / 100.0

        return 0.0

class BayType(str, enum.Enum):
    TWO_POST_LIFT = "two_post_lift"
    FOUR_POST_LIFT = "four_post_lift"
    FLOOR_SPACE = "floor_space"
    ALIGNMENT_RACK = "alignment_rack"
    DIAGNOSIS = "diagnosis"
    MOT_BAY = "mot_bay"

class VehicleClass(str, enum.Enum):
    MOTORCYCLE = "motorcycle"
    SMALL_CAR = "small_car"
    SEDAN = "sedan"
    SUV = "suv"
    VAN = "van"
    PICKUP = "pickup"
    LIGHT_TRUCK = "light_truck"

class BookingStatus(str, enum.Enum):
    BOOKED = "booked"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"


# ---- Arbetsplats (bås/lyftplats) ----


class WorkshopBayVehicleClass(Base):
    __tablename__ = "workshopbay_vehicleclass"
    bay_id = Column(Integer, ForeignKey("workshopbays.id", ondelete="CASCADE"), primary_key=True)
    vehicle_class = Column(
        SAEnum(
            VehicleClass,
            name="vehicleclass",
            values_callable=lambda e: [x.value for x in e],
            native_enum=False,
            validate_strings=True,
            create_constraint=True,
        ),
        primary_key=True,
        nullable=False,
    )

    bay = relationship("WorkshopBay", back_populates="vehicle_classes")

class WorkshopBay(Base):
    __tablename__ = "workshopbays"

    id = Column(Integer, primary_key=True, index=True)
    workshop_id = Column(Integer, ForeignKey("workshops.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)  # t.ex. "Lyft 1", "Bås A"
    bay_type = Column(
        SAEnum(
            BayType,
            name="baytype",
            values_callable=lambda e: [x.value for x in e],
            native_enum=False,
            validate_strings=True,
            create_constraint=True,
        ),
        nullable=False,
    )

    # Fysikaliska begränsningar (NULL = obegränsat/okänt)
    max_length_mm = Column(Integer, nullable=True)
    max_width_mm = Column(Integer, nullable=True)
    max_height_mm = Column(Integer, nullable=True)
    max_weight_kg = Column(Integer, nullable=True)

    # True om platsen kan stå opåverkad under natten (viktigt för fler-dagars jobb)
    allow_overnight = Column(Boolean, default=True, nullable=False)

    # Frivilliga taggar/anteckningar
    notes = Column(Text, nullable=True)

    vehicle_classes = relationship(
        "WorkshopBayVehicleClass",
        back_populates="bay",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    supported_vehicle_classes = association_proxy("vehicle_classes", "vehicle_class")

    workshop = relationship("Workshop", backref="bays", passive_deletes=True)

    # Relationer
    bookings = relationship("BayBooking", back_populates="bay", cascade="all, delete-orphan", passive_deletes=True)
    closures = relationship("BayClosure", back_populates="bay", cascade="all, delete-orphan", passive_deletes=True)

    __table_args__ = (
        UniqueConstraint("workshop_id", "name", name="uq_workshopbay_workshop_name"),
        Index("ix_workshopbay_workshop", "workshop_id"),
    )


class VehicleProfile(Base):
    __tablename__ = "vehicleprofiles"

    id = Column(Integer, primary_key=True)
    car_id = Column(Integer, ForeignKey("cars.id", ondelete="CASCADE"), unique=True, nullable=False)

    vehicle_class = Column(
        SAEnum(
            VehicleClass,
            name="vehicleclass_profile",
            values_callable=lambda e: [x.value for x in e],
            native_enum=False,
            validate_strings=True,
            create_constraint=True,
        ),
        nullable=False,
    )

    length_mm = Column(Integer, nullable=True)
    width_mm = Column(Integer, nullable=True)
    height_mm = Column(Integer, nullable=True)
    weight_kg = Column(Integer, nullable=True)

    # t.ex. om bilen har drag, takbox etc. som påverkar höjd/längd
    extra_notes = Column(Text, nullable=True)

    car = relationship("Car", backref="vehicle_profile", uselist=False)

class BayBooking(Base):
    __tablename__ = "baybookings"

    id = Column(Integer, primary_key=True, index=True)

    workshop_id = Column(Integer, ForeignKey("workshops.id", ondelete="CASCADE"), nullable=False)
    bay_id = Column(Integer, ForeignKey("workshopbays.id", ondelete="CASCADE"), nullable=False)

    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    # Använd tidszonsmedvetna tider (Postgres TIMESTAMPTZ)
    start_at = Column(DateTime(timezone=True), nullable=False, index=True)
    end_at   = Column(DateTime(timezone=True), nullable=False, index=True)

    buffer_before_min = Column(Integer, default=0, nullable=False)
    buffer_after_min  = Column(Integer, default=0, nullable=False)

    price_net_ore = Column(Integer, nullable=True)
    price_gross_ore = Column(Integer, nullable=True)
    vat_percent = Column(Integer, nullable=True)
    price_note = Column(String, nullable=True)
    price_is_custom = Column(Boolean, nullable=True)
    final_price_ore = Column(Integer, nullable=True)
    price_type = Column(String, nullable=True)

    chain_token = Column(String, nullable=True, index=True)

    service_item_id = Column(
        Integer,
        ForeignKey("workshop_service_items.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Faktiskt utfall
    actual_minutes_spent = Column(Integer, nullable=True)
    billed_from_time = Column(Boolean, nullable=False, server_default="false")

    status = Column(
        SAEnum(
            BookingStatus,
            name="bookingstatus",
            values_callable=lambda e: [x.value for x in e],
            native_enum=False,
            validate_strings=True,
            create_constraint=True,
        ),
        nullable=False,
        server_default=BookingStatus.BOOKED.value,
    )

    customer_id     = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True)
    car_id          = Column(Integer, ForeignKey("cars.id", ondelete="SET NULL"), nullable=True)
    service_log_id  = Column(Integer, ForeignKey("servicelogs.id", ondelete="SET NULL"), nullable=True)
    assigned_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    source = Column(String, nullable=True)

    service_item = relationship("WorkshopServiceItem")
    workshop     = relationship("Workshop")
    bay          = relationship("WorkshopBay", back_populates="bookings")
    customer     = relationship("Customer")
    car          = relationship("Car")
    service_log  = relationship("ServiceLog")
    assigned_user= relationship("User")

    __table_args__ = (
        CheckConstraint("actual_minutes_spent IS NULL OR actual_minutes_spent >= 0", name="ck_booking_actual_minutes_nonneg"),
        CheckConstraint("end_at > start_at", name="ck_booking_time_order"),
        Index("ix_baybooking_workshop_time", "workshop_id", "start_at", "end_at"),
        Index("ix_baybooking_bay_time", "bay_id", "start_at", "end_at"),
        Index("ix_baybooking_chain_token", "chain_token"),
        CheckConstraint("vat_percent IS NULL OR (vat_percent >= 0 AND vat_percent <= 100)", name="ck_booking_vat_range"),
        CheckConstraint(
            "(price_net_ore IS NULL OR price_net_ore >= 0) AND "
            "(price_gross_ore IS NULL OR price_gross_ore >= 0) AND "
            "(final_price_ore IS NULL OR final_price_ore >= 0)",
            name="ck_booking_price_nonneg"
        ),

        # 1) Förhindra dubbelbokning per bås
        ExcludeConstraint(
            ('bay_id', '='),
            (
                func.tstzrange(
                    func.least(start_at, end_at),
                    func.greatest(start_at, end_at)
                ),
                '&&'
            ),
            name="excl_bay_double_book",
            using="gist",
        ),

        # 2) (Redan fanns i din kod för mekaniker – här är säkra varianten utan klassprefix)
        ExcludeConstraint(
            ('assigned_user_id', '='),
            (
                func.tstzrange(
                    func.least(start_at, end_at),
                    func.greatest(start_at, end_at)
                ),
                '&&'
            ),
            name="excl_user_double_book",
            using="gist",
            where=(assigned_user_id.isnot(None))
        ),
    )

class BayClosure(Base):
    __tablename__ = "bayclosures"

    id = Column(Integer, primary_key=True, index=True)
    bay_id = Column(Integer, ForeignKey("workshopbays.id", ondelete="CASCADE"), nullable=False)
    start_at = Column(DateTime(timezone=True), nullable=False, index=True)
    end_at = Column(DateTime(timezone=True), nullable=False, index=True)
    reason = Column(String, nullable=True)

    bay = relationship("WorkshopBay", back_populates="closures")

    __table_args__ = (
        CheckConstraint("end_at > start_at", name="ck_closure_time_order"),
        Index("ix_bayclosure_bay_time", "bay_id", "start_at", "end_at"),
    )

class TimeOffType(str, enum.Enum):
    VACATION = "vacation"
    SICK = "sick"
    TRAINING = "training"
    OTHER = "other"

class UserWorkingHours(Base):
    """
    Återkommande arbetspass per veckodag (0 = måndag, 6 = söndag).
    """
    __tablename__ = "user_working_hours"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)

    weekday = Column(Integer, nullable=False)  # 0=Mon ... 6=Sun
    start_time = Column(Time, nullable=False)  # t.ex. 08:00
    end_time = Column(Time, nullable=False)    # t.ex. 17:00

    # Giltighetsfönster för schemat (valfritt)
    valid_from = Column(Date, nullable=True)
    valid_to = Column(Date, nullable=True)

    user = relationship("User", backref="working_hours")

    __table_args__ = (
        CheckConstraint("weekday >= 0 AND weekday <= 6", name="ck_uwh_weekday"),
        CheckConstraint("end_time > start_time", name="ck_uwh_time_order"),
        Index("ix_uwh_user_weekday", "user_id", "weekday"),
    )


class UserTimeOff(Base):
    """
    Frånvaro/semester/sjuk – godtyckligt tidsintervall.
    """
    __tablename__ = "user_time_off"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    start_at = Column(DateTime(timezone=True), nullable=False, index=True)
    end_at = Column(DateTime(timezone=True), nullable=False, index=True)
    type = Column(
        SAEnum(
            TimeOffType,
            name="timeofftype",
            values_callable=lambda e: [x.value for x in e],
            native_enum=False,
            validate_strings=True,
            create_constraint=True,
        ),
        nullable=False,
        server_default=TimeOffType.VACATION.value,
    )
    reason = Column(String, nullable=True)

    user = relationship("User", backref="time_offs")

    __table_args__ = (
        CheckConstraint("end_at > start_at", name="ck_user_timeoff_order"),
        Index("ix_user_timeoff_user_time", "user_id", "start_at", "end_at"),
    )

# --- Ny enum för prissättningstyp ---
class ServicePriceType(str, enum.Enum):
    HOURLY = "hourly"   # timpris * timmar
    FIXED  = "fixed"    # fast pris per uppdrag


# --- Tjänstekatalog per verkstad (verkstaden lägger upp "Service A", "Däckbyte" osv.) ---
class WorkshopServiceItem(Base):
    __tablename__ = "workshop_service_items"

    id = Column(Integer, primary_key=True, index=True)
    workshop_id = Column(Integer, ForeignKey("workshops.id", ondelete="CASCADE"), nullable=False, index=True)

    # Namn/metadata
    name = Column(String, nullable=False)               # t.ex. "Service A"
    description = Column(Text, nullable=True)
    vehicle_class = Column(  # valfritt: begränsa till fordonsklass om du vill
        SAEnum(
            VehicleClass,
            name="vehicleclass_serviceitem",
            values_callable=lambda e: [x.value for x in e],
            native_enum=False,
            validate_strings=True,
            create_constraint=True,
        ),
        nullable=True,
    )

    # Prissättning
    price_type = Column(
        SAEnum(
            ServicePriceType,
            name="servicepricetype",
            values_callable=lambda e: [x.value for x in e],
            native_enum=False,
            validate_strings=True,
            create_constraint=True,
        ),
        nullable=True,
        server_default=None,
    )

    # Håller priser i öre (heltal) för exakt aritmetik
    hourly_rate_ore  = Column(Integer, nullable=True)   # krävs om price_type=hourly
    fixed_price_ore  = Column(Integer, nullable=True)   # krävs om price_type=fixed
    vat_percent      = Column(Integer, nullable=True)   # t.ex. 25

    request_only = Column(Boolean, nullable=False, server_default="false")

    # Förslag/UX
    default_duration_min = Column(Integer, nullable=True)  # ex. 60
    is_active = Column(Boolean, nullable=False, server_default="true")

    tasks = relationship("ServiceTask", back_populates="catalog_item", passive_deletes=True)

    workshop = relationship("Workshop", backref="service_items", passive_deletes=True)

    __table_args__ = (
        UniqueConstraint("workshop_id", "name", name="uq_service_item_workshop_name"),
        Index("ix_service_item_workshop", "workshop_id"),
        CheckConstraint(
            "(request_only = true) OR ("
            " (price_type = 'hourly' AND hourly_rate_ore IS NOT NULL AND fixed_price_ore IS NULL) "
            " OR "
            " (price_type = 'fixed'  AND fixed_price_ore  IS NOT NULL AND hourly_rate_ore  IS NULL)"
            ")",
            name="ck_service_item_price_consistency"
        ),

        CheckConstraint("vat_percent IS NULL OR (vat_percent >= 0 AND vat_percent <= 100)", name="ck_vat_range"),
    )

    # Bekväma properties i SEK
    @hybrid_property
    def hourly_rate_sek(self):
        return (self.hourly_rate_ore or 0) / 100.0

    @hybrid_property
    def fixed_price_sek(self):
        return (self.fixed_price_ore or 0) / 100.0

# --- BookingRequest för request-only ärenden ---

class BookingRequestStatus(str, enum.Enum):
    OPEN = "open"
    HANDLED = "handled"
    CONVERTED = "converted_to_booking"

class BookingRequestServiceItem(Base):
    __tablename__ = "booking_request_service_items"
    booking_request_id = Column(Integer, ForeignKey("booking_requests.id", ondelete="CASCADE"), primary_key=True)
    service_item_id = Column(Integer, ForeignKey("workshop_service_items.id", ondelete="CASCADE"), primary_key=True)
    __table_args__ = (UniqueConstraint("booking_request_id", "service_item_id", name="uq_br_serviceitem"),)

class BookingRequest(Base):
    __tablename__ = "booking_requests"

    id = Column(Integer, primary_key=True, index=True)

    workshop_id = Column(Integer, ForeignKey("workshops.id", ondelete="CASCADE"), nullable=False, index=True)
    workshop = relationship("Workshop", backref="booking_requests", passive_deletes=True)

    service_item_id = Column(Integer, ForeignKey("workshop_service_items.id", ondelete="SET NULL"), nullable=True, index=True)
    service_item = relationship("WorkshopServiceItem")

    customer_id = Column(Integer, ForeignKey("customers.id", ondelete="SET NULL"), nullable=True, index=True)
    customer = relationship("Customer")

    car_id = Column(Integer, ForeignKey("cars.id", ondelete="SET NULL"), nullable=True, index=True)
    car = relationship("Car")

    registration_number = Column(String, nullable=True)

    first_name = Column(String, nullable=True)
    last_name  = Column(String, nullable=True)
    email      = Column(String, nullable=True)
    phone      = Column(String, nullable=True)

    message = Column(Text, nullable=True)

    status = Column(
        SAEnum(
            BookingRequestStatus,
            name="bookingrequeststatus",
            values_callable=lambda e: [x.value for x in e],
            native_enum=False,
            validate_strings=True,
            create_constraint=True,
        ),
        nullable=False,
        server_default=BookingRequestStatus.OPEN.value,
    )

    service_items = relationship(
        "WorkshopServiceItem",
        secondary="booking_request_service_items",
        lazy="joined",
    )

    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())

    __table_args__ = (
        CheckConstraint(
            "(customer_id IS NOT NULL) OR (email IS NOT NULL OR phone IS NOT NULL)",
            name="ck_bookingreq_contact_available"
        ),
        Index("ix_bookingreq_workshop_status_created", "workshop_id", "status", "created_at"),
    )

