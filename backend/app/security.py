import hmac
import hashlib
import time
from datetime import datetime, timezone
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError
from app.config import SECRET_KEY

ph = PasswordHasher()


def hash_auth_token(token: str) -> str:
    """Hash the client's derived authToken with Argon2id."""
    return ph.hash(token)


def verify_auth_token(hash_str: str, token: str) -> bool:
    """Verify an authToken against its stored Argon2id hash."""
    try:
        return ph.verify(hash_str, token)
    except (VerifyMismatchError, VerificationError):
        return False


def create_access_token(share_token: str, ttl_seconds: int = 300) -> tuple[str, str]:
    """
    Generate a tamper-proof HMAC access token for the download route.
    Format: <share_token>.<expiry_ts>.<hex_hmac>
    """
    expiry_ts = int(time.time()) + ttl_seconds
    msg = f"{share_token}:{expiry_ts}".encode()
    sig = hmac.new(SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()
    token = f"{share_token}.{expiry_ts}.{sig}"
    expires_at_iso = datetime.fromtimestamp(expiry_ts, tz=timezone.utc).isoformat()
    return token, expires_at_iso


def verify_access_token(access_token: str, expected_share_token: str) -> bool:
    """Validate token format, signature, target shareToken, and expiration."""
    try:
        parts = access_token.split(".")
        if len(parts) != 3:
            return False
        token_share, expiry_str, sig = parts
        if token_share != expected_share_token:
            return False
        expiry_ts = int(expiry_str)
        if time.time() > expiry_ts:
            return False
        msg = f"{expected_share_token}:{expiry_ts}".encode()
        expected_sig = hmac.new(SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()
        return hmac.compare_digest(sig, expected_sig)
    except Exception:
        return False
