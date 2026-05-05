from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(default="postgresql+psycopg://fleet:fleet@localhost:5432/fleet")
    jwt_secret: str = Field(default="change-me")
    jwt_algorithm: str = "HS256"
    access_token_ttl_min: int = 15
    refresh_token_ttl_days: int = 7
    cors_origins: str = "http://localhost:3000"


settings = Settings()
