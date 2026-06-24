from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(default="postgresql+psycopg://fleet:fleet@localhost:5432/fleet")
    jwt_secret: str = Field(default="change-me")
    jwt_algorithm: str = "HS256"
    access_token_ttl_min: int = 15
    refresh_token_ttl_days: int = 7
    cors_origins: str = "http://localhost:3000"
    admin_username: str = Field(default="admin")
    admin_password: str = Field(
        default="changeme",
        description="Use secrets.compare_digest at call site; set a strong value in production.",
    )
    cookie_secure: bool = Field(default=False)  # set True in production (requires HTTPS)

    # Demo violation flow
    uploads_dir: Path = Field(default=Path("./uploads"))
    device_tokens: str = Field(
        default="",
        description="Comma-separated device_id:token pairs, e.g. 'uuid1:tok1,uuid2:tok2'",
    )
    max_screenshot_bytes: int = 2 * 1024 * 1024  # 2 MB
    min_screenshot_width: int = 1280
    min_screenshot_height: int = 720
    screenshot_strict: bool = False  # True → reject low-res, False → log warning only
    bootstrap_secret: str = Field(
        default="",
        description="Shared secret for zero-touch Jetson registration. Empty = disabled.",
    )

    @model_validator(mode="after")
    def _check_secrets_in_prod(self) -> "Settings":
        if self.cookie_secure:
            weak = {"changeme", "change-me", "admin", "password", "secret"}
            if self.admin_password.lower() in weak:
                raise ValueError("admin_password must be changed for production (cookie_secure=True)")
            if self.jwt_secret.lower() in {"change-me", "changeme"}:
                raise ValueError("jwt_secret must be changed for production (cookie_secure=True)")
        return self

    def device_token_map(self) -> dict[str, str]:
        out: dict[str, str] = {}
        for pair in self.device_tokens.split(","):
            pair = pair.strip()
            if not pair or ":" not in pair:
                continue
            device_id, token = pair.split(":", 1)
            out[device_id.strip()] = token.strip()
        return out


settings = Settings()
