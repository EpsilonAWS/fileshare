# Ephemera — backend

FastAPI backend implementing the zero-trust file transfer API specified in
[`shared/types.ts`](../shared/types.ts). It never sees a file, a file name or a passkey in
plain form — only ciphertext, an encrypted metadata blob and an Argon2 hash of a derived `authToken`.

## Features

- **Metadata persistence** — SQLAlchemy 2.0 (async): PostgreSQL via `asyncpg` in production
  (Supabase pooler-compatible), SQLite via `aiosqlite` locally.
- **Passkey protection** — Argon2id hash of the client-derived `authToken`; 5 wrong attempts →
  `423 LOCKED_OUT`. Each attempt is reserved with one atomic update *before* the Argon2 check,
  so parallel guesses can't get past the limit, and a correct passkey doesn't use one up.
- **Download limits** — one conditional atomic `UPDATE … RETURNING` per download, so parallel
  requests can never get more downloads than allowed.
- **HMAC access tokens** — stateless 5-minute tokens issued on unlock, required to download.
- **Expiry & self-destruct** — expired or used-up vaults are refused immediately; the stored
  object is deleted after a short grace period (`STORAGE_GRACE_SECONDS`, default 90 s) so a
  download URL issued just before can still finish.
- **Sweeper** — removes expired, exhausted and abandoned (never completed) uploads. Runs every
  60 s in a long-running server and via `/api/cron/sweep` on Vercel.
- **Storage** — presigned PUT/GET URLs for any S3-compatible store (Cloudflare R2, AWS S3), with
  a local-disk fallback for development that uses HMAC-signed, expiring URLs.
- **Consistent errors** — every error (including validation errors and unknown routes) uses the
  `{ "error": { "code", "message", "details?" } }` shape from `shared/types.ts`.

---

## Getting started

### 1. Run locally

```bash
cd backend
python -m venv venv
venv\Scripts\activate              # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env             # macOS/Linux: cp .env.example .env
uvicorn app.main:app --port 4000 --reload
```

With no database or bucket configured, it uses `backend/ephemera.db` (SQLite) and stores
files in `backend/storage/`. Both are gitignored. If you pull a change that adds a database
column, delete `ephemera.db` and it will be recreated on the next start.

### 2. Run tests

```bash
pytest -c pytest.ini tests -v
```

Tests use a throwaway database and storage folder (`tests/conftest.py`), so they never touch
your dev data. `tests/test_api.py` covers the main flows; `tests/test_hardening.py` covers races,
the last-download grace period, error format, local-storage signing/paths, cron and the sweeper.

### 3. Run with Docker Compose (optional)

```bash
docker-compose up --build
```

Boots PostgreSQL and the backend on port 4000.

---

## Configuration (`.env`)

See [`.env.example`](.env.example). Leave a variable out rather than setting it to an empty value.

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
| `BASE_URL` | Base URL for local storage links. Use `http://localhost:5173` in dev so links go through Vite | `http://localhost:4000` |

---

## Deploying

### Vercel

New Vercel project → Root Directory `backend` (Python runtime via `vercel.json`). Set the
environment variables above — at minimum `DATABASE_URL`, the four R2 variables, `SECRET_KEY`,
`CRON_SECRET` and `CORS_ORIGINS` (the frontend's Vercel URL).

On Vercel the background sweeper loop is off; Vercel Cron calls `GET /api/cron/sweep` once a
day (the Hobby plan only allows daily jobs). Expiry is still enforced on every request.

### Cloudflare R2 bucket

1. **CORS** (bucket → Settings → CORS policy) — allow `PUT` and `GET` with header `Content-Type`
   from `http://localhost:5173` and the frontend's Vercel domain.
2. **Lifecycle rule** — delete objects older than 2 days, as a backstop if the sweeper misses something.

### Supabase

Use the **connection pooler** connection string (transaction mode, port 6543). Prepared-statement
caching is turned off automatically for Postgres so it works through the pooler.
