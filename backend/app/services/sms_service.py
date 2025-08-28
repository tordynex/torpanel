from typing import Optional, Dict, Any
from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException
import logging

from app.config import settings

logger = logging.getLogger("sms")

class SmsService:
    def __init__(self, client: Optional[Client] = None):
        """
        Initiera Twilio-klienten.
        Prioritera API Key/Secret om de finns (SK... + secret), annars fallback till Account SID + Auth Token.
        """
        if settings.TWILIO_API_KEY_SID and settings.twilio_api_secret_plain:
            self.client = client or Client(
                settings.TWILIO_API_KEY_SID,
                settings.twilio_api_secret_plain,
                settings.TWILIO_ACCOUNT_SID
            )
            logger.info("[SmsService] Using API Key auth (SK...) for account %s", settings.TWILIO_ACCOUNT_SID[:8] + "…")
        else:
            self.client = client or Client(
                settings.TWILIO_ACCOUNT_SID,
                settings.twilio_auth_token_plain
            )
            logger.info("[SmsService] Using Auth Token for account %s", settings.TWILIO_ACCOUNT_SID[:8] + "…")

        # Sänd via Messaging Service om angiven, annars rått från-nummer
        self.messaging_service_sid = (settings.TWILIO_MESSAGING_SERVICE_SID or "").strip() or None
        self.sender = settings.TWILIO_FROM_NUMBER
        self.default_status_callback_url = (settings.TWILIO_STATUS_CALLBACK_URL or "").strip() or None

    def send_ready_message(
            self,
            to_e164: str,
            regnr: str,
            customer_name: Optional[str] = None,
            workshop_name: Optional[str] = None,
            workshop_phone: Optional[str] = None,
            workshop_opening_hours: Optional[str] = None,
            pickup_info: Optional[str] = None,
            link: Optional[str] = None,
            metadata: Optional[Dict[str, Any]] = None,
            status_callback_url: Optional[str] = None,
    ) -> str:
        text = self._render_ready_template(
            regnr=regnr,
            customer_name=customer_name,
            workshop_name=workshop_name,
            workshop_phone=workshop_phone,
            workshop_opening_hours=workshop_opening_hours,
            pickup_info=pickup_info,
            link=link,
        )

        # Bygg kwargs till Twilio
        kwargs: Dict[str, Any] = {}
        cb_url = status_callback_url or self.default_status_callback_url
        if cb_url:
            kwargs["status_callback"] = cb_url

        try:
            logger.info(
                "[SmsService] Försöker skicka SMS till=%s via=%s text=%r kwargs=%s",
                to_e164, self.messaging_service_sid or self.sender, text, kwargs
            )

            if self.messaging_service_sid:
                msg = self.client.messages.create(
                    body=text,
                    to=to_e164,
                    messaging_service_sid=self.messaging_service_sid,
                    **kwargs,
                )
            else:
                msg = self.client.messages.create(
                    body=text,
                    from_=self.sender,
                    to=to_e164,
                    **kwargs,
                )

            logger.info(
                "[SmsService] SMS skickat! sid=%s status=%s to=%s",
                getattr(msg, "sid", None), getattr(msg, "status", None), to_e164
            )
            return msg.sid

        except TwilioRestException as e:
            logger.error(
                "[SmsService] Twilio error status=%s code=%s msg=%s more=%s to=%s via=%s",
                getattr(e, "status", None),
                getattr(e, "code", None),
                getattr(e, "msg", None),
                getattr(e, "more_info", None),
                to_e164,
                self.messaging_service_sid or self.sender,
            )
            raise

    @staticmethod
    def _render_ready_template(
            regnr: str,
            customer_name: Optional[str],
            workshop_name: Optional[str],
            workshop_phone: Optional[str],
            workshop_opening_hours: Optional[str],
            pickup_info: Optional[str],
            link: Optional[str],
    ) -> str:
        name_part = f"Hej {customer_name}," if customer_name else "Hej,"
        ws_part = workshop_name or "verkstaden"

        lines = [
            f"{name_part} din bil {regnr} är nu klar hos {ws_part}.",
        ]

        if pickup_info:
            lines.append(pickup_info)

        contact_bits = []
        if workshop_phone:
            contact_bits.append(f"Tel: {workshop_phone}")
        if workshop_opening_hours:
            contact_bits.append(f"Öppet: {workshop_opening_hours}")
        if contact_bits:
            lines.append(" | ".join(contact_bits))

        if link:
            lines.append(f"Boka utlämning här: {link}")

        lines.append("Detta är ett automatiskt meddelande – svara ej.")
        lines.append("Skicka STOP för att avregistrera.")

        # Extra luft mellan blocken
        return "\n\n".join(lines)
