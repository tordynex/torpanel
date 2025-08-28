from fastapi import APIRouter, Request
import logging

router = APIRouter()
logger = logging.getLogger("sms")

@router.post("/twilio/status")
async def twilio_status(request: Request):
    # Twilio postar som application/x-www-form-urlencoded
    form = await request.form()
    # Nycklar du oftast vill se:
    message_sid = form.get("MessageSid")
    message_status = form.get("MessageStatus")  # queued, sent, delivered, undelivered, failed
    to_ = form.get("To")
    from_ = form.get("From")
    error_code = form.get("ErrorCode")  # t.ex. 21610, 21408 etc.

    logger.info(
        "[TwilioStatus] sid=%s status=%s to=%s from=%s error=%s",
        message_sid, message_status, to_, from_, error_code
    )
    # Svara 200 OK så Twilio blir nöjd
    return {"ok": True}
