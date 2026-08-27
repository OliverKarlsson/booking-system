# Booking System

A reservation manager for short-let rental units — REST API plus a React web client.

Built for the Minut take-home assignment. The original brief is in
[`planning/Home Assignment_ The Booking System.md`](./planning/Home%20Assignment_%20The%20Booking%20System.md);
the full decision record, including alternatives considered and rejected, is in
[`planning/FAQ.md`](./planning/FAQ.md).

---

## The one deviation from the scaffolding, and why

**The project runs on PostgreSQL, not the scaffolded MongoDB.** The brief permits it
("feel free to switch this out with another database if you want"), and the reason is the
central requirement of the assignment:

> No two confirmed reservations for the same rental unit may overlap.

That is not a workflow. It is a **constraint** — and Postgres can state it declaratively:

```sql
CONSTRAINT reservation_no_overlap EXCLUDE USING gist (
  rental_unit_id WITH =,
  daterange(start_date, end_date, '[)') WITH &&
) WHERE (status = 'confirmed')
```

Those five lines *are* the entire booking rule: the per-unit scoping, the half-open
interval that permits same-day turnover, and the exemption for cancelled bookings. There
is no second definition of "overlap" anywhere in the codebase to drift out of sync with
it, and no application code path — present or future — can insert a double booking.

### What the constraint buys that application code cannot

The interesting part is not that Postgres is convenient. It is that the obvious
alternative is **wrong in a way that passes every single-threaded test**:

```ts
// The intuitive implementation. Looks airtight. Isn't.
await session.withTransaction(async () => {
  const conflicts = await reservations.find({ /* overlap query */ }).toArray();
  if (conflicts.length) throw new BookingConflictError(conflicts);
  await reservations.insertOne(newReservation);
});
```

MongoDB transactions give **snapshot isolation, not serializability**. Two simultaneous
requests for the same slot interleave like this:

