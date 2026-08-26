# Booking API

Express 4 + TypeScript + PostgreSQL 16. Hand-written SQL behind a repository layer, no ORM.

The root `README.md` carries the architecture overview; this file covers running and
testing the backend on its own.

## Quickstart

From the repository root:

```bash
docker compose up --build
curl localhost:5006/health   # {"status":"ok","database":"up"}
```

For local development against the compose database only:

```bash
docker compose up -d db
npm run dev --workspace @booking/backend
```

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | — | **Required.** No default, deliberately: a default would let a misconfigured deploy connect to the wrong database instead of refusing to start. |
| `PORT` | `5006` | |
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `CORS_ORIGIN` | `*` | `*` or a comma-separated allow-list |
| `RATE_LIMIT_WINDOW_MS` | `60000` | |
| `RATE_LIMIT_MAX` | `300` | Per process — the store is in-memory |
| `PG_POOL_MAX` | `10` | |
| `SEED_ON_STARTUP` | `true` | Seed data is loaded only when the database is empty |

## Layout

```text
src/
  app.ts                 Express app factory (no listen) + GET /health
  server.ts              Boot: migrate, seed, listen, graceful shutdown
  config/env.ts          Zod-validated environment, fails fast
  db/
    schema.sql           THE booking rule. Single source of truth.
    migrate.ts           Applies schema.sql idempotently on boot
    pool.ts              pg.Pool, withTransaction, the date type parser
    errors.ts            SQLSTATE classification (23P01 / 23503 / 23514)
  errors/AppError.ts     One class per error code in the API contract
  middleware/            requestId, security, validate, errorHandler
  modules/<name>/        Vertical slices: routes -> service -> repository
  routes/v1.ts           The /v1 router; every feature router is mounted here
  test/                  Integration lifecycle + SQL fixtures
```

## The booking rule

Two confirmed reservations for the same unit cannot overlap. That is enforced by
`reservation_no_overlap`, an `EXCLUDE USING gist` constraint in `src/db/schema.sql` —
**not** by application code. The service layer runs an overlap `SELECT` before inserting,
but only to build a 409 payload that can name the conflicting guest; that query is racy
by design and deleting it would degrade error messages without ever permitting a double
booking.

Intervals are half-open, `[startDate, endDate)`, so same-day turnover is allowed.

## Tests

```bash
npm run test:unit         --workspace @booking/backend   # no database required
npm run test:integration  --workspace @booking/backend   # needs `docker compose up -d db`
```

Integration tests run against the real Postgres container. They are not mocked: the
exclusion constraint *is* the booking rule, so a test against a fake database would
verify nothing that matters.
