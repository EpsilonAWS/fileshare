import asyncio
import logging
from datetime import datetime, timezone
from sqlalchemy import select, or_
from app.db import AsyncSessionLocal
from app.models import Vault
from app.storage import delete_object

logger = logging.getLogger("ephemera.sweeper")


async def sweep_expired_vaults() -> int:
    """Find expired or download-exhausted vaults, delete storage objects, and purge records."""
    now = datetime.now(timezone.utc)
    deleted_count = 0

    async with AsyncSessionLocal() as session:
        stmt = select(Vault).where(
            Vault.completed_at.is_not(None),
            or_(
                Vault.expires_at <= now,
                Vault.downloads_remaining <= 0,
            ),
        )
        result = await session.execute(stmt)
        expired_vaults = result.scalars().all()

        for vault in expired_vaults:
            try:
                delete_object(vault.storage_key)
            except Exception as e:
                logger.error(f"Failed to delete storage for vault {vault.upload_id}: {e}")

            await session.delete(vault)
            deleted_count += 1

        if deleted_count > 0:
            await session.commit()
            logger.info(f"Sweeper purged {deleted_count} expired/exhausted files.")

    return deleted_count


async def run_periodic_sweeper(interval_seconds: int = 60):
    """Continuous background loop for containerized / standalone environments."""
    while True:
        try:
            await sweep_expired_vaults()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in background sweeper loop: {e}")
        await asyncio.sleep(interval_seconds)
