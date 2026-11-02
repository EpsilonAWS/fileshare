# Ephemera Backend

FastAPI backend implementing the zero-trust file transfer API specified in [`shared/types.ts`](../shared/types.ts).

## Features

- **Metadata Persistence**: SQLAlchemy 2.0 (asyncio) supporting PostgreSQL (`asyncpg`) in production and SQLite (`aiosqlite`) locally.
- **Argon2 Password Protection**: Argon2id verification for `authToken`, tracking failed attempts with a 5-attempt limit before a 423 `LOCKED_OUT` state.
- **HMAC Access Tokens**: Stateless 5-minute access tokens issued upon unlocking for single-use download authorization.
- **Immediate Expiry & Invalidation**: Instant purging of expired files and download-exhausted vaults upon access.
- **Scheduled Sweeper**: Background sweeper running continuously in Docker and exposed via `/api/cron/sweep` for Vercel Cron.
- **Cloud Storage**: AWS S3 pre-signed PUT and GET URLs with local disk fallback for local development without AWS credentials.
- **Deployment**: Ready for containerization via Docker / Docker Compose and serverless deployment via Vercel.

---

## Getting Started

### 1. Local Run

```bash
cd backend
python -m venv venv
venv\Scripts\activate   # On Linux/macOS: source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --port 4000 --reload
```

### 2. Run Tests

```bash
pytest -c pytest.ini tests/test_api.py -v
```

### 3. Run with Docker Compose

```bash
docker-compose up --build
```
This boots both PostgreSQL and the containerized FastAPI backend on port 4000.

---

## Configuration (`.env`)

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL or SQLite connection string | `sqlite+aiosqlite:///ephemera.db` |
| `AWS_ACCESS_KEY_ID` | AWS Access Key ID for S3 | `""` (uses local storage fallback) |
| `AWS_SECRET_ACCESS_KEY` | AWS Secret Access Key for S3 | `""` |
| `AWS_REGION` | AWS S3 Region | `us-east-1` |
| `AWS_S3_BUCKET_NAME` | AWS S3 Bucket Name | `""` |
| `SECRET_KEY` | HMAC signing key for download access tokens | Dev secret |
| `CRON_SECRET` | Bearer token required for `/api/cron/sweep` | `ephemera-cron-secret` |
| `BASE_URL` | Base URL used for local storage links | `http://localhost:4000` |