| Step | Transaction A | Transaction B |
| --- | --- | --- |
| 1 | reads overlaps → none found | |
| 2 | | reads overlaps → none found *(A hasn't committed)* |
| 3 | inserts reservation `a1` | |
| 4 | | inserts reservation `b1` |
| 5 | **commits ✓** | **commits ✓** |

Both succeed. There is no write conflict, because they wrote **different documents** — the
database has nothing to collide on. The transaction supplied atomicity, which was never
the missing ingredient; the rule needed mutual exclusion.

Making it correct on MongoDB means manufacturing contention by hand: every booking attempt
must first `$inc` a counter on the rental unit document, purely so concurrent writers
provoke a `WriteConflict`. That works — but the invariant then lives in a convention every
future write path has to remember. With the constraint, someone who has never read this
file *cannot* insert a double booking.

Preferring the first is the decision. Deleting the retry loop, the lock-target field, and
this entire category of reasoning from the codebase is the dividend.

Three secondary wins came with it: `date` columns have no timezone component (see
[the timezone model](#the-timezone-model)); real foreign keys; and *less* infrastructure,
not more — Mongo transactions need a single-node replica set with an automatic
`rs.initiate()` and a healthcheck to wait on, where Postgres is an image and three
environment variables.

### And it is demonstrated, not asserted

- `reservations.concurrency.integration.test.ts` fires **20 simultaneous** `POST`s at one
  slot and asserts exactly one `201`, nineteen `409`s, and exactly one confirmed row in
  the table. A companion case proves bookings for *different* units all still succeed
  concurrently — the constraint is per-unit, not a global lock.
- `schema.integration.test.ts` attempts the overlapping insert in **raw SQL**, bypassing
  the service layer entirely, and asserts Postgres rejects it with SQLSTATE `23P01`. That
  is what shows the guarantee belongs to the database rather than to application code a
  future change could route around.

---

## Quickstart

```bash
docker compose up --build
```

|  |  |
| --- | --- |
| Web app | <http://localhost:8080> |
| API | <http://localhost:5006/v1> |
| API docs (Swagger UI) | <http://localhost:5006/v1/docs> |
| Health | <http://localhost:5006/health> |
| Postgres | `localhost:5433` — `booking` / `booking` / `booking` |

The API applies its schema and seeds the database on boot when it is empty, so the
dashboard has meaningful data immediately. The browser only ever talks to the `web`
service, which serves the built SPA and reverse-proxies `/v1` to the API, so everything is
one origin and CORS is never on the critical path.

> **Verification status — please read.** `docker compose up` itself was **not executed on
> the development machine**: it has no `docker` binary and no Compose provider (bare
> `podman` only). What *was* verified, and how:
>
> - **Both image build stages**, reproduced step-by-step in a clean directory — `npm
>   install` and both workspace builds run exactly as the images would. This found and
>   fixed three build-breaking bugs.
> - **The `web` container, run for real** under podman against a stub upstream: nginx
>   starts with no API present, serves the SPA and its deep-link fallbacks, and forwards
>   `/v1` paths and query strings to the API intact. This found and fixed two more bugs.
> - **The API**, by running the compiled build against a real Postgres and exercising every
>   endpoint with `curl`.
>
> What remains genuinely unproven is the three services being brought up *together* by
> Compose — service startup ordering, the healthcheck gate, and the compose network itself.
> See [Known gaps](#known-gaps-and-honest-limitations). I would rather state that than
> imply the whole path was tested.

### Running it without Docker

```bash
npm install                 # links the three workspaces and builds @booking/shared
docker compose up -d db     # or any Postgres 16 on :5433

cp backend/.env.example backend/.env
npm run dev --workspace @booking/backend      # API on :5006
npm run dev --workspace @booking/frontend     # Vite on :5173, proxies /v1 to :5006
```

`npm run dev` runs the API from source via `tsx`. To run the compiled build instead, use
`npm run build --workspace @booking/backend` first — `dist/` goes stale relative to `src/`
and `npm start` will not rebuild it for you.

Seeding is also available on demand: `npm run seed --workspace @booking/backend`, with
`-- --force` to wipe and re-seed. `SEED_ON_STARTUP=false` disables the boot-time seed.

---

## Architecture

```text
shared/     @booking/shared — the API contract, imported by both sides
            Zod schemas → inferred TS types → the OpenAPI document
backend/    Express 4 + TypeScript. routes → services → repositories → pg
frontend/   Vite + React + TypeScript, TanStack Query + Zustand + Tailwind
```

npm workspaces, so the contract is a real dependency rather than a copied file. The Zod
schemas that reject a malformed request are the same objects the client validates its
forms against and the same objects the OpenAPI document is generated from. A field cannot
be renamed on one side only.

**Backend layering.** Routes parse and serialise; services hold business rules;
repositories hold *all* SQL and nothing else. Every query is parameterised — there is no
string interpolation into SQL anywhere, including `LIMIT`/`OFFSET`. Errors are thrown as
typed `AppError`s and translated into the wire envelope in exactly one middleware, so no
route can invent its own failure shape.

**Frontend layering.** Container/presentational split throughout: stateful containers
fetch and orchestrate, dumb views take props and render. TanStack Query owns everything
that came from the API (including the cache invalidation that makes a new booking appear
on the dashboard without a refresh); Zustand owns only genuine client state — filters,
selection, which modal is open. Every network call goes through one typed `apiClient`.

**Why hand-written SQL over an ORM.** The schema is two tables. The deciding factor is the
exclusion constraint: it is the most important line in the project and most ORMs cannot
express it — Prisma would need a raw SQL migration for it regardless, so the abstraction
would not be abstracting the part that matters. Keeping the SQL visible means the booking
rule is legible in `schema.sql` rather than reconstructed from decorators.

---

## The overlap rule

The interval is **half-open**: `[startDate, endDate)`. `startDate` is inclusive
(check-in), `endDate` is exclusive (check-out). Two reservations conflict iff:

```text
A.startDate < B.endDate  AND  B.startDate < A.endDate
```

**Same-day turnover is not a conflict.** A stay ending `2026-03-10` and another starting
`2026-03-10` coexist — that is how hotels and Airbnb actually operate, and it is the most
commonly broken case, so it has its own tests. Only `confirmed` reservations block;
cancelling a reservation makes its dates immediately bookable, which is the `WHERE` clause
on the constraint.

### The application still checks — for the message, not the correctness

A raw constraint violation arrives as SQLSTATE `23P01` and says only "a constraint
rejected your row". It does not say *whose* booking was in the way, and the reservation
form needs to say *"Conflicts with Jane Doe (12–15 March 2026)"*. So every write path does
both, in this order:

```ts
// 1. Query overlapping reservations first — purely to build a useful 409 payload.
//    This SELECT is NOT what makes the operation safe; it races, and that is fine.
const conflicts = await findOverlapping(db, criteria);
if (conflicts.length) throw new BookingConflictError(conflicts);

// 2. Write. If a concurrent request slipped in between the SELECT and here, the
//    exclusion constraint rejects this write. Correctness never depended on step 1.
try {
  return await write();
} catch (err) {
  if (isExclusionViolation(err)) {            // SQLSTATE 23P01
    throw new BookingConflictError(await findOverlapping(db, criteria));
  }
  throw err;
}
```

**The check is for humans; the constraint is for correctness.** The test of the design:
deleting the pre-check entirely would degrade error messages and would not permit a single
double booking. The inverse — keeping the check and dropping the constraint — would look
identical in every single-threaded test and be wrong under load.

That 409 carries the conflicting reservations in `details`, which is what lets the UI name
the blocking guest and their dates on the form itself rather than in a toast that
disappears.

---

## The timezone model

**Reservation dates are calendar dates, never instants.** Postgres `date` columns,
`"YYYY-MM-DD"` strings on the wire. No `Date` object is ever constructed from a reservation
date, on either side.

Storing a check-in as `2026-03-26T00:00:00Z` breaks the moment anyone is not in UTC: the
stay renders a day early in `UTC-5`, `new Date('2026-03-26')` and `new Date(2026, 2, 26)`
disagree by up to a day, and "is this unit occupied today?" quietly becomes "according to
the server's clock". None of that shows up in development, where the developer and the
server share a timezone. All of it shows up in production. A `date` column has no time and
no offset, so there is nothing for anything to be shifted by — the bug is excluded by the
column type rather than by everyone remembering a convention.

One line keeps it that way end to end:

```ts
pg.types.setTypeParser(1082, (value: string) => value);  // 1082 = OID of `date`
```

Without it node-postgres parses `date` into a JS `Date` and reintroduces the exact bug the
column type eliminates. It has its own test.

`createdAt` / `updatedAt` are the deliberate exception — those genuinely *are* instants, so
they are `timestamptz` and serialize as ISO 8601. *When a row was written* is a moment;
*when a guest arrives* is a date on a calendar. Conflating the two is the original error.

### Every date is local to the property

Like an airline ticket that says "departs 14:30" without naming a zone. Nobody converts
those, because the rule that matters is the one in force where you are going.

**So no timezone comparison exists anywhere in this system.** The UI does not reconcile the
viewer's date against the unit's, does not warn about differences, and does not convert
anything. It renders the stored string.

The single exception is a *conversion*, not a comparison: the dashboard's occupied/vacant
badge has to know what day it currently is **at the property**. Every rental unit carries a
required IANA `timezone` (never a fixed offset, so the tz database handles DST and
political changes), and one expression resolves it per row:

```sql
(now() AT TIME ZONE ru.timezone)::date AS local_date
```

Without it a Los Angeles flat reads *vacant* at 08:00 Stockholm time while the guest is
still asleep in it. The dashboard echoes that `localDate` back so the calculation is
inspectable rather than opaque, and **the client sends no date at all** — which makes the
endpoint smaller *and* more correct.

Verified live: at the instant `2026-08-27T13:00:00Z`, the seeded `Pacific/Auckland` unit
reports `localDate: 2026-08-28` while every other unit reports `2026-08-27`.

---

## API summary

Base URL `/v1`. Full request/response schemas at `GET /v1/docs`; the versioning and error
conventions are written up in [`backend/API.md`](./backend/API.md).

### Rental units

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/v1/rental-units` | → 201 |
| `GET` | `/v1/rental-units` | `?page&limit`. Excludes soft-deleted |
| `GET` | `/v1/rental-units/:id` | → 200 / 404 |
| `PATCH` | `/v1/rental-units/:id` | Partial update of `name`, `timezone`, `address` |
| `DELETE` | `/v1/rental-units/:id` | Soft delete → 204 / 404 / 409 |

`DELETE` sets `status: 'deleted'` and is allowed only when the unit has zero non-cancelled
reservations, otherwise 409 `UNIT_HAS_RESERVATIONS`. Soft rather than hard, because
cancelled reservations may still reference the unit and keeping the row keeps those
historical references resolvable. Idempotent: deleting an already-deleted unit 404s, the
same as a nonexistent one.

### Reservations

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/v1/reservations` | → 201 / 400 / 404 / **409 `BOOKING_CONFLICT`** |
| `GET` | `/v1/reservations` | `?rentalUnitId&from&to&status&page&limit` |
| `GET` | `/v1/reservations/:id` | → 200 / 404 |
| `PATCH` | `/v1/reservations/:id` | Re-checks overlap, excluding itself |
| `DELETE` | `/v1/reservations/:id` | Cancels (`status: 'cancelled'`) → 204 |

`from`/`to` return reservations **overlapping** that window, not merely contained by it —
the same half-open rule, reusing the same `daterange && daterange` predicate as the
constraint rather than hand-written comparisons.

### Dashboard

`GET /v1/dashboard` → one entry per active unit: its `localDate`, an
`occupied`/`vacant` badge, the current guest, and the next check-in. The whole thing is
**one SQL statement** using `CROSS JOIN LATERAL` / `LEFT JOIN LATERAL` rather than a query
per unit — the loop version is a textbook N+1 whose latency grows with the portfolio.

### Error envelope

Every non-2xx response:

```json
{ "error": "Human-readable message", "code": "MACHINE_CODE", "details": [] }
```

Clients branch on the stable `code`, never on the status. Codes: `VALIDATION_ERROR` (400),
`NOT_FOUND` / `RENTAL_UNIT_NOT_FOUND` (404), `BOOKING_CONFLICT` /
`UNIT_HAS_RESERVATIONS` (409), `RATE_LIMITED` (429), `INTERNAL_ERROR` (500). Internal
errors never leak a stack trace or SQL to the client — there is a test that asserts it.

---

## Tests

```bash
npm run typecheck --workspaces        # all three workspaces

npm test --workspace @booking/shared              # 192 — schemas, date helpers
npm run test:unit --workspace @booking/backend    # 132 — services, middleware, mappers
npm test --workspace @booking/frontend            # 174 — RTL, hooks, store slices

# Integration: needs a real Postgres. `docker compose up -d db` first.
DATABASE_URL=postgres://booking:booking@localhost:5433/booking \
  npm run test:integration --workspace @booking/backend   # 148
```

**646 tests, all passing**, against Node 20.

Integration tests run against a **real** Postgres, never a mock. Mocking would be actively
misleading here: the exclusion constraint *is* the booking rule, so a test against a fake
database would verify nothing that matters. Use the `test:integration` script rather than
invoking Vitest directly — it carries `--no-file-parallelism`, without which the suites
race on the shared database.

Beyond the concurrency and raw-SQL bypass tests described above, the suite covers the
boundaries where the half-open rule earns its keep: a guest checking out today (vacant), a
guest checking in today (occupied), a back-to-back changeover, cancelled reservations being
ignored by both occupancy and next-check-in, `PATCH` not conflicting with itself, and
impossible calendar dates like `2026-02-31` that a naive regex waves through. One frontend
test runs under a `TZ` far from its fixture data and asserts the rendered dates are
unchanged — that is what catches an accidental `new Date()` creeping into a formatter.

---

## Known gaps and honest limitations

**Compose has not brought the three services up together.** See the note under
[Quickstart](#quickstart) for what was verified instead. Doing that verification the hard
way surfaced five genuine bugs, all fixed and re-verified.

Reproducing the image build stages by hand in a clean tree found three:

1. `npm install` failed in the image because `@booking/shared`'s `prepare` script compiles
   the package, and only its `package.json` had been copied at that point. (`--ignore-scripts`
   does not help — npm 10 still runs a workspace's `prepare`.)
2. `tsconfig.base.json`, which both workspace tsconfigs `extend`, was never copied into the
   build context.
3. `vite build` failed on the linked `@booking/shared` package: it compiles to CommonJS,
   and Vite's bundled commonjs plugin defaults to `include: [/node_modules/]`, which a
   symlinked workspace path does not match. Dev and Vitest transform on demand and never
   hit it, so the failure appeared only in a production build.

Running the compiled server found a fourth: the boot-time seed was loaded through a
dynamic `import()` of an extensionless specifier, which under CommonJS output goes through
Node's ESM resolver, throws `ERR_MODULE_NOT_FOUND`, and was swallowed by a `catch`. The
compiled image booted with an empty dashboard while `tsx` and Vitest seeded correctly. It
is now a static import, so a broken path is a compile error.

Running the `web` container for real found a fifth, which was really two:
`proxy_pass http://api:5006;` with a literal hostname makes nginx resolve the name while
*parsing* its config and abort with `host not found in upstream` — so the UI container
would fail to start whenever the API was not already resolvable, and `depends_on` without
a health gate was not the safe choice its comment claimed. Reaching the upstream through a
variable plus a `resolver` defers DNS to request time and fixes it. The resolver address
itself then cannot be hardcoded either: Docker's embedded DNS is `127.0.0.11` and Podman's
is not, so the config ships as an nginx *template* using `${NGINX_LOCAL_RESOLVERS}`, taken
from the container's own `/etc/resolv.conf`. That mechanism is opt-in behind
`NGINX_ENTRYPOINT_LOCAL_RESOLVERS`, which the Dockerfile sets — without it the placeholder
reaches nginx unsubstituted and the container dies at boot.

Also worth stating plainly:

- **No authentication or authorization.** Deliberate — designed and documented, not built.
  See below.
- **The soft-delete guard is not a constraint.** Unlike overlap, "no active reservations
  for a deleted unit" cannot be expressed as a Postgres constraint without a trigger or a
  materialised counter, so it is a transactional `SELECT … FOR UPDATE` check. A booking
  that does not take that row lock could still commit between the count and the update.
  The window is small and the outcome benign, and the contrast is the point: the overlap
  rule got a constraint because one was available; this one gets a documented
  approximation because one was not.
- **Rate limiting is in-memory**, therefore per-process. With more than one replica the
  effective limit is multiplied by the replica count. Production wants the Redis store.
- **`db/schema.sql` is applied wholesale on boot**, guarded by an advisory lock so two
  replicas cannot race. That is correct only while the schema moves forward from empty;
  the first `ALTER TABLE` makes it the wrong tool.

---

## What I'd do with more time

**Authentication and authorization.** The design, deprioritised against the core booking
flow rather than overlooked: JWT bearer tokens from a login endpoint; an
`Account`/`Organization` entity that owns rental units, with reservations inheriting
access through their unit; and authorization applied **at the query layer**, not just the
route layer — every repository method scoped to the caller's account, so a missing route
guard cannot leak another tenant's data. `CORS_ORIGIN: '*'` would have to go at the same
time: a wildcard origin and `credentials: true` are mutually exclusive in the CORS spec
precisely because that combination is the vulnerability.

**Cursor pagination.** Offset pagination is what is built — simple, predictable, and it
supports the "page 3 of 7" affordance the UI has. It has two real costs: the `count(*)` is
a full scan of the matching rows, and a concurrent insert can shift rows across a page
boundary so an item is seen twice or not at all. Keyset pagination on `(start_date, id)`
fixes both and is what a growing dataset wants. The list envelope would change shape, so
it is a `/v2` conversation rather than a patch.

**Versioned migrations.** `node-pg-migrate` or similar, with an `applied_migrations` table,
so every schema change is reviewable, replayable, and reversible. The single idempotent
schema file is honest for a build this size and stops being adequate the moment a column
needs altering rather than adding.

**Observability.** Structured JSON logs (`pino`) carrying the request id that
`middleware/requestId.ts` already threads through every request and error; OpenTelemetry
traces spanning HTTP handler → service → query, which is what turns "the dashboard feels
slow" into a specific `LATERAL` join; and RED metrics per route. The dashboard query in
particular deserves a latency histogram, since it is the one endpoint whose cost scales
with portfolio size.

**CI.** Typecheck, unit tests, and integration tests against a Postgres service container
on every push — the integration suite is the half that would actually catch a regression
in the booking rule, and it needs a real database, which is exactly what a service
container is for. Plus a `docker compose up` smoke test in the pipeline, which would have
caught all four of the bugs listed above without anyone reproducing a build by hand.

**Beyond that**, gated behind the core being polished rather than competing with it: an
MCP server over the API (nearly free once the OpenAPI document exists), Storybook for the
`components/ui` primitives (the presentational split is already the precondition), and
Playwright end-to-end tests.
