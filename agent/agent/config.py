from pydantic_settings import BaseSettings, SettingsConfigDict


class AgentSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AGENT_", env_file=".env", extra="ignore")

    device_token: str = "dev-token"
    device_id: str = "00000000-0000-0000-0000-000000000001"
    backend_url: str = "http://localhost:8000"
    port: int = 9000


settings = AgentSettings()
