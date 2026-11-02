# Ephemera

**Share files that vanish.**

Ephemera is a zero-trust, temporary file transfer app — think Firefox Send or SendSafely.
Files are **end-to-end encrypted in the browser** before they're uploaded, and they
**self-destruct** after a time limit or a number of downloads. The server and the storage
bucket only ever see scrambled bytes.

> The repository is named `fileshare`; the app is called **Ephemera**.

---

## Features

**Sender**
- Drag and drop one or more files anywhere on the page (several files are zipped in the browser), up to 100 MB
- Expiry: 10 minutes, 1 hour or 24 hours
- Download limit: 1, 3 or 10 downloads
- Optional passkey, mixed into the encryption key itself
- Live progress: *Encrypting → Uploading x% → Sealing*, then a share link with a copy button

**Receiver**
- Passkey gate with tries remaining and a lockout after 5 wrong attempts
- File name and size decrypted locally, a live countdown (server clock), downloads left
- *Decrypt & download* — the file is decrypted on the receiver's device and saved
- Clear screens for every outcome: expired, destroyed, not found, locked, incomplete link, broken key

**Design**
- A canvas particle-stream background that reacts to the app: streams bend toward the card when you drag a file, swirl while encrypting, flow in while uploading and burst when done, and dim as a file nears expiry
- Pointer effects: particles curl around the cursor, a comet trail with sparks, a trailing ring, and glass cards whose edges light up under the pointer
- Respects *reduce motion*, pauses in background tabs, and works on phones

---

## How it works

```
 Sender's browser                     Server (FastAPI)              Storage (R2 / S3)
 ────────────────                     ────────────────              ─────────────────
 1. random 32-byte link secret
 2. (+ passkey via PBKDF2) → HKDF
    → file key + authToken
 3. encrypt file + name (AES-256-GCM)
 4. POST /api/uploads ───────────────▶ store encrypted name,
    (encrypted name, authToken)       argon2(authToken), limits
                       ◀───────────── presigned PUT URL
 5. PUT ciphertext ─────────────────────────────────────────────────▶ ciphertext only
 6. POST /complete ─────────────────▶ timer starts now
 7. share  /vault/<token>#<link secret>
           └─ server-visible ─┘└─ never leaves the browser ─┘
```

- The **link secret lives after the `#`** in the link. Browsers never send that part to a
  server, so neither the backend nor the bucket can decrypt anything.
- With a **passkey**, the key also depends on the passkey. The server receives a derived
  `authToken` (never the passkey) and stores only its Argon2 hash. A leaked link alone can't
  decrypt the file, and a leaked database can't be used to guess the passkey.
- The receiver's browser repeats the derivation, unlocks (`authToken` checked, 5 tries max),
  gets a **60-second presigned download URL**, downloads the ciphertext and decrypts it locally.

The exact scheme is documented at the top of [`shared/types.ts`](shared/types.ts).

---

## Tech stack

| Part | Stack |
|---|---|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4, TanStack Query, React Router, Web Crypto API, MSW (mock API) |
| Backend | Python, FastAPI, SQLAlchemy 2 (async), Argon2id, boto3 |
| Database | SQLite locally, PostgreSQL (Supabase) in production |
| Storage | Local disk in development, Cloudflare R2 (S3-compatible) in production |
| Hosting | Vercel (two projects: frontend + backend) |

## Repository structure

```
fileshare/
├── frontend/        React app — see frontend/README.md
├── backend/         FastAPI API — see backend/README.md
├── shared/
│   └── types.ts     API contract: endpoints, request/response types, error codes, crypto scheme
└── docker-compose.yml   Postgres + backend in containers (optional)
```

`shared/types.ts` is the **single source of truth** for the API. The frontend imports it
directly; the backend's `app/schemas.py` mirrors it. Change both together, in one PR.

---

## Run it locally

You need **Node 20+** and **Python 3.10+**. Use two terminals.

**1. Backend** (port 4000)

