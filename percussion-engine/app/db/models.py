# models.py
from typing import Optional
import os
from sqlalchemy import String, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncAttrs, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from app.core.config import settings

# ---------------------------------------------------------------------
# Base setup
# ---------------------------------------------------------------------
class Base(AsyncAttrs, DeclarativeBase):
    pass


# ---------------------------------------------------------------------
# Minimal User stub (only what's needed for FK reference)
# ---------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)


# ---------------------------------------------------------------------
# Sound model
# ---------------------------------------------------------------------
class Sound(Base):
    __tablename__ = "sounds"

    # id is manually generated (no autoincrement)
    id: Mapped[str] = mapped_column(String, primary_key=True)

    # foreign key to users.id
    generated_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)

    # JSONB column for storing settings
    settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=lambda: {})
    
    # Tags (instead of s3 url)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=lambda: [])


DATABASE_URL = f"postgresql+asyncpg://{settings.POSTGRES_USER}:{settings.POSTGRES_PASSWORD}@{settings.POSTGRES_HOST}:5432/{settings.POSTGRES_DB}"

engine = create_async_engine(DATABASE_URL, echo=settings.DATABASE_ECHO)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def init_models():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
