import asyncio
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, or_, and_
from app.config import STORAGE_GRACE_SECONDS
from app.db import AsyncSessionLocal
from app.models import Vault
from app.schemas import UPLOAD_URL_TTL_SECONDS
from app.storage import delete_object

logger = logging.getLogger("ephemera.sweeper")


async def sweep_expired_vaults() -> int:
    """
    Delete storage objects and records for vaults that are:
      - expired (past expires_at + grace),
      - exhausted (last download URL issued more than `grace` ago), or
      - abandoned (upload never completed and its PUT URL has long expired).
    The grace period lets a download URL issued just before expiry/exhaustion finish.
    """
    now = datetime.now(timezone.utc)
    grace_cutoff = now - timedelta(seconds=STORAGE_GRACE_SECONDS)
    abandoned_cutoff = now - timedelta(seconds=UPLOAD_URL_TTL_SECONDS + STORAGE_GRACE_SECONDS)
    deleted_count = 0

    async with AsyncSessionLocal() as session:
        stmt = select(Vault).where(
            or_(
                and_(Vault.completed_at.is_not(None), Vault.expires_at <= grace_cutoff),
                and_(
                    Vault.downloads_remaining <= 0,
                    or_(Vault.exhausted_at.is_(None), Vault.exhausted_at <= grace_cutoff),
                ),
                and_(Vault.completed_at.is_(None), Vault.created_at <= abandoned_cutoff),
            )
        )
        result = await session.execute(stmt)
        stale_vaults = result.scalars().all()

        for vault in stale_vaults:
            try:
                delete_object(vault.storage_key)
            except Exception as e:
                logger.error(f"Failed to delete storage for vault {vault.upload_id}: {e}")

            await session.delete(vault)
            deleted_count += 1

        if deleted_count > 0:
            await session.commit()
            logger.info(f"Sweeper purged {deleted_count} expired/exhausted/abandoned vaults.")

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
