from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_prefix="REPLOG_",
        extra="ignore",
    )

    environment: Literal["development", "test", "production"] = "development"
    app_name: str = "REPLOG"

    database_url: str = "sqlite:///./replog.db"

    secret_key: str = Field(min_length=32)

    frontend_url: str = "http://localhost:5173"
    cors_origins: str = "http://localhost:5173"

    session_cookie_name: str = "replog_session"
    csrf_cookie_name: str = "replog_csrf"
    session_idle_days: int = 7
    session_absolute_days: int = 30
    cookie_secure: bool = False

    verify_email_hours: int = 24
    reset_password_minutes: int = 30

    login_max_failures_per_email: int = 5
    login_max_failures_per_ip: int = 20
    login_window_minutes: int = 15
    rate_limit_per_minute: int = 120

    email_backend: Literal["smtp", "console", "memory"] = "smtp"
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_starttls: bool = False
    smtp_ssl: bool = False
    email_from: str = "REPLOG <nao-responda@replog.local>"

    log_level: str = "INFO"
    log_json: bool = False

    @property
    def session_cookie(self) -> str:
        return (
            f"__Host-{self.session_cookie_name}" if self.cookie_secure else self.session_cookie_name
        )

    @property
    def csrf_cookie(self) -> str:
        return f"__Host-{self.csrf_cookie_name}" if self.cookie_secure else self.csrf_cookie_name

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @model_validator(mode="after")
    def validate_production(self) -> "Settings":
        if self.environment == "production":
            problems: list[str] = []
            if self.secret_key.startswith("dev-") or len(self.secret_key) < 32:
                problems.append("REPLOG_SECRET_KEY deve ter pelo menos 32 caracteres aleatórios")
            if not self.cookie_secure:
                problems.append("REPLOG_COOKIE_SECURE deve ser true em produção")
            if self.email_backend != "smtp":
                problems.append("REPLOG_EMAIL_BACKEND deve ser smtp em produção")
            if "*" in self.cors_origins:
                problems.append("REPLOG_CORS_ORIGINS não pode conter '*'")
            if problems:
                raise ValueError("Configuração insegura para produção: " + "; ".join(problems))
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
