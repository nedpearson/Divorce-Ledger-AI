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

    # Appwrite Integration
    appwrite_endpoint: str = os.getenv("APPWRITE_ENDPOINT", "")
    appwrite_project_id: str = os.getenv("APPWRITE_PROJECT_ID", "")
    appwrite_api_key: str = os.getenv("APPWRITE_API_KEY", "")

    model_config = SettingsConfigDict(case_sensitive=False, env_file=".env", extra="ignore")

settings = Settings()
