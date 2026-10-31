# fileshare

> A zero-trust, temporary file transfer system (similar to Firefox Send or SendSafely).
> Files are end-to-end encrypted in the browser and self-destruct after a time limit
> or a number of downloads.

## Structure

```
fileshare/
├── frontend/   React 19 + Vite + TypeScript + Tailwind v4 (deploys to Vercel)
├── backend/    Node + TypeScript API, Supabase (Postgres) + Cloudflare R2 (coming)
└── shared/
    └── types.ts  API contract — endpoints, request/response types, error codes
```

`shared/types.ts` is the single source of truth for the API. Change it together, in
its own PR, and both sides get type errors if they drift.

## How the encryption works

- The browser generates a random 32-byte secret that lives only in the link's `#fragment`
  (browsers never send it to a server).
- If the sender sets a passkey, it is mixed into the key with PBKDF2 → HKDF. The server
  receives a derived `authToken`, never the passkey.
- The file and its name are encrypted with AES-256-GCM before upload. The server and R2
  only ever store ciphertext.

Full details are in the header comment of `shared/types.ts`.

## Run locally

**Frontend** (works on its own — MSW mocks the whole API):

```bash
cd frontend
npm install
copy .env.example .env.local    # macOS/Linux: cp .env.example .env.local
npm run dev                     # http://localhost:5173
```

Set `VITE_API_MOCKING=disabled` in `frontend/.env.local` to use the real backend
(Vite proxies `/api/*` to `VITE_API_PROXY_TARGET`, default `http://localhost:4000`).

**Backend:** see `backend/README.md` once it lands.

## Deploy (Vercel)

Two Vercel projects from this repo:

- **frontend** — Root Directory `frontend`. `frontend/vercel.json` rewrites `/api/*` to the backend project's URL.
- **backend** — Root Directory `backend`.

## License

MIT © 2026 Aayush
