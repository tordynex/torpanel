from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, EmailStr, Field
from typing import Optional

from app.services.email_service import send_improvement_suggestion_email

router = APIRouter()

class ImprovementSuggestionIn(BaseModel):
    message: str = Field(..., min_length=10, max_length=4000, description="Själva förslaget/feedbacken")
    sender_email: Optional[EmailStr] = Field(None, description="Avsändarens e-post (valfritt)")
    sender_name: Optional[str] = Field(None, max_length=120, description="Avsändarens namn (valfritt)")
    page: Optional[str] = Field(None, max_length=300, description="Vilken sida/sektion förslaget gäller (valfritt)")
    app_version: Optional[str] = Field(None, max_length=50, description="App-version/build (valfritt)")

class ImprovementSuggestionOut(BaseModel):
    ok: bool
    received: bool

@router.post("/suggest", response_model=ImprovementSuggestionOut, status_code=201)
async def suggest_change(payload: ImprovementSuggestionIn, background_tasks: BackgroundTasks):
    """
    Tar emot ett förbättringsförslag och skickar e-post till dev@autonexum.se.
    Kör mejlskicket i bakgrunden för snabb respons till klienten.
    """
    # Liten sanity check även om Pydantic validerar
    if not payload.message or len(payload.message.strip()) < 10:
        raise HTTPException(status_code=400, detail="Meddelandet är för kort.")

    # Skicka mejlet i bakgrunden (async task)
    background_tasks.add_task(
        send_improvement_suggestion_email,
        payload.sender_email,
        payload.sender_name,
        payload.message,
        payload.page,
        payload.app_version,
    )

    return ImprovementSuggestionOut(ok=True, received=True)
