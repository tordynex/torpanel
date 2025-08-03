from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app import models, schemas
from app.database import get_db
from typing import List
from app.auth import verify_password, create_access_token, get_current_user
from passlib.context import CryptContext


router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str):
    return pwd_context.hash(password)


# ----------------------------------
#  Skapa användare / Create user
# ----------------------------------
@router.post("/create", response_model=schemas.UserRead)
def create_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
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