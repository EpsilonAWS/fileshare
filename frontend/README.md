# FileShare — frontend

React 19 + Vite + TypeScript + Tailwind v4 + shadcn/ui + TanStack Query + React Router.
The API contract lives in `../shared/types.ts` (imported as `@shared/types`).

## Run

```bash
cd frontend
npm install
cp .env.example .env.local   # Windows: copy .env.example .env.local
npm run dev                  # http://localhost:5173
```

With `VITE_API_MOCKING=enabled`, MSW fakes the whole backend in the browser
(`src/mocks/`). Set it to `disabled` to hit the real backend via the Vite proxy.

### Test error screens with mocks
`/vault/demo-notfound`, `/vault/demo-expired`, `/vault/demo-exhausted`,
`/vault/demo-lockedout`, `/vault/demo-ratelimit`

## Add shadcn components

```bash
npx shadcn@latest add button input card progress radio-group sonner
```

## Structure

```
src/
  lib/api-client.ts   all backend calls (only place that talks to the API)
  lib/crypto.ts       TODO: E2E encryption (see header of shared/types.ts)
  mocks/              MSW fake backend
  routes/             UploadPage, VaultPage, NotFoundPage
  components/ui/      shadcn components (generated)
```

## Deploy (Vercel)
New Vercel project → Root Directory `frontend`. Edit `vercel.json` to point
`/api/*` at the backend project's URL.
