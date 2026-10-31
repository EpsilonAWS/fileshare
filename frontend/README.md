# Ephemera — frontend

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

If the browser blocks service workers, the mocks fall back to patching fetch/XHR
in the page (`src/mocks/fallback.ts`), so everything still works.

### Test error screens with mocks
Open these with a dummy key after `#` (any 43 characters), e.g.
`/vault/demo-expired#AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`

`demo-notfound`, `demo-expired`, `demo-exhausted`, `demo-lockedout`, `demo-ratelimit` (on unlock)

Without anything after `#` you get the "link is incomplete" screen.

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
