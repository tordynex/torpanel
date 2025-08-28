from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from sqlalchemy.sql import expression, operators
from sqlalchemy.exc import IntegrityError

from psycopg2.errors import CheckViolation, UniqueViolation


from app import models, schemas
from app.database import get_db
from app.auth import get_current_user

router = APIRouter()

# ----------------------------
# Hjälpare
# ----------------------------

def _role_value(user: models.User) -> str:
    """Returnera str-värdet för användarrollen (Enum eller str)."""
    try:
        return user.role.value  # Enum
    except AttributeError:
        return str(user.role)   # Redan str


def _assert_workshop_access(db: Session, current_user: models.User, workshop_id: int) -> None:
    """
    Tillåt om:
      - OWNER
      - eller användaren är kopplad till verkstaden via associationstabellen
    """
    if _role_value(current_user) == models.UserRole.OWNER.value:
        return

    link_exists = (
        db.query(models.user_workshop_association)
        .filter(
            models.user_workshop_association.c.user_id == current_user.id,
            models.user_workshop_association.c.workshop_id == workshop_id,
        )
        .first()
    )
    if not link_exists:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Behörighet saknas för denna verkstad."
        )


def _ensure_unique_name(db: Session, workshop_id: int, name: str, exclude_id: Optional[int] = None) -> None:
    q = db.query(models.WorkshopServiceItem).filter(
        models.WorkshopServiceItem.workshop_id == workshop_id,
        models.WorkshopServiceItem.name == name,
    )
    if exclude_id is not None:
        q = q.filter(models.WorkshopServiceItem.id != exclude_id)
    exists = db.query(q.exists()).scalar()
    if exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Det finns redan en tjänst med samma namn i denna verkstad."
        )


