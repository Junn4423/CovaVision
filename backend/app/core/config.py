from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "CovaVision API"
    app_env: str = "development"
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    database_url: str = "mysql://covavision:change-me@127.0.0.1:3306/covavision"
    jwt_secret: str = "change-me-in-development"
    access_token_expire_seconds: int = 8 * 60 * 60
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"
    bootstrap_organization_code: str = "DEFAULT"
    bootstrap_organization_name: str = "CovaVision"
    face_match_threshold: float = 0.60
    face_detection_threshold: float = 0.35
    face_detection_width: int = 640
    face_detection_height: int = 640

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
