# app/config.py
from typing import Optional
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import SecretStr, field_validator
import logging

logger = logging.getLogger("sms")

# Försök hitta .env relativt projektet: app/ -> backend/ -> .env
ENV_FILE = (Path(__file__).resolve().parent.parent / ".env")

def _mask(s: Optional[str], keep: int = 6) -> str:
    if not s:
        return "(empty)"
    if len(s) <= keep:
        return "*" * len(s)
    return s[:keep] + "…" + s[-keep:]


class Settings(BaseSettings):
    # DB
    DATABASE_URL: str

    # SMTP
    SMTP_HOST: str
    SMTP_PORT: int = 587
    SMTP_USER: str
    SMTP_PASS: str
    SMTP_FROM: str

    # Auth / tokens
    SECRET_KEY: str
    RESET_TOKEN_MAX_AGE: int = 3600
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    RESET_URL_BASE: str

    # Twilio
    TWILIO_ACCOUNT_SID: str
    TWILIO_AUTH_TOKEN: Optional[SecretStr] = None
    TWILIO_API_KEY_SID: Optional[str] = None
    TWILIO_API_KEY_SECRET: Optional[SecretStr] = None
    TWILIO_FROM_NUMBER: str
    TWILIO_MESSAGING_SERVICE_SID: Optional[str] = None
    TWILIO_STATUS_CALLBACK_URL: Optional[str] = None

    APP_ENV: str = "dev"

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # --- Validators som TRIMMAR whitespace och kollar format ---
    @field_validator("TWILIO_ACCOUNT_SID", mode="before")
    @classmethod
    def _trim_ac(cls, v: str) -> str:
        v = (v or "").strip()
        if not v.startswith("AC"):
            raise ValueError("TWILIO_ACCOUNT_SID måste börja med AC… från samma Twilio-konto som numret/MG.")
        return v

    @field_validator("TWILIO_MESSAGING_SERVICE_SID", mode="before")
    @classmethod
    def _trim_mg(cls, v: Optional[str]) -> Optional[str]:
        v = (v or "").strip()
        return v or None

    @field_validator("TWILIO_FROM_NUMBER", mode="before")
    @classmethod
    def _trim_from(cls, v: str) -> str:
        v = (v or "").strip()
        if not v.startswith("+"):
            raise ValueError("TWILIO_FROM_NUMBER måste vara E.164, t.ex. +4670xxxxxxx")
        return v

    # Hjälp-props
    @property
    def secret_key_plain(self) -> str:
        return self.SECRET_KEY.get_secret_value()

    @property
    def twilio_auth_token_plain(self) -> Optional[str]:
        return self.TWILIO_AUTH_TOKEN.get_secret_value() if self.TWILIO_AUTH_TOKEN else None

    @property
    def twilio_api_secret_plain(self) -> Optional[str]:
        return self.TWILIO_API_KEY_SECRET.get_secret_value() if self.TWILIO_API_KEY_SECRET else None


settings = Settings()

logger.info(
    "[TWILIO CONFIG] SID=%s FROM=%s MSG_SID=%s API_KEY=%s",
    _mask(settings.TWILIO_ACCOUNT_SID, keep=6),
    settings.TWILIO_FROM_NUMBER,
    _mask(settings.TWILIO_MESSAGING_SERVICE_SID, keep=6),
    _mask(settings.TWILIO_API_KEY_SID, keep=6),
)
