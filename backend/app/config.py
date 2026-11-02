import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# Database URL: uses SQLite by default if PostgreSQL DATABASE_URL is not set
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite+aiosqlite:///{BASE_DIR / 'ephemera.db'}")
# Fix postgres:// URL prefix for SQLAlchemy asyncpg
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+asyncpg://", 1)
elif DATABASE_URL.startswith("postgresql://") and not DATABASE_URL.startswith("postgresql+asyncpg://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+asyncpg://", 1)

# AWS S3 Settings
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY", "")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
AWS_S3_BUCKET_NAME = os.getenv("AWS_S3_BUCKET_NAME", "")

# Storage mode: 's3' if bucket is set and credentials exist, else 'local'
STORAGE_MODE = "s3" if (AWS_S3_BUCKET_NAME and AWS_ACCESS_KEY_ID) else "local"
LOCAL_STORAGE_DIR = Path(os.getenv("LOCAL_STORAGE_DIR", BASE_DIR / "storage"))

# Security
SECRET_KEY = os.getenv("SECRET_KEY", "ephemera-insecure-secret-key-must-change-in-production")
CRON_SECRET = os.getenv("CRON_SECRET", "ephemera-cron-secret")
BASE_URL = os.getenv("BASE_URL", "http://localhost:4000")
