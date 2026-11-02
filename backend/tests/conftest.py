"""Run tests against a throwaway SQLite DB and storage folder, never the dev ones."""
import os
import tempfile

_tmp = tempfile.mkdtemp(prefix="ephemera-test-")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_tmp}/test.db"
os.environ["LOCAL_STORAGE_DIR"] = os.path.join(_tmp, "storage")
os.environ.pop("AWS_S3_BUCKET_NAME", None)
os.environ.pop("VERCEL", None)
