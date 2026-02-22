# settings.py
import os
from typing import Dict, List, Optional
from pydantic_settings import BaseSettings
from pydantic import Field, validator
import logging

logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    # Server
    GENERATE_PORT: int
    HOST: str = "0.0.0.0"
    
    # Database
    POSTGRES_USER: str
    POSTGRES_PASSWORD: str
    POSTGRES_DB: str
    POSTGRES_HOST: str
    POSTGRES_PORT: int = 5432
    DATABASE_POOL_SIZE: int = 20
    DATABASE_MAX_OVERFLOW: int = 10
    DATABASE_ECHO: bool = False
    
    # AWS S3
    S3_BUCKET: str
    S3_REGION: str
    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str
    S3_MAX_CONNECTIONS: int = 50
    
    # Security
    SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    
    # Audio Generation
    AUDIO_SAMPLE_RATE: int = 48000
    AUDIO_VOLUME: float = 3.0
    AUDIO_TEMP_DIR: str = "./data"
        
    # Sample paths
    SAMPLE_PATHS: Dict[str, str] = {
        "D": "./sounds/doums",
        "OTA": "./sounds/taks",
        "OTI": "./sounds/tiks",
        "PA2": "./sounds/pa2s",
        "S": "./sounds/silence",
    }
    
    # Sample cache settings
    SAMPLE_CACHE_TTL_SECONDS: int = 3600  # 1 hour
    
    # Thread pool
    MAX_WORKER_THREADS: int = 4  # For CPU-bound generation
    
    @validator("AUDIO_TEMP_DIR")
    def validate_temp_dir(cls, v):
        os.makedirs(v, exist_ok=True)
        return v
    
    class Config:
        env_file="../.env"
        case_sensitive=True
        extra="allow"

# Global settings instance
settings = Settings()