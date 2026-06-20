import os
from pathlib import Path
from typing import Dict
from pydantic_settings import BaseSettings
from pydantic import Field, validator
import logging

logger = logging.getLogger(__name__)

# project root = percussion-engine/
BASE_DIR = Path(__file__).resolve().parent.parent.parent


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

    # AWS
    S3_BUCKET: str
    S3_REGION: str
    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str
    S3_MAX_CONNECTIONS: int = 50

    # Security
    SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"

    # Audio
    AUDIO_SAMPLE_RATE: int = 48000
    AUDIO_VOLUME: float = 3.0

    AUDIO_TEMP_DIR: Path = BASE_DIR / "data"
    AUDIO_MEMMAP_DIR: Path = BASE_DIR / "tmp"


    SAMPLE_PATHS: Dict[str, Path] = {
        "D": BASE_DIR / "sounds" / "doums",
        "OTA": BASE_DIR / "sounds" / "taks",
        "OTI": BASE_DIR / "sounds" / "tiks",
        "PA2": BASE_DIR / "sounds" / "pa2s",
        "S": BASE_DIR / "sounds" / "silence",
    }


    SAMPLE_CACHE_TTL_SECONDS: int = 3600

    MAX_WORKER_THREADS: int = 4


    @validator("AUDIO_TEMP_DIR")
    def validate_temp_dir(cls, v):
        v.mkdir(parents=True, exist_ok=True)
        return v


    @validator("AUDIO_MEMMAP_DIR")
    def validate_memmap_dir(cls, v):
        v.mkdir(parents=True, exist_ok=True)
        return v


    class Config:
        env_file = BASE_DIR.parent / ".env"
        case_sensitive = True
        extra = "allow"



settings = Settings()