```bash
cd backend
python -m venv venv
venv\Scripts\activate              # macOS/Linux: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env             # macOS/Linux: cp .env.example .env
uvicorn app.main:app --port 4000 --reload
```

With no bucket configured it stores files on local disk and uses a local SQLite database.

**2. Frontend** (port 5173)

```bash
cd frontend
npm install
copy .env.example .env.local       # macOS/Linux: cp .env.example .env.local
npm run dev
```

Open <http://localhost:5173>. Vite forwards `/api/*` to the backend.

- To work on the UI **without the backend**, set `VITE_API_MOCKING=enabled` in
  `frontend/.env.local` — MSW fakes the whole API in the browser.
- To try a transfer, upload a file, copy the link and open it in another browser or an
  incognito window **on the same computer** (`localhost` links don't work on other devices).

---

## Tests

```bash
cd backend
pytest -c pytest.ini tests -v
```

The backend suite covers the full upload → unlock → download flow, passkey lockout,
parallel-request races (passkey attempts and download counts), the last-download grace
period, the error format, local-storage URL signing and path checks, and the sweeper.

The frontend type-checks and builds with `npm run build` inside `frontend/`.

---

## API at a glance

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/uploads` | Create an upload → presigned PUT URL + share token |
| `POST` | `/api/uploads/:uploadId/complete` | Confirm the upload; the expiry timer starts here |
| `GET` | `/api/vault/:token` | Does it exist / need a passkey? (reveals nothing else) |
| `POST` | `/api/vault/:token/unlock` | Check `authToken` → encrypted metadata + 5-min access token |
| `POST` | `/api/vault/:token/download` | Use up one download → 60-second presigned GET URL |
| `GET` | `/api/cron/sweep` | Delete expired, exhausted and abandoned files (needs `CRON_SECRET`) |

Every error has the same shape: `{ "error": { "code", "message", "details?" } }`, with codes
such as `NOT_FOUND`, `EXPIRED`, `EXHAUSTED`, `WRONG_PASSKEY`, `LOCKED_OUT`, `FILE_TOO_LARGE`.
The full list and status codes are in [`shared/types.ts`](shared/types.ts).

---

## Deploy

Two Vercel projects from this one repository:

| Vercel project | Root Directory | Notes |
|---|---|---|
| frontend | `frontend` | Set the backend URL in `frontend/vercel.json` (the `/api/*` rewrite) |
| backend | `backend` | Set the environment variables below |

**Backend environment variables** (full table in [`backend/README.md`](backend/README.md)):

- `DATABASE_URL` — Supabase **connection pooler** URL (port 6543)
- `S3_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME` — from Cloudflare R2
- `SECRET_KEY`, `CRON_SECRET` — long random strings (the backend refuses to start on Vercel without `SECRET_KEY`)
- `CORS_ORIGINS` — the frontend's Vercel URL

**Cloudflare R2 bucket:** add a CORS rule allowing `PUT` and `GET` (header `Content-Type`)
from the frontend's domain, and a lifecycle rule deleting objects older than 2 days as a backstop.

---

## Security notes

- Encryption and decryption happen only in the browser (Web Crypto API). Keys never reach the server.
- Expired or used-up files are refused immediately; the stored ciphertext is deleted after a
  short grace period so a download already in progress can finish.
- The passkey limit and download counts use single atomic database updates, so parallel
  requests can't get around them.
- The vault page sends no referrer and loads no third-party scripts, and it removes the key
  from the address bar as soon as it has read it.
- If someone loses the link's `#` part or the passkey, the file **cannot be recovered** —
  by design.

---

## Team

Built for the AWS Student Builder Group at VIT.

| Role | Name | GitHub |
|---|---|---|
| Frontend | Aneek Chatterjee | [aneekchatterjee-boop](https://github.com/aneekchatterjee-boop) |
| Backend | Aayush Srivastava | [notaayushsrivastava](https://github.com/notaayushsrivastava) |

Repository: [EpsilonAWS/fileshare](https://github.com/EpsilonAWS/fileshare)

## License

MIT © 2026 Aayush Srivastava
