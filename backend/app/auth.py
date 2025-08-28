from datetime import datetime, timedelta, timezone
from jose import JWTError, jwt, ExpiredSignatureError
from passlib.context import CryptContext
from typing import Optional
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app import models
from .config import settings

ALGORITHM = "HS256"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


# Viktigt: auto_error=False så vi kan falla tillbaka till cookie
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/users/login", auto_error=False)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])


def _auth_error(detail: str = "Kunde inte verifiera användare") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    bearer_token: Optional[str] = Depends(oauth2_scheme),
) -> models.User:
    # 1) Försök med Bearer-header (OAuth2)
    token = bearer_token

    # 2) Fallback: HttpOnly cookie
    if not token:
        token = request.cookies.get("access_token")

    if not token:
        # debug vid behov:
        # print("Auth header:", request.headers.get("authorization"))
        # print("Cookie access_token:", request.cookies.get("access_token"))
        raise _auth_error("Not authenticated")

    try:
        payload = decode_token(token)
        sub = payload.get("sub")
        if sub is None:
            raise _auth_error("Invalid token payload")
        user_id = int(sub)
    except ExpiredSignatureError:
        raise _auth_error("Token expired")
    except (JWTError, ValueError):
        raise _auth_error("Invalid token")

    user = db.get(models.User, user_id)
    if not user:
        raise _auth_error("User not found")

    return user
