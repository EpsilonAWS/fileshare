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
| `DATABASE_URL` | PostgreSQL or SQLite connection string. For Supabase use the **pooler** URL (port 6543) | `sqlite+aiosqlite:///ephemera.db` |
| `S3_ENDPOINT_URL` | S3-compatible endpoint. For Cloudflare R2: `https://<account-id>.r2.cloudflarestorage.com` | `""` (AWS S3) |
| `AWS_ACCESS_KEY_ID` | Access key (AWS, or an R2 API token's key) | `""` (uses local storage fallback) |
| `AWS_SECRET_ACCESS_KEY` | Secret key | `""` |
| `AWS_REGION` | Region | `auto` with an endpoint, else `us-east-1` |
| `AWS_S3_BUCKET_NAME` | Bucket name | `""` |
| `SECRET_KEY` | HMAC signing key for access tokens and local storage URLs. **Required on Vercel** | Dev secret |
| `CRON_SECRET` | Bearer token for `/api/cron/sweep` (Vercel Cron sends it automatically) | `ephemera-cron-secret` |
| `CORS_ORIGINS` | Comma-separated browser origins allowed to call the API | `http://localhost:5173,http://127.0.0.1:5173` |
| `STORAGE_GRACE_SECONDS` | How long an expired/exhausted object is kept so an in-flight download can finish | `90` |
| `BASE_URL` | Base URL used for local storage links | `http://localhost:4000` |

### Cloudflare R2 bucket setup

1. **CORS** (bucket → Settings → CORS policy) — allow `PUT` and `GET` with header `Content-Type`
   from `http://localhost:5173` and the frontend's Vercel domain.
2. **Lifecycle rule** — delete objects older than 2 days, as a safety net if the sweeper misses something.

### Notes

- Expired or exhausted vaults are refused immediately, but their storage object is kept for
  `STORAGE_GRACE_SECONDS` so a download URL issued just before can still finish. The sweeper
  (every 60 s in Docker, daily via Vercel Cron) then removes it.
- Vercel's Hobby plan only allows daily cron jobs, so `vercel.json` runs the sweep once a day.
  Expiry is still enforced on every request; the R2 lifecycle rule is the backstop.
