import os
from pathlib import Path
from typing import Tuple, Dict, Optional
import boto3
from botocore.config import Config
from botocore.exceptions import ClientError
from app.config import (
    STORAGE_MODE,
    AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY,
    AWS_REGION,
    AWS_S3_BUCKET_NAME,
    LOCAL_STORAGE_DIR,
    BASE_URL,
)

if STORAGE_MODE == "s3":
    s3_client = boto3.client(
        "s3",
        region_name=AWS_REGION,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
        config=Config(signature_version="s3v4"),
    )
else:
    s3_client = None
    LOCAL_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


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
    else:
        # Local development storage fallback
        url = f"{BASE_URL}/api/storage/{storage_key}"
        return url, {"Content-Type": "application/octet-stream"}


def generate_presigned_get(storage_key: str, expires_in: int = 60) -> str:
    """Generate a short-lived presigned GET URL for downloading ciphertext."""
    if STORAGE_MODE == "s3":
        return s3_client.generate_presigned_url(
            "get_object",
            Params={"Bucket": AWS_S3_BUCKET_NAME, "Key": storage_key},
            ExpiresIn=expires_in,
        )
    else:
        return f"{BASE_URL}/api/storage/{storage_key}"


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
    else:
        path = LOCAL_STORAGE_DIR / storage_key
        if not path.is_file():
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
    else:
        path = LOCAL_STORAGE_DIR / storage_key
        if path.exists():
            try:
                path.unlink()
                return True
            except OSError:
                return False
        return True
