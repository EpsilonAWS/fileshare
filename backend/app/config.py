import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# Running as a Vercel serverless function? (Vercel sets VERCEL=1)
ON_VERCEL = bool(os.getenv("VERCEL"))

# Database URL: uses SQLite by default if PostgreSQL DATABASE_URL is not set
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{BASE_DIR / 'ephemera.db'}")
# Fix postgres:// URL prefix for SQLAlchemy asyncpg
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://") and not DATABASE_URL.startswith("postgresql+asyncpg://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# Object storage (S3-compatible). For Cloudflare R2 set S3_ENDPOINT_URL to
# https://<account-id>.r2.cloudflarestorage.com and use an R2 API token's keys.
S3_ENDPOINT_URL = os.getenv("S3_ENDPOINT_URL", "")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "")
AWS_REGION = os.getenv("AWS_REGION", "auto" if S3_ENDPOINT_URL else "us-east-1")
AWS_S3_BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME", "")

# Storage mode: 's3' if bucket is set and credentials exist, else 'local'
STORAGE_MODE = "s3" if (AWS_S3_BUCKET_NAME and AWS_ACCESS_KEY_ID) else "local"
LOCAL_STORAGE_DIR = Path(os.getenv("LOCAL_STORAGE_DIR", BASE_DIR / "storage"))

# After a vault expires or its last download URL is issued, keep the object this long
# so an in-flight download (presigned GET valid 60 s) can still finish.
STORAGE_GRACE_SECONDS = int(os.getenv("STORAGE_GRACE_SECONDS", "90"))

# Browser origins allowed to call the API (comma-separated).
CORS_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if o.strip()
]

# Security
_DEFAULT_SECRET = "ephemera-insecure-secret-key-must-change-in-production"
SECRET_KEY = os.getenv("SECRET_KEY", _DEFAULT_SECRET)
if ON_VERCEL and SECRET_KEY == _DEFAULT_SECRET:
    # Anyone who knows the default could forge download access tokens.
    raise RuntimeError("SECRET_KEY must be set in production (Vercel environment variables).")

CRON_SECRET = os.getenv("CRON_SECRET", "ephemera-cron-secret")
BASE_URL = os.getenv("BASE_URL", "http://localhost:4000")
