import os
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired, serializer

from app import models, schemas
from app.database import get_db
from app.auth import verify_password, create_access_token, get_current_user
from passlib.context import CryptContext
from app.services.email_service import send_welcome_email, send_password_reset_email


router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str):
    return pwd_context.hash(password)

SECRET_KEY = os.getenv("SECRET_KEY", "change-me")
RESET_SALT = "password-reset"
RESET_TOKEN_MAX_AGE = int(os.getenv("RESET_TOKEN_MAX_AGE", "3600"))
RESET_URL_BASE = os.getenv("RESET_URL_BASE", "http://localhost:5173/reset-password")

ts = URLSafeTimedSerializer(SECRET_KEY)

def make_reset_token(user_id: int) -> str:
    return ts.dumps({"uid": user_id}, salt=RESET_SALT)

def verify_reset_token(token: str) -> int:
    data = ts.loads(token, salt=RESET_SALT, max_age=RESET_TOKEN_MAX_AGE)
    return int(data["uid"])

# ----------------------------------
#  Skapa användare / Create user
# ----------------------------------
@router.post("/create", response_model=schemas.UserRead)
def create_user(background_tasks: BackgroundTasks, user: schemas.UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_pw = hash_password(user.password)

    new_user = models.User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_pw,
        role=user.role
    )

    if user.workshop_ids:
        workshops = db.query(models.Workshop).filter(models.Workshop.id.in_(user.workshop_ids)).all()
        new_user.workshops = workshops

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

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

    token_data = {
        "sub": str(user.id),
        "role": user.role.value,
        "username": user.username
    }

    access_token = create_access_token(data=token_data)

    return {"access_token": access_token, "token_type": "bearer"}

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