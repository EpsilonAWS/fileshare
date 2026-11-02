import hashlib
import hmac
import re
import time
from pathlib import Path
from typing import Tuple, Dict, Optional
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from app.config import (
    STORAGE_MODE,
    S3_ENDPOINT_URL,
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_REGION,
    AWS_S3_BUCKET_NAME,
    LOCAL_STORAGE_DIR,
    BASE_URL,
    SECRET_KEY,
)

# Every object key we create looks like this — anything else is rejected.
STORAGE_KEY_RE = re.compile(r"vaults/[A-Za-z0-9_-]{8,64}")

if STORAGE_MODE == "s3":
    s3_client = boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT_URL or None,  # set for Cloudflare R2
        region_name=AWS_REGION,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
    )
else:
    s3_client = None
    LOCAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


# ─── Local dev storage: HMAC-signed, expiring URLs that mimic presigned S3 URLs ──

def _local_sig(op: str, storage_key: str, exp: int) -> str:
    msg = f"{op}:{storage_key}:{exp}".encode()
    return hmac.new(SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()


def _local_url(op: str, storage_key: str, expires_in: int) -> str:
    exp = int(time.time()) + expires_in
    return f"{BASE_URL}/api/storage/{storage_key}?op={op}&exp={exp}&sig={_local_sig(op, storage_key, exp)}"


def verify_local_signature(op: str, storage_key: str, exp: Optional[str], sig: Optional[str]) -> bool:
    try:
        exp_ts = int(exp or "")
    except ValueError:
        return False
    if time.time() > exp_ts or not sig:
        return False
    return hmac.compare_digest(sig, _local_sig(op, storage_key, exp_ts))


def local_path(storage_key: str) -> Optional[Path]:
    """Map a storage key to a file inside LOCAL_STORAGE_DIR, or None if it's not a valid key."""
    if not STORAGE_KEY_RE.fullmatch(storage_key):
        return None
    root = LOCAL_STORAGE_DIR.resolve()
    path = (root / storage_key).resolve()
    if root not in path.parents:
        return None
    return path


# ─── Public API ───────────────────────────────────────────────────────────────

def generate_presigned_put(storage_key: str, expires_in: int = 900) -> Tuple[str, Dict[str, str]]:
    """Generate a presigned PUT URL for uploading ciphertext directly."""
    if STORAGE_MODE == "s3":
        url = s3_client.generate_presigned_url(
            "put_object",
            Params={
                "Bucket": AWS_S3_BUCKET_NAME,
                "Key": storage_key,
                "ContentType": "application/octet-stream",
            },
            ExpiresIn=expires_in,
        )
        return url, {"Content-Type": "application/octet-stream"}
    return _local_url("put", storage_key, expires_in), {"Content-Type": "application/octet-stream"}


def generate_presigned_get(storage_key: str, expires_in: int = 60) -> str:
    """Generate a short-lived presigned GET URL for downloading ciphertext."""
    if STORAGE_MODE == "s3":
        return s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": AWS_S3_BUCKET_NAME, "Key": storage_key},
            ExpiresIn=expires_in,
        )
    return _local_url("get", storage_key, expires_in)


def verify_object_exists(storage_key: str, expected_size: Optional[int] = None) -> bool:
    """Verify the ciphertext object exists in storage and matches size."""
    if STORAGE_MODE == "s3":
        try:
            res = s3_client.head_object(Bucket=AWS_S3_BUCKET_NAME, Key=storage_key)
            if expected_size is not None and res.get("ContentLength") != expected_size:
                return False
            return True
        except ClientError:
            return False
    path = local_path(storage_key)
    if path is None or not path.is_file():
        return False
    if expected_size is not None and path.stat().st_size != expected_size:
        return False
    return True


def delete_object(storage_key: str) -> bool:
    """Purge ciphertext object from S3 or local disk."""
    if STORAGE_MODE == "s3":
        try:
            s3_client.delete_object(Bucket=AWS_S3_BUCKET_NAME, Key=storage_key)
            return True
        except ClientError:
            return False
    path = local_path(storage_key)
    if path is not None and path.exists():
        try:
            path.unlink()
            return True
        except OSError:
            return False
    return True
