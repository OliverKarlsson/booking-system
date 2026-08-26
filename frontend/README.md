# Frontend

Vite + React + TypeScript + Tailwind. Server state is owned by TanStack Query; Zustand
holds client state only.

## Running

```bash
npm install                 # at the repo root — this is an npm workspace
npm run build --workspace @booking/shared   # the frontend imports its compiled output
npm run dev  --workspace @booking/frontend  # http://localhost:5173
```

`/v1` is proxied to `http://localhost:5006` in dev (override with
`VITE_API_PROXY_TARGET`), so the app talks to a single origin exactly as it does behind
the reverse proxy in Docker. See `.env.example`.

```bash
npm run typecheck --workspace @booking/frontend   # tsc --noEmit
npm run test      --workspace @booking/frontend   # vitest
```

## Layout

```text
src/
  lib/          apiClient, TanStack Query client + queryKeys, date formatting
  store/        Zustand slices — filters and modal/editing state
  router.tsx    every route, mounted up front (closed file — see below)
  components/
    ui/         presentational primitives: Button, Input, Card, Modal, …
    layout/     app shell: header, nav, page container
  features/
    dashboard/      T3.1
    rentalUnits/    T2.4
    reservations/   T3.2
  pages/        not-found and route-error pages
```

## Three things worth knowing before adding a feature

**1. Dates are never passed through `new Date()`.**

`new Date('2026-03-26')` parses as UTC midnight, so any local-time formatter renders it
as the 25th for viewers west of Greenwich. Per the API contract every date is already
local to the property and is displayed exactly as stored, so there is nothing to
convert. Use `formatDate` / `formatDateRange` from `src/lib/formatDate.ts`, which work
on the `YYYY-MM-DD` string directly. The only place a `Date` is correct is
`formatTimestamp`, for `createdAt`/`updatedAt`, which genuinely are instants.

`src/lib/formatDate.test.ts` enforces this by making `Date` construction throw during
formatting — a check that holds for every timezone rather than the two a test might
otherwise sample.

**2. `src/lib/apiClient.ts` is the only place a network call happens.**

It prefixes `/v1`, parses the `{ error, code, details }` envelope, and throws a typed
`ApiError`. Branch on `error.code`, not on the status. `isBookingConflict(error)`
narrows a 409 to its `details`, which carry the conflicting reservation's guest name and
dates — that is what the reservation form's specific conflict message is built from.

**3. `src/router.tsx` is closed.**

Every route is already mounted against a stub page. Features replace the contents of
those page components; nothing adds a route or an import to the router. Cache keys work
the same way: build them with `queryKeys` from `src/lib/queryKeys.ts` so prefix-based
invalidation actually clears what it should.
