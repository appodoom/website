from typing import Optional
import os
from sqlalchemy import String, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncAttrs, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


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

    # s3 url
    url: Mapped[str] = mapped_column(String, nullable=False)

    # JSONB column for storing settings
    settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=lambda: {})


postgres_user = os.getenv("POSTGRES_USER")
postgres_password = os.getenv("POSTGRES_PASSWORD")
postgres_db_name = os.getenv("POSTGRES_DB")
postgres_host = os.getenv("POSTGRES_HOST")

DATABASE_URL = f"postgresql+asyncpg://{postgres_user}:{postgres_password}@{postgres_host}:5432/{postgres_db_name}"

engine = create_async_engine(DATABASE_URL, echo=True)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)
async def init_models():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)