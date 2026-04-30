"""
Application configuration settings
Loaded from environment variables
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional, List
from pydantic import field_validator


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables
    """

    # Application
    APP_NAME: str = "Life Tracker API"
    VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str

    # Security
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Password Requirements
    MIN_PASSWORD_LENGTH: int = 8
    REQUIRE_UPPERCASE: bool = True
    REQUIRE_LOWERCASE: bool = True
    REQUIRE_DIGIT: bool = True
    REQUIRE_SPECIAL_CHAR: bool = False

    # CORS - Now properly handles string or list
    ALLOWED_ORIGINS: str = "*"

    # Email (for future use)
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: Optional[int] = None
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None

    # Google OAuth
    GOOGLE_CLIENT_ID: str
    GOOGLE_CLIENT_SECRET: str

    # Groq AI
    GROQ_API_KEY: Optional[str] = None

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/9"

    # Telegram Bot
    TELEGRAM_BOT_TOKEN: Optional[str] = None
    TELEGRAM_CHAT_ID: Optional[str] = None        # Fallback global chat ID (your personal chat)
    TELEGRAM_BOT_USERNAME: str = "life_tracker_off_bot"
    TELEGRAM_WEBHOOK_SECRET: Optional[str] = None # Secret token for verifying Telegram webhook requests

    # Optional outbound proxy for reaching api.telegram.org from filtered networks.
    # Examples: socks5://127.0.0.1:40000, http://user:pass@1.2.3.4:8080
    TELEGRAM_PROXY_URL: Optional[str] = None

    # Webhook URL (e.g. https://yourdomain.com). Leave empty to use polling instead.
    WEBHOOK_BASE_URL: Optional[str] = None

    # Notification schedule (hour in UTC)
    NOTIFY_MORNING_HOUR_UTC: int = 3   # 08:00 Tashkent (UTC+5)
    NOTIFY_EVENING_HOUR_UTC: int = 16  # 21:00 Tashkent (UTC+5)

    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"
    BACKEND_URL: str = "http://localhost:8000"

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore"  # Ignore extra fields in .env
    )

    def get_cors_origins(self) -> List[str]:
        """
        Parse ALLOWED_ORIGINS into a list
        Handles both "*" and comma-separated values
        """
        if self.ALLOWED_ORIGINS == "*":
            return ["*"]
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",") if origin.strip()]


# Create settings instance
settings = Settings()
