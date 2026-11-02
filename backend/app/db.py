import asyncio
import logging
from uuid import uuid4
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
from app.config import DATABASE_URL, ON_VERCEL

logger = logging.getLogger("ephemera.db")

engine_kwargs: dict = {"echo": False}
if DATABASE_URL.startswith("postgresql+asyncpg"):
    # Supabase's connection pooler (PgBouncer, transaction mode) doesn't support
    # asyncpg's cached prepared statements, so disable the caches and use unique names.
    engine_kwargs["connect_args"] = {
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
    }
if ON_VERCEL:
    # Serverless functions are short-lived: let the pooler do the pooling.
    engine_kwargs["poolclass"] = NullPool

engine = create_async_engine(DATABASE_URL, **engine_kwargs)
AsyncSessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


async def init_db(max_retries: int = 15, delay_seconds: float = 2.0):
    """Initialize DB schema with retry logic for container/network startup race conditions."""
    for attempt in range(1, max_retries + 1):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            logger.info("Database initialized successfully.")
            return
        except Exception as e:
            if attempt == max_retries:
                logger.error(f"Failed to connect to database after {max_retries} attempts: {e}")
                raise
            logger.warning(
                f"Database connection attempt {attempt}/{max_retries} failed ({e}). Retrying in {delay_seconds}s..."
            )
            await asyncio.sleep(delay_seconds)
