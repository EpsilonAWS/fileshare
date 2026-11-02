# Ephemera — frontend

React 19 + Vite + TypeScript + Tailwind CSS v4, with TanStack Query and React Router.
All encryption happens here, in the browser, using the Web Crypto API.
The API contract is [`../shared/types.ts`](../shared/types.ts), imported as `@shared/types`.

## Run

```bash
cd frontend
npm install
copy .env.example .env.local   # macOS/Linux: cp .env.example .env.local
npm run dev                    # http://localhost:5173
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and build to `dist/` |
| `npm run typecheck` | Type-check only |
| `npm run preview` | Serve the production build locally |

### Environment (`.env.local`)

| Variable | Meaning |
|---|---|
| `VITE_API_MOCKING` | `enabled` = fake the whole API in the browser with MSW. `disabled` = use the real backend |
| `VITE_API_PROXY_TARGET` | Where Vite forwards `/api/*` in dev (default `http://localhost:4000`) |

For local development against the real backend, also put `BASE_URL=http://localhost:5173`
in `backend/.env`, so the backend's storage links go through Vite and everything stays on
one address.

## Working without the backend (mocks)

With `VITE_API_MOCKING=enabled`, `src/mocks/` answers every API call exactly as described
in `shared/types.ts`. Uploads are kept in the browser (localStorage + IndexedDB), so a link
made in one tab opens in another. If a browser blocks service workers, the mocks fall back
to patching `fetch`/XHR in the page (`src/mocks/fallback.ts`).

**Test the error screens** — open these with any 43 characters after `#`:

```
/vault/demo-expired#AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA
```

`demo-notfound`, `demo-expired`, `demo-exhausted`, `demo-lockedout`, `demo-ratelimit` (on unlock).
With nothing after `#` you get the "link is incomplete" screen.

## Structure

```
src/
├── main.tsx                  App entry; starts the mocks when enabled
├── router.tsx                /  ·  /vault/:shareToken  ·  404
├── index.css                 Theme tokens, glass cards, animations
├── routes/
│   ├── RootLayout.tsx        Header, particle background, cursor trail
│   ├── UploadPage.tsx        Hero, upload card, "How it works"
│   ├── VaultPage.tsx         Receiver flow (status → passkey → unlock → download)
│   └── NotFoundPage.tsx
├── components/
│   ├── upload/               DropZone, Segmented, PasskeyField, WorkingView, ShareResult, UploadCard
│   ├── vault/                PasskeyGate, FileReady, Countdown, VaultMessage
│   ├── ParticleBackground.tsx, CursorTrail.tsx, GlassCard.tsx, Reveal.tsx, Logo.tsx
├── lib/
│   ├── api-client.ts         The only place that talks to the API
│   ├── crypto.ts             End-to-end encryption (see below)
│   ├── bundle.ts             Zips several files in the browser (fflate)
│   ├── particle-field.ts     Canvas particle engine + `field` controller
│   ├── errors.ts             Error code → human message
│   ├── save-file.ts          Saves the decrypted file (sanitises the name)
│   └── use-spotlight.ts, query-client.ts, utils.ts
└── mocks/                    MSW handlers, in-browser storage, fallback
```

## Encryption (`src/lib/crypto.ts`)

- `prepareUpload(file, meta, passkey?)` — creates the link secret, derives the keys, encrypts
  the file and its metadata, and returns everything `createUpload` needs.
- `deriveKeys(linkSecret, { passkey, kdf }?)` — PBKDF2-SHA256 (600,000 iterations) for the
  passkey, then HKDF-SHA256 → AES-256-GCM file key + `authToken`.
- `decryptMeta` / `decryptFile` — receiver side; throw `DecryptionError` on a wrong key or tampering.
- `buildShareLink` / `takeLinkSecretFromHash` — the key lives only in the `#fragment` and is
  removed from the address bar as soon as it's read.

## Motion

`lib/particle-field.ts` exposes a `field` object the UI uses to steer the background:
`field.set("attract" | "swirl" | "idle", point)`, `field.burst(point)` and `field.intensity`.
Everything respects `prefers-reduced-motion`, pauses in hidden tabs, and the pointer effects
only run with a mouse or pen.

## Deploy (Vercel)

New Vercel project → Root Directory `frontend`. In `vercel.json`, replace
`REPLACE-WITH-BACKEND-PROJECT` with the backend project's domain so `/api/*` is forwarded to it.
