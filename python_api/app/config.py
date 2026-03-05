import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    project_name: str = "Divorce-Ledger-AI core_api"
    version: str = "0.1.0"
    api_v1_str: str = "/api"
    
    # Database
    database_url: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/postgres")
    
    # Environment Settings
    environment: str = os.getenv("NODE_ENV", "development")
    debug: bool = environment != "production"

    model_config = SettingsConfigDict(case_sensitive=False, env_file=".env", extra="ignore")

settings = Settings()