@router.get("/{item_id}", response_model=schemas.WorkshopServiceItemRead)
def get_service_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = db.query(models.WorkshopServiceItem).filter(models.WorkshopServiceItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tjänst hittades inte.")
    _assert_workshop_access(db, current_user, item.workshop_id)
    return item

# ----------------------------
# Skapa
# ----------------------------

@router.post("/create", response_model=schemas.WorkshopServiceItemRead, status_code=status.HTTP_201_CREATED)
def create_service_item(
    payload: schemas.WorkshopServiceItemCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Behörighet
    _assert_workshop_access(db, current_user, payload.workshop_id)

    # Unikt namn per verkstad
    _ensure_unique_name(db, payload.workshop_id, payload.name)

    # Hjälpfunktion: normalisera 0/"" -> None
    def _none_if_empty_or_zero(v):
        if v is None:
            return None
        if isinstance(v, str):
            s = v.strip()
            if s == "" or s == "0":
                return None
            try:
                v = int(s)
            except ValueError:
                return None
        if isinstance(v, (int, float)) and v == 0:
            return None
        return v

    # Initiera modell
    item = models.WorkshopServiceItem(
        workshop_id=payload.workshop_id,
        name=payload.name,
        description=payload.description,
        # NULL = "alla fordon" (UI-fältet borttaget)
        vehicle_class=getattr(payload, "vehicle_class", None),
        # defaulta price_type om inte satt i payload
        price_type=getattr(payload, "price_type", models.ServicePriceType.HOURLY),
        hourly_rate_ore=_none_if_empty_or_zero(getattr(payload, "hourly_rate_ore", None)),
        fixed_price_ore=_none_if_empty_or_zero(getattr(payload, "fixed_price_ore", None)),
        vat_percent=getattr(payload, "vat_percent", None),
        default_duration_min=getattr(payload, "default_duration_min", None),
        is_active=True if getattr(payload, "is_active", None) is None else bool(payload.is_active),
        request_only=bool(getattr(payload, "request_only", False)),
    )

    # --- Villkorlig normalisering/validering ---
    if item.request_only:
        item.price_type = None
        item.hourly_rate_ore = None
        item.fixed_price_ore = None
        item.vat_percent = None
        item.default_duration_min = None
        # price_type/vat/default_duration kan lämnas orörda; DB-checken släpper igenom ändå
    else:
        # Ordinarie regler: exakt ett prisfält baserat på price_type
        if item.price_type == models.ServicePriceType.FIXED:
            item.hourly_rate_ore = None
            if item.fixed_price_ore is None:
                raise HTTPException(
                    status_code=400,
                    detail="fixed_price_ore krävs när price_type=fixed"
                )
        elif item.price_type == models.ServicePriceType.HOURLY:
            item.fixed_price_ore = None
            if item.hourly_rate_ore is None:
                raise HTTPException(
                    status_code=400,
                    detail="hourly_rate_ore krävs när price_type=hourly"
                )

    db.add(item)

    # Hjälpare för felmappning från Postgres/psycopg2
    def _pg_constraint_name(e: IntegrityError):
        try:
            return getattr(getattr(e.orig, "diag", None), "constraint_name", None)
        except Exception:
            return None

    def _pg_code(e: IntegrityError):
        # 23505 = unique_violation, 23514 = check_violation
        return getattr(getattr(e, "orig", None), "pgcode", None)

    def _err_text(e: IntegrityError):
        try:
            return str(getattr(e, "orig", e))
        except Exception:
            return "okänt integritetsfel"

    try:
        print("[WSI create] about to commit:", {
            "price_type": str(item.price_type),
            "fixed": item.fixed_price_ore,
            "hourly": item.hourly_rate_ore,
            "name": item.name,
            "ws": item.workshop_id,
            "vehicle_class": str(item.vehicle_class) if item.vehicle_class else None,
            "request_only": item.request_only,
        })
        db.commit()
    except IntegrityError as e:
        db.rollback()
        c = _pg_constraint_name(e)
        code = _pg_code(e)
        raw = _err_text(e)
        print(f"[WSI create] IntegrityError pgcode={code} constraint={c} raw={raw}")

        # Unikt namn
        if c == "uq_service_item_workshop_name" or code == "23505":
            raise HTTPException(status_code=409, detail="Det finns redan en tjänst med samma namn i denna verkstad.")

        # Pris-kombination (OBS: måste vara uppdaterad i DB för request_only → se migrationen)
        if c == "ck_service_item_price_consistency" or code == "23514":
            raise HTTPException(status_code=400, detail="Ogiltig kombination av prisfält för valt price_type.")

        # Moms
        if c == "ck_vat_range":
            raise HTTPException(status_code=400, detail="Moms (vat_percent) måste vara mellan 0 och 100.")

        # Vehicle class‑check
        if c == "vehicleclass_serviceitem" or ("vehicleclass_serviceitem" in raw):
            raise HTTPException(
                status_code=400,
                detail="Ogiltig vehicle_class för posten. Lämna tom/null om tjänsten ska gälla alla fordon.",
            )

        # Fallback i dev
        raise HTTPException(status_code=400, detail=f"Kunde inte spara posten (integritetsfel): {raw}")

    db.refresh(item)
    return item

# ----------------------------
# Lista per verkstad
# ----------------------------


@router.get("/workshop/{workshop_id}", response_model=List[schemas.WorkshopServiceItemRead])
def list_service_items_for_workshop(
    workshop_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    q: Optional[str] = Query(None, description="Fritextsök i namn (ilike)"),
    active: Optional[bool] = Query(None, description="Filtrera på is_active"),
    vehicle_class: Optional[models.VehicleClass] = Query(None, description="Filtrera på fordonsklass"),
):
    _assert_workshop_access(db, current_user, workshop_id)

    query = db.query(models.WorkshopServiceItem).filter(
        models.WorkshopServiceItem.workshop_id == workshop_id
    )

    if q:
        query = query.filter(models.WorkshopServiceItem.name.ilike(f"%{q}%"))

    if active is not None:
        query = query.filter(models.WorkshopServiceItem.is_active == active)

    # Viktigt: NULL i DB betyder "gäller alla", så inkludera NULL när vi filtrerar
    if vehicle_class is not None:
        query = query.filter(
            or_(
                models.WorkshopServiceItem.vehicle_class == vehicle_class,  # exakt träff
                models.WorkshopServiceItem.vehicle_class.is_(None),         # NULL = alla
            )
        )

    return query.order_by(models.WorkshopServiceItem.name.asc()).all()

# ----------------------------
# Läs en post
# ----------------------------

@router.put("/{item_id}", response_model=schemas.WorkshopServiceItemRead, response_model_exclude_unset=True)
def update_service_item(
    item_id: int,
    payload: schemas.WorkshopServiceItemUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = db.query(models.WorkshopServiceItem).filter(models.WorkshopServiceItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tjänst hittades inte.")

    _assert_workshop_access(db, current_user, item.workshop_id)

    # Om namn ändras, säkra unikt per verkstad
    if payload.name and payload.name != item.name:
        _ensure_unique_name(db, item.workshop_id, payload.name, exclude_id=item.id)

    # Applicera inkommande fält
    for field in [
        "name", "description", "vehicle_class", "price_type",
        "hourly_rate_ore", "fixed_price_ore", "vat_percent",
        "default_duration_min", "is_active", "request_only",
    ]:
        if hasattr(payload, field):
            val = getattr(payload, field)
            if val is not None:
                setattr(item, field, val)

    # Om någon skickar vehicle_class='all' (enumvärdet), spara NULL i DB
    try:
        if item.vehicle_class == models.VehicleClass.ALL:
            item.vehicle_class = None
    except Exception:
        # Om vehicle_class inte är enum här är det lugnt
        pass

    # Defensiv normalisering av prisfälten
    if item.price_type == models.ServicePriceType.FIXED:
        item.hourly_rate_ore = None
    elif item.price_type == models.ServicePriceType.HOURLY:
        item.fixed_price_ore = None

    # Preflight – tydliga fel innan DB
    if item.price_type == models.ServicePriceType.FIXED:
        if item.fixed_price_ore is None or item.hourly_rate_ore is not None:
            raise HTTPException(
                status_code=400,
                detail="price_type=fixed kräver fixed_price_ore och hourly_rate_ore måste vara NULL.",
            )
    elif item.price_type == models.ServicePriceType.HOURLY:
        if item.hourly_rate_ore is None or item.fixed_price_ore is not None:
            raise HTTPException(
                status_code=400,
                detail="price_type=hourly kräver hourly_rate_ore och fixed_price_ore måste vara NULL.",
            )

    # Felmappning som i create()
    from sqlalchemy.exc import IntegrityError
    def _pg_constraint_name(e: IntegrityError):
        try:
            return getattr(getattr(e.orig, "diag", None), "constraint_name", None)
        except Exception:
            return None

    def _pg_code(e: IntegrityError):
        return getattr(getattr(e, "orig", None), "pgcode", None)

    def _err_text(e: IntegrityError):
        try:
            return str(getattr(e, "orig", e))
        except Exception:
            return "okänt integritetsfel"

    try:
        print("[WSI update] about to commit:", {
            "id": item.id,
            "price_type": str(item.price_type),
            "fixed": item.fixed_price_ore,
            "hourly": item.hourly_rate_ore,
            "vehicle_class": str(item.vehicle_class) if item.vehicle_class else None,
        })
        db.commit()
    except IntegrityError as e:
        db.rollback()
        c = _pg_constraint_name(e)
        code = _pg_code(e)
        raw = _err_text(e)
        print(f"[WSI update] IntegrityError pgcode={code} constraint={c} raw={raw}")

        if c == "uq_service_item_workshop_name" or code == "23505":
            raise HTTPException(status_code=409, detail="Det finns redan en tjänst med samma namn i denna verkstad.")
        if c == "ck_service_item_price_consistency" or code == "23514":
            raise HTTPException(status_code=400, detail="Ogiltig kombination av prisfält för valt price_type.")
        if c == "ck_vat_range":
            raise HTTPException(status_code=400, detail="Moms (vat_percent) måste vara mellan 0 och 100.")
        if c == "vehicleclass_serviceitem" or ("vehicleclass_serviceitem" in raw):
            raise HTTPException(
                status_code=400,
                detail="Ogiltig vehicle_class för posten. Lämna tom/null om tjänsten ska gälla alla fordon.",
            )

        raise HTTPException(status_code=400, detail=f"Kunde inte spara posten (integritetsfel): {raw}")

    db.refresh(item)
    return item



# ----------------------------
# Uppdatera
# ----------------------------

@router.put("/{item_id}", response_model=schemas.WorkshopServiceItemRead, response_model_exclude_unset=True)
def update_service_item(
    item_id: int,
    payload: schemas.WorkshopServiceItemUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = db.query(models.WorkshopServiceItem).filter(models.WorkshopServiceItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tjänst hittades inte.")

    _assert_workshop_access(db, current_user, item.workshop_id)

    # Om namn ändras, säkra unikt per verkstad
    if payload.name and payload.name != item.name:
        _ensure_unique_name(db, item.workshop_id, payload.name, exclude_id=item.id)

    # Uppdatera fält om de är satta i payload
    for field in [
        "name", "description", "vehicle_class", "price_type",
        "hourly_rate_ore", "fixed_price_ore", "vat_percent",
        "default_duration_min", "is_active", "request_only",
    ]:
        val = getattr(payload, field, None)
        if val is not None:
            setattr(item, field, val)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ogiltig kombination av prisfält för valt price_type."
        )

    db.refresh(item)
    return item


# ----------------------------
# Toggle active
# ----------------------------

@router.post("/{item_id}/toggle-active", response_model=schemas.WorkshopServiceItemRead)
def toggle_service_item_active(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = db.query(models.WorkshopServiceItem).filter(models.WorkshopServiceItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tjänst hittades inte.")

    _assert_workshop_access(db, current_user, item.workshop_id)

    item.is_active = not bool(item.is_active)
    db.commit()
    db.refresh(item)
    return item


# ----------------------------
# Radera
# ----------------------------

@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_service_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = db.query(models.WorkshopServiceItem).filter(models.WorkshopServiceItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tjänst hittades inte.")

    _assert_workshop_access(db, current_user, item.workshop_id)

    # FK på ServiceTask.catalog_item_id har ON DELETE SET NULL → historik bevaras
    db.delete(item)
    db.commit()
    return None


@router.get("/public/workshop/{workshop_id}", response_model=List[schemas.WorkshopServiceItemRead])
def list_service_items_for_workshop_public(
    workshop_id: int,
    db: Session = Depends(get_db),
    q: Optional[str] = Query(None, description="Fritextsök i namn (ilike)"),
    active: Optional[bool] = Query(None, description="Filtrera på is_active"),
    vehicle_class: Optional[models.VehicleClass] = Query(None, description="Filtrera på fordonsklass"),
):
    # INGEN auth här

    query = db.query(models.WorkshopServiceItem).filter(
        models.WorkshopServiceItem.workshop_id == workshop_id
    )

    if q:
        query = query.filter(models.WorkshopServiceItem.name.ilike(f"%{q}%"))

    # För publik vy kan du (om du vill) tvinga is_active=true:
    # query = query.filter(models.WorkshopServiceItem.is_active.is_(True))
    # …eller låt ?active= styra som nu:
    if active is not None:
        query = query.filter(models.WorkshopServiceItem.is_active == active)

    # NULL i DB = “gäller alla fordon”, inkludera dessa när man filtrerar
    if vehicle_class is not None:
        query = query.filter(
            or_(
                models.WorkshopServiceItem.vehicle_class == vehicle_class,
                models.WorkshopServiceItem.vehicle_class.is_(None),
            )
        )

    return query.order_by(models.WorkshopServiceItem.name.asc()).all()
