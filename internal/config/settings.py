from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://collab:collab@localhost:5432/collab"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "dev-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 120
    snapshot_every_n_operations: int = 50
    log_level: str = "INFO"
    enable_kafka: bool = False
    kafka_bootstrap_servers: str = "localhost:9092"
    api_rate_limit_per_minute: int = 120
    socket_rate_limit_per_second: int = 25

