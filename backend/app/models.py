from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Text, DateTime
from app.db import Base


def utc_now():
    return datetime.now(timezone.utc)


class Vault(Base):
    __tablename__ = "vaults"

    upload_id = Column(String(64), primary_key=True, index=True)
    share_token = Column(String(64), unique=True, index=True, nullable=False)
    size_bytes = Column(Integer, nullable=False)
    expiry = Column(String(10), nullable=False)
    max_downloads = Column(Integer, nullable=False)
    downloads_remaining = Column(Integer, nullable=False)
    encrypted_meta = Column(Text, nullable=False)

    # Passkey protection (Argon2 hash of authToken)
    auth_token_hash = Column(String(255), nullable=True)
    kdf_salt = Column(String(128), nullable=True)
    kdf_iterations = Column(Integer, nullable=True)
    kdf_algorithm = Column(String(64), nullable=True)
    failed_attempts = Column(Integer, default=0, nullable=False)

    storage_key = Column(String(128), nullable=False)

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    # When the last download URL was issued; storage is purged after a short grace period.
    exhausted_at = Column(DateTime(timezone=True), nullable=True)
