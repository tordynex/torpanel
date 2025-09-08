# app/routers/upsell.py
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
import secrets
import logging
import os

from app import models, schemas
from app.database import get_db
from app.auth import get_current_user
from app.services.sms_service import SmsService

logger = logging.getLogger("upsell")

router = APIRouter()

FRONTEND_PUBLIC_URL = os.getenv("FRONTEND_PUBLIC_URL")


# ====== HJÄLPMETODER ======

def now_utc() -> datetime:
    return datetime.now(timezone.utc)

def as_aware_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(timezone.utc)

def _urls_for_offer(offer: models.UpsellOffer) -> tuple[str, str]:
    base = FRONTEND_PUBLIC_URL.rstrip("/") + "/u"
    approve_url = f"{base}/{offer.approval_token}/approve"
    decline_url = f"{base}/{offer.approval_token}/decline"
    return approve_url, decline_url

def _render_sms_text(offer: models.UpsellOffer, approve_url: str, decline_url: str) -> str:
    customer = offer.customer
    car = offer.car
    ws = offer.workshop

    name_part = f"Hej {customer.first_name}," if customer and customer.first_name else "Hej,"
    reg = car.registration_number if car else ""
    ws_name = ws.name if ws else "verkstaden"

    price = f"{(offer.price_gross_ore or 0) / 100:.0f} kr"
    body = (
        f"{name_part} {ws_name} rekommenderar: {offer.title} på {reg}.\n\n"
        f"Pris: {price} inkl. moms.\n\n"
        f"Godkänn här: {approve_url}\n"
        f"Avböj här: {decline_url}\n\n"
        f"Svara STOP för att sluta få sms."
    )
    return body.strip()

def _generate_token() -> str:
    return secrets.token_urlsafe(24)

# ====== ENDPOINTS ======

@router.get("/{offer_id}/links")
def get_upsell_links(
    offer_id: int,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    offer = db.get(models.UpsellOffer, offer_id)
    if not offer:
        raise HTTPException(404, "Upsell ej hittad")

    approve_url, decline_url = _urls_for_offer(offer)
    # OBS! Ingen schema-modell: returnerar enkel dict
    return {"approve_url": approve_url, "decline_url": decline_url}

@router.post("/draft", response_model=schemas.UpsellRead)
def create_draft(
    payload: schemas.UpsellCreate,  # ska innehålla: booking_id, title, recommendation, price_gross_sek, vat_percent, expires_hours
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    # 1) Hämta bokningen (obligatorisk)
    booking = db.get(models.BayBooking, payload.booking_id)
    if not booking:
        raise HTTPException(status_code=404, detail="Booking ej hittad")

    # 2) Härled kontext från bokningen
    workshop_id = booking.workshop_id
    customer_id = booking.customer_id
    car_id = booking.car_id

    # Fallback: om bokningen saknar explicit customer men bilen har primary_owner, använd den
    if not customer_id and booking.car:
        primary_owner = booking.car.primary_owner
        if primary_owner and primary_owner.workshop_id == workshop_id:
            customer_id = primary_owner.id

    # 3) Skapa utkast
    token = _generate_token()
    expires_at = now_utc() + timedelta(hours=payload.expires_hours) if payload.expires_hours else None

    offer = models.UpsellOffer(
        workshop_id=workshop_id,
        booking_id=booking.id,
        service_log_id=getattr(booking, "service_log_id", None),

        customer_id=customer_id,
        car_id=car_id,

        title=payload.title,
        recommendation=payload.recommendation,
        price_gross_ore=int(round(payload.price_gross_sek * 100)),
        vat_percent=payload.vat_percent,
        currency="SEK",

        approval_token=token,
        status=models.UpsellStatus.DRAFT,
        expires_at=expires_at,
        created_by_user_id=user.id,

        # använd override om användaren skrivit egen text, annars tom (genereras vid send)
        sms_body=(payload.sms_override or "").strip(),
    )

    db.add(offer)
    db.commit()
    db.refresh(offer)
    return offer


@router.post("/{offer_id}/send", response_model=schemas.UpsellRead)
def send_offer(
    offer_id: int,
    sms_override: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    offer = db.get(models.UpsellOffer, offer_id)
    if not offer:
        raise HTTPException(404, "Upsell ej hittad")
    if offer.status != models.UpsellStatus.DRAFT:
        raise HTTPException(400, "Kan endast skicka utkast")

    customer = offer.customer
    if not customer or not customer.phone:
        raise HTTPException(400, "Kund saknar telefonnummer")

    approve_url, decline_url = _urls_for_offer(offer)

    body = (sms_override or offer.sms_body or "").strip()
    if not body:
        body = _render_sms_text(offer, approve_url, decline_url)
    offer.sms_body = body

    body = (offer.sms_body or "").strip()
    if not body:
        body = _render_sms_text(offer, approve_url, decline_url)
    offer.sms_body = body

    # Skicka SMS
    sms_service = SmsService()
    try:
        sid = sms_service.client.messages.create(
            body=body,
            from_=sms_service.sender,
            to=customer.phone,
        ).sid
    except Exception as e:
        logger.error("Fel vid SMS-sändning: %s", e)
        raise HTTPException(500, "Misslyckades att skicka SMS")

    sms = models.SmsMessage(
        workshop_id=offer.workshop_id,
        to_phone=customer.phone,
        body=body,
        provider="twilio",
        provider_message_id=sid,
        status=models.SmsStatus.SENT,
        upsell_offer_id=offer.id,
    )
    db.add(sms)

    offer.last_sms_id = sms.id
    offer.sent_at = now_utc()
    offer.status = models.UpsellStatus.PENDING

    db.commit()
    db.refresh(offer)
    return offer


@router.post("/u/{token}/approve")
def approve_offer(token: str, db: Session = Depends(get_db)):
    offer = db.query(models.UpsellOffer).filter_by(approval_token=token).first()
    if not offer:
        raise HTTPException(404, "Ogiltig länk")

    if offer.status != models.UpsellStatus.PENDING:
        # returnera nuvarande status (accepted/declined/expired/cancelled/draft)
        return {"status": offer.status.value}

    expires = offer.expires_at  # borde redan vara aware från DB
    if expires and now_utc() > expires:
        offer.status = models.UpsellStatus.EXPIRED
        db.commit()
        return {"status": "expired"}

    # Om det finns en service_log kopplad via bokningen/offer -> skapa ServiceTask
    service_log_id = getattr(offer, "service_log_id", None)
    if service_log_id:
        task = models.ServiceTask(
            title=offer.title,
            comment=f"Godkänd via SMS: {offer.recommendation or ''}",
            service_log_id=service_log_id,
            line_total_ore=offer.price_gross_ore,
        )
        db.add(task)
    # Annars: ingen servicelog ännu — vi markerar bara som accepterad.
    # (Du kan senare ha en process som vid skapande av servicelog plockar upp ACCEPTED-upsells och skapar tasks då.)

    offer.status = models.UpsellStatus.ACCEPTED
    offer.responded_at = now_utc()

    db.commit()
    return {"status": "accepted"}


@router.post("/u/{token}/decline")
def decline_offer(token: str, db: Session = Depends(get_db)):
    offer = db.query(models.UpsellOffer).filter_by(approval_token=token).first()
    if not offer:
        raise HTTPException(404, "Ogiltig länk")

    if offer.status != models.UpsellStatus.PENDING:
        return {"status": offer.status.value}

    offer.status = models.UpsellStatus.DECLINED
    offer.responded_at = now_utc()

    db.commit()
    return {"status": "declined"}
