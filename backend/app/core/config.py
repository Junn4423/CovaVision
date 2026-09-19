import logging
import warnings
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

_INSECURE_JWT_SECRETS = frozenset({
    "change-me-in-development",
    "change-me",
    "secret",
    "jwt-secret",
    "development",
    "",
})

logger = logging.getLogger("covavision.config")


class Settings(BaseSettings):
    app_name: str = "CovaVision API"
    app_env: str = "development"
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    database_url: str = "mysql://covavision:change-me@127.0.0.1:3306/covavision"
    jwt_secret: str = "change-me-in-development"
    access_token_expire_seconds: int = 8 * 60 * 60
    # Electron production loads the renderer from file://, whose CORS origin is `null`.
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173,null"
    bootstrap_organization_code: str = "DEFAULT"
    bootstrap_organization_name: str = "CovaVision"
    face_match_threshold: float = 0.60
    face_detection_threshold: float = 0.35
    face_detection_width: int = 640
    face_detection_height: int = 640
    # SEC-07: Minimum password length enforced on account creation/reset.
    password_min_length: int = 6
    # SEC-02: Maximum login attempts per IP within the sliding window.
    login_rate_limit_max: int = 10
    login_rate_limit_window_seconds: int = 300
    # SEC-08: Maximum allowed image upload size in bytes (default 10 MB).
    max_image_upload_bytes: int = 10 * 1024 * 1024
    # SaaS onboarding and billing. Secrets stay server-side; clients only see
    # the public QR URL and order status.
    trial_duration_days: int = 14
    sepay_bank_account: str = ""
    sepay_bank_code: str = ""
    sepay_webhook_api_key: str = ""
    sepay_order_prefix: str = "CV"
    payment_order_ttl_minutes: int = 15
    google_client_id: str = ""
    google_allowed_hosted_domain: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


def _validate_settings(s: Settings) -> Settings:
    """Validate critical settings at startup."""
    is_production = s.app_env.lower() in {"production", "prod", "staging"}
    if s.jwt_secret.strip().lower() in _INSECURE_JWT_SECRETS:
        if is_production:
            raise RuntimeError(
                "CRITICAL: JWT_SECRET is set to an insecure default. "
                "Refusing to start in production mode. "
                "Set JWT_SECRET to a strong random value (e.g. openssl rand -hex 32)."
            )
        warnings.warn(
            "JWT_SECRET is using an insecure default value. "
            "Set JWT_SECRET to a strong random value before deploying.",
            UserWarning,
            stacklevel=3,
        )
        logger.warning(
            "⚠️  JWT_SECRET uses an insecure default. "
            "Generate a strong secret: python -c \"import secrets; print(secrets.token_hex(32))\""
        )
    if len(s.jwt_secret) < 16:
        logger.warning("⚠️  JWT_SECRET is very short (%d chars). Use at least 32 characters.", len(s.jwt_secret))
    return s


@lru_cache
def get_settings() -> Settings:
    return _validate_settings(Settings())


settings = get_settings()
