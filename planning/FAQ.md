# Design FAQ — Booking System Assignment

Decisions made before implementation, and the reasoning behind them. This doubles as
prep material for the interview discussion (the brief explicitly asks for the overlap
rule, and reasoning about design tradeoffs, to be documented).

---

> ## ★ The two decisions that matter most
>
> Everything else in this document is ordinary engineering judgement. These two are the
> ones where the obvious implementation is **silently wrong** — and both were resolved
> the same way: by making the invalid state *unrepresentable in the schema* rather than
> defended against in application code.
>
> This is also why the project runs on **PostgreSQL rather than the scaffolded
> MongoDB** — the one significant deviation from the starting repo, and the decision
> that both of the following depend on.
>
> **1. [Double bookings are prevented by the database, not by application logic](#-concurrency--why-overlap-prevention-belongs-in-the-database)**
>
> A single `EXCLUDE USING gist` constraint makes overlapping reservations impossible to
> insert, under any level of concurrency. No locks, no retry loops, no reasoning about
> isolation levels. This matters because the *application-level* version of this check
> is deceptively hard: on MongoDB, wrapping it in a transaction looks airtight and still
> permits double bookings, for reasons worth understanding.
>
> **2. [Reservation dates are calendar dates, never instants](#-timezones--why-reservation-dates-are-never-timestamps)**
>
> Storing `2026-03-26T00:00:00Z` for a check-in breaks the moment a user isn't in UTC:
> the stay renders a day early, and "is this unit occupied today?" starts depending on
> the server's clock. Postgres `date` columns have no timezone component at all, so the
> bug is excluded by the column type rather than by everyone remembering.
>
> The corollary matters just as much: **every date is local to the property**, the way
> an airline ticket's departure time is. Nothing is ever converted for a viewer, so no
> timezone comparison exists in the system at all — the unit's zone is used once, to
> resolve what day it is *there* for the occupied/vacant badge.
>
> Both are demonstrated by tests, not merely asserted here — see
> [Priority 1](#priority-1--the-concurrency-test).

---

## Q: Can a new reservation check in on the same date an existing one checks out?

**A: Yes — same-day turnover is allowed.**

Reservations use a half-open interval `[startDate, endDate)`. A stay occupies the unit
through the morning of `endDate`, so a new reservation starting on that same date does
not overlap. This matches how Airbnb/hotels actually operate (standard checkout/check-in
turnover) and is the interpretation guests would expect.

Two reservations A and B overlap iff `A.start < B.end AND B.start < A.end`. Equality at
the boundary is explicitly **not** an overlap.

## Q: MongoDB (scaffolded) or switch to a relational database?

**A: Switch to PostgreSQL.** The brief explicitly permits it ("feel free to switch this
out with another database if you want"), and this problem is close to the textbook case
for a relational database.

The core requirement — *no two confirmed reservations for one unit may overlap* — is a
**constraint**, and Postgres can express it declaratively:

```sql
EXCLUDE USING gist (
  rental_unit_id WITH =,
  daterange(start_date, end_date, '[)') WITH &&
) WHERE (status = 'confirmed')
```

That single clause *is* the entire booking rule, including the half-open interval and
the cancelled-reservation exemption. MongoDB has no equivalent, so the same guarantee
has to be reconstructed in application code — which is subtle enough to get wrong
without noticing (see
[the concurrency section](#-concurrency--why-overlap-prevention-belongs-in-the-database)).

Three secondary wins:

1. **`date` columns have no timezone component**, which eliminates an entire bug class
   by construction rather than by convention.
2. **Real foreign keys.** `reservations.rental_unit_id REFERENCES rental_units(id)`
   gives referential integrity for free, where Mongo needs hand-written guards.
3. **Simpler infrastructure, not harder.** Mongo transactions require a single-node
   replica set with automatic `rs.initiate()` and a healthcheck to wait on — genuinely
   fiddly. Postgres is an image and three environment variables. Switching *reduced*
   setup work.

**What the switch does not cost:** the analysis of why the MongoDB approach is
treacherous is retained below, because understanding *why* a transaction is insufficient
is what justifies the choice. The decision is the point, not an avoidance of the harder
path.

## ★ Concurrency — why overlap prevention belongs in the database

> **The single most important technical decision in the project**, and the one most
> likely to be got wrong by someone who believes they've handled it.

**A: A `daterange` exclusion constraint enforces the rule; the application only produces
good error messages.**

### The rule, as schema

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE reservations (
  id             uuid PRIMARY KEY,
  rental_unit_id uuid NOT NULL REFERENCES rental_units(id),
  guest_name     text NOT NULL,
  start_date     date NOT NULL,
  end_date       date NOT NULL,
  status         text NOT NULL DEFAULT 'confirmed',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reservation_valid_range CHECK (end_date > start_date),

  -- The booking rule itself. `[)` is the half-open interval: a stay ending on the 10th
  -- and one starting on the 10th do not overlap, so same-day turnover is permitted.
  -- The WHERE clause is the cancellation exemption — cancelled rows stop blocking.
  CONSTRAINT reservation_no_overlap EXCLUDE USING gist (
    rental_unit_id WITH =,
    daterange(start_date, end_date, '[)') WITH &&
  ) WHERE (status = 'confirmed')
);
```

Three things are worth noticing about this:

1. **It is the complete rule.** The half-open interval, the per-unit scoping, and the
   cancelled-reservation exemption are all in those five lines. There is no second
   definition of "overlap" anywhere in the codebase to drift out of sync.
2. **`btree_gist` is required** because the constraint mixes an equality test on a
   `uuid` with a range-overlap test; the stock GiST operator classes don't cover
   equality on scalar types.
3. **It holds under any concurrency.** Not "usually", not "assuming the application
   behaves" — two transactions cannot both commit overlapping rows, because the second
   blocks on the index and then fails. There is no isolation level to configure, no
   lock to remember to take, and no race window to reason about.

### Defense in depth: the application still checks

The constraint guarantees correctness, but a raw violation surfaces as SQLSTATE `23P01`
with no indication of *which* booking conflicted — and the UI needs to say *"conflicts
with Jane Doe, 12–15 March"*.

So the write path does both:

```ts
// 1. Query overlapping reservations first — purely to build a useful 409 payload.
//    This SELECT is NOT what makes the operation safe; it races, and that's fine.
const conflicts = await findOverlapping(client, { rentalUnitId, startDate, endDate });
if (conflicts.length) throw new BookingConflictError(conflicts);

// 2. Insert. If a concurrent request slipped in between the SELECT and here, the
//    exclusion constraint rejects this write. Correctness never depended on step 1.
try {
  return await insertReservation(client, reservation);
} catch (err) {
  if (isExclusionViolation(err)) {           // SQLSTATE 23P01
    const raced = await findOverlapping(client, { rentalUnitId, startDate, endDate });
    throw new BookingConflictError(raced);
  }
  throw err;
}
```

The division of responsibility is the part worth articulating: **the check is for
humans, the constraint is for correctness.** The pre-check is a UX affordance that is
allowed to be racy; the constraint is the guarantee that cannot be. Deleting the
pre-check would degrade error messages without ever permitting a double booking.

`PATCH` takes the identical path when dates change — no self-exclusion logic is needed,
because updating a row doesn't conflict with its own current values.

### Why this was worth switching databases for

The comparison is the actual justification, and it's the interesting half of the
answer. On MongoDB, the intuitive implementation looks airtight and is not:

```ts
// WRONG — looks safe, isn't.
await session.withTransaction(async () => {
  const conflicts = await reservations.find({ /* overlap query */ }, { session }).toArray();
  if (conflicts.length) throw new BookingConflictError(conflicts);
  await reservations.insertOne(newReservation, { session });
});
```

MongoDB transactions provide **snapshot isolation, not serializability**. Two
simultaneous requests for the same slot interleave like this:

| Step | Transaction A | Transaction B |
| --- | --- | --- |
| 1 | reads overlaps → none found | |
| 2 | | reads overlaps → none found *(A hasn't committed)* |
| 3 | inserts reservation `a1` | |
| 4 | | inserts reservation `b1` |
| 5 | **commits ✓** | **commits ✓** |

Both succeed. There is no write conflict, because they wrote **different documents** —
the database has nothing to collide on. The transaction supplied atomicity, which was
never the missing ingredient; what the rule actually required was mutual exclusion.

Making it correct on MongoDB means manufacturing contention by hand — every booking
attempt for a unit must first write to one shared document, so the database has
something to serialize on:

```ts
// The MongoDB fix, for reference: $inc a counter on the rental unit inside the
// transaction, purely so concurrent bookings for that unit provoke a WriteConflict
// and Mongo aborts all but one. Correct, but the correctness lives in a convention
// that every future write path has to remember.
await rentalUnits.findOneAndUpdate(
  { id: rentalUnitId, status: 'active' },
  { $inc: { bookingSeq: 1 } },
  { session }
);
```

That works. But compare what each version means for the *next* engineer: with Postgres,
someone who has never read this document cannot insert a double booking. With the
MongoDB version, they can — by writing a new code path that forgets the counter bump.
One approach makes the invariant a property of the data; the other makes it a property
of everyone's discipline.

Preferring the first is the decision. The fact that it also deletes the retry loop, the
lock-target field, and this entire class of reasoning from the codebase is the dividend.

### Proving it

An unasserted claim is worth nothing, so this is
[Priority 1](#priority-1--the-concurrency-test): fire ~20 simultaneous
`POST /v1/reservations` at one slot, assert **exactly one** `201` and that the table
holds exactly one confirmed reservation. A companion case proves bookings for
*different* units still succeed concurrently — the constraint is per-unit, not a global
lock.

A third test drops to raw SQL and attempts the overlapping insert directly, bypassing
the application entirely, to demonstrate that the guarantee is the database's and not
the service layer's.

### Alternatives considered

- **Application-level locking on MongoDB** (the `bookingSeq` pattern above) — correct,
  but relocates a data invariant into application convention.
- **`SELECT … FOR UPDATE` on the rental unit row**, then check-and-insert. Works on
  Postgres too, and is the right pattern when a constraint *can't* express the rule —
  but here one can, so this is strictly more code for a weaker guarantee.
- **Unique index on `(rental_unit_id, start_date)`** — prevents identical start dates
  only, not overlap. Insufficient, and the kind of near-miss that looks like a fix.

## ★ Timezones — why reservation dates are never timestamps

> **The second decision where the obvious implementation is quietly broken.**

**A: Reservation dates are calendar dates — Postgres `date` columns, `"YYYY-MM-DD"`
strings on the wire. No `Date` object and no timezone conversion ever touches a
reservation date.**

### Why timestamps break

Storing a check-in as a timestamp — `2026-03-26T00:00:00Z` — seems harmless. It isn't:

- A guest booked for **26 March** displays as **25 March** to anyone in `UTC-5`, because
  midnight UTC is the previous evening locally.
- `new Date('2026-03-26')` parses as UTC midnight, but `new Date(2026, 2, 26)` parses as
  *local* midnight. The same date, off by up to a day, depending on which constructor
  someone reached for.
- "Is this unit occupied today?" silently becomes "occupied according to the server's
  clock", so the dashboard is wrong for the several hours a day where the server's date
  and the user's date disagree.
- Daylight-saving transitions make some days 23 or 25 hours long, so "add one night"
  stops being "add 86,400 seconds".

None of this shows up in development, where the developer and the server share a
timezone. All of it shows up in production.

### Dates as calendar facts

A check-in date is a **calendar fact** — "the guest has the flat on the 26th" — not an
instant on a timeline. It is modeled as what it is:

- **Stored** as Postgres `date`. This is the load-bearing choice: `date` has no time and
  no timezone component, so there is no offset for anything to be shifted by. The bug is
  excluded by the column type, not by everyone remembering a convention.
- **Compared** by the database, in `date` arithmetic — including inside the
  `daterange(start_date, end_date, '[)')` exclusion constraint, which means the
  overlap rule and the storage type share one definition of what a day is.
- **Transmitted** as `"YYYY-MM-DD"` strings in JSON, validated by Zod on the way in.
  The `pg` driver is configured to return `date` columns as plain strings rather than
  JavaScript `Date` objects — otherwise the driver reintroduces exactly the timezone
  bug the column type just eliminated.
- **Compared in TypeScript**, where needed, as strings. For zero-padded ISO dates
  lexicographic order *is* chronological order, so `startDate < endDate` is a correct
  comparison with no parsing involved.
- **Never converted.** There is no timezone handling code, because there is nothing to
  handle.

`createdAt` / `updatedAt` are the deliberate exception: those genuinely *are* instants,
so they are `timestamptz` and serialize as ISO 8601. The distinction is the whole point
— *when a row was written* is a moment in time; *when a guest arrives* is a date on a
calendar. Conflating the two is the original error.

### Where "today" comes from — the rental unit, not the viewer

**All dates in this system are local to the property, always.** A reservation on
`2026-03-26` means the 26th *at the flat* — there is no other reading, and no
conversion is ever applied to display it.

This is the same convention as an airline ticket that says "departs 14:30" without
naming a timezone, or an Airbnb booking that says "Check-in Mar 26". Nobody converts
those into their own zone, because the rule that matters is the one in force where
they're going. Check-in and checkout happen on the property's clock; a guest travelling
there is subject to it by definition. The convention needs no explanation because
everybody already uses it.

The consequence is that **no timezone comparison exists anywhere in the system.** The
UI does not reconcile the viewer's date against the unit's, does not warn about
differences, and does not convert anything. It displays dates.

One thing still needs the unit's zone, and it is a *conversion*, not a comparison: the
dashboard's occupied/vacant badge has to know what day it currently is at the property.

- Every rental unit carries a **`timezone`** — a required IANA identifier
  (`Europe/Stockholm`, `America/Los_Angeles`), never a fixed offset like `+01:00`, so
  DST transitions and political timezone changes are handled by the tz database rather
  than by us.
- "Today" is resolved **per unit**, in that unit's zone, by a single expression that
  composes into the existing dashboard query:

  ```sql
  (now() AT TIME ZONE ru.timezone)::date AS local_date
  ```

- The client sends nothing. The dashboard endpoint needs no date parameter at all,
  which makes the API smaller *and* more correct — the rare combination worth taking.

Without that one expression the badge falls back to the server's clock, and a Los
Angeles flat reads **vacant** at 08:00 Stockholm time while the guest is still asleep
in it. That failure is the field's entire justification; everything downstream of it
just renders dates.

A `?now=` parameter survives for tests only, so the dashboard's boundary cases
(checkout today, back-to-back changeover) can be driven deterministically.

**The timezone is editable after creation.** It is required at creation, but `PATCH`
treats it as an ordinary field. The reasoning is worth stating because it follows from
the decision above: since reservation dates are stored as *calendar dates*, the
timezone never participates in interpreting them — `2026-03-26` means the 26th whatever
the unit's zone says. Changing it reinterprets no stored data; it changes one derived
display value, until the next request.

Freezing it would therefore protect nothing, while creating a trap: a mis-picked zone
would be permanently uncorrectable, because [units with reservations cannot be
deleted](#q-hard-delete-or-a-status-field-for-cancelling-a-reservation) either. Two
individually reasonable rules combining into a dead end is worse than either rule is
good. (This would change if check-in/checkout *times* were ever added — the timezone
would start participating in real comparisons, and would then deserve versioning.)

## Q: How deep does auth/authz go?

**A: Design + document only — no auth code implemented.**

Given the ~4 hour time-box, auth was deprioritized in favor of the core booking flow
(this is a deliberate tradeoff, called out explicitly since it's an interview topic).
The intended design, to describe in the interview:

- JWT bearer auth, issued by a login endpoint.
- A rental-unit-owning `Account`/`Organization` entity; every rental unit belongs to
  one. Reservations inherit access through their rental unit.
- Authorization middleware scopes all queries to the caller's account — no
  cross-account reads/writes, checked at the query layer, not just the route layer.

## Q: How should the assignment's ~4h budget be balanced against the long interview topic list (testing, security, perf, versioning, infra...)?

**A: Depth on the core flow, written reasoning for the rest.**

The booking flow (create/edit reservation, conflict detection, dashboard) and the
overlap-safety mechanism get full implementation + tests, since that's the part being
directly exercised. Topics like infra hosting, API versioning, and performance/scaling
get a paragraph of reasoning (in README/code comments) rather than implementation,
since building them out for a toy dataset wouldn't demonstrate anything beyond what the
written reasoning already shows.

## Q: Pagination/filtering style for `GET /reservations`?

**A: Offset/limit with query-param filters.**

`GET /reservations?rentalUnitId=&from=&to=&page=&limit=`. Simple, predictable, and easy
to demo. Cursor-based pagination is the more scalable choice for large/growing
datasets, but that's not this problem — noted as a tradeoff, not implemented.

## Q: ORM, query builder, or raw SQL?

**A: The `pg` driver with hand-written SQL, behind a repository layer.**

The schema is three tables. An ORM would add a dependency, a migration toolchain, and a
layer of indirection to save writing perhaps two hundred lines of straightforward SQL.

The deciding factor is the exclusion constraint. It's the most important line in the
project, and most ORMs can't express it — Prisma in particular would need a raw SQL
migration for it regardless, so the abstraction wouldn't even be abstracting the part
that matters. Keeping the SQL visible means the booking rule is legible in the schema
file rather than reconstructed from decorators.

Queries live in `*.repository.ts` modules and nowhere else, so swapping in a query
builder later is a contained change. Parameterised queries throughout — string
interpolation into SQL appears nowhere, which is also the honest answer to the
injection half of the "security aspects" topic.

*Considered:* Kysely (type-safe, no codegen — the choice if the schema grew), Drizzle,
Prisma (heaviest, and can't express the constraint).

## Q: Frontend tooling?

**A: Vite + React + TypeScript.**

Matches the backend's TypeScript, minimal scaffolding overhead, no SSR/SEO need that
would justify Next.js.

## Q: Hard delete or a status field for cancelling a reservation?

**A: Status field.** `status: 'confirmed' | 'cancelled'` on the reservation. Preserves
history (a manager can see what used to be booked), and a cancelled reservation simply
gets excluded from the overlap query rather than needing a delete + separate archive.

## Q: Error response shape?

**A: A custom `{ error, code }` envelope**, e.g.:

```json
{ "error": "Reservation overlaps an existing booking", "code": "BOOKING_CONFLICT" }
```

Chosen over RFC 7807 `problem+json` for simplicity — a mobile/web client branches on
the stable `code` string, and the assignment doesn't call for standards compliance,
just clear, consistent error feedback on conflicts.

## Q: Testing scope?

**A: Unit tests for overlap/validation logic, plus integration tests** that exercise the
real database (the Postgres container from docker-compose, not a mock). Mocking here
would be actively misleading: the exclusion constraint *is* the booking rule, so a test
against a fake database would verify nothing that matters.

The key one is a **parallel-request test**: fire ~20 simultaneous
`POST /v1/reservations` at the identical slot on the same unit, and assert exactly one
`201` and nineteen `409`s. See [Priority 1](#priority-1--the-concurrency-test) below.

## Q: Address field — plain string or structured object?

**A: Structured object** — `{ street, city, postcode, country }`. Chosen over a plain
string for more realistic data modeling (an explicit interview topic), even though
none of the fields are queried/filtered on in this assignment's scope.

## Q: Is API versioning implemented?

**A: Yes — a `/v1` URI prefix** (e.g. `/v1/reservations`). Cheap to add now and avoids
a later migration; the alternative (header-based versioning) was considered but adds
complexity with no benefit at this scale.

## Q: State management — Zustand, or a server-cache library?

**A: TanStack Query for server state, Zustand only for genuinely client state.**

Nearly everything in this app is server state: rental units, reservations, dashboard
status. Putting that in Zustand means hand-rolling refetching, invalidation, and
staleness — effectively reimplementing a cache, and then writing tests against the
reimplementation.

So the split is deliberate:

- **TanStack Query** owns anything that came from the API, including cache
  invalidation after a successful reservation write (which is what makes the dashboard
  refresh correctly).
- **Zustand** owns actual client state: the dashboard's date-range filter, the
  selected rental unit, form/modal state.

Unit tests then target the Zustand slices, where the logic is genuinely mine and worth
testing, rather than asserting things about a cache someone else already wrote.

## Q: How are frontend components structured?

**A: Presentational/container split** — components that hold state or talk to the API
stay separate from "dumb" view components that take props and render.

Costs nothing, makes the components independently testable, and it's the part of the
frontend the brief actually cares about ("more interested in how you structure the
application than in visual polish"). It's also the precondition for Storybook being
worth anything, if that stretch item happens.

---

## Scope & priority order

Where the time actually goes, in order. The rule I'm applying: go **deeper** on what
the brief names rather than **wider** into things it doesn't. The brief calls out the
overlap rule, conflict error handling, trade-off comments, and concurrency behaviour
by name — so those get real implementation, and the peripheral ideas get gated behind
them rather than competing with them.

### Priority 1 — the concurrency test

Fire ~20 simultaneous `POST /v1/reservations` at the identical slot on the same rental
unit; assert exactly one `201` and the rest `409`, and that the database holds exactly
one confirmed reservation. Roughly 30 lines of test code. A companion case proves
bookings for *different* units still succeed concurrently.

This is the top priority because it converts
[the concurrency design](#-concurrency--why-overlap-prevention-belongs-in-the-database)
from a claim into a demonstration. "Overlaps are impossible" and "here is the test that
proves twenty racing clients produce one booking" are very different statements, and
only one survives scrutiny — particularly since the *naive* implementation passes every
single-threaded test too.

Worth adding: a test that bypasses the service layer entirely and attempts the
overlapping insert in raw SQL, proving the guarantee belongs to the database rather
than to application code that a future change could route around.

### Priority 2 — date-only modeling and timezones

Implementing
[dates as calendar facts](#-timezones--why-reservation-dates-are-never-timestamps)
throughout: Postgres `date` columns, `"YYYY-MM-DD"` strings on the wire, the `pg` driver
configured not to coerce dates into JavaScript `Date` objects, and the dashboard
resolving "today" per rental unit in that unit's own timezone rather than the viewer's.

The test that matters here is the shared date helpers' boundary coverage — touching
intervals, identical ranges, single-night stays — plus rejecting impossible calendar
dates like `2026-02-31` that a naive regex would wave through.

### Priority 3 — one-command startup, seeded

`docker compose up` brings up the API, Postgres, and the frontend, with a
seed script that populates a few rental units and reservations (including one occupied
unit, one vacant, and one with an upcoming check-in, so the dashboard has something
meaningful to show immediately).

Startup friction is a multiplier on everything else in the repo — nothing else gets
looked at if the thing doesn't run.

### Priority 4 — conflict errors surfaced end-to-end

The typed `code` from the error envelope (`BOOKING_CONFLICT`) drives a specific, human
message on the reservation form — ideally naming the conflicting dates — rather than a
generic "something went wrong". The brief asks for clear conflict feedback on both the
API and UI side, so the two halves are built as one path.

### Priority 5 — OpenAPI specification

A spec for the API, so it documents itself and is trivial to integrate against from
either a web or mobile client. This covers the "Documentation" interview topic, and
makes the request/response contract (including the error envelope) explicit rather
than something a consumer has to infer.

It also keeps the MCP option open cheaply — see below.

### Priority 6 — dashboard edge cases

The interesting logic isn't "occupied vs vacant", it's the boundaries:

- a guest checking out **today** (unit is occupied this morning, vacant tonight)
- back-to-back stays (today's checkout and today's check-in are different guests)
- a unit with no upcoming reservation at all
- a reservation that was cancelled (excluded from both status and next-check-in)

These follow directly from the half-open interval rule at the top of this document, and
they're where that rule earns its keep.

### Stretch — only once the above is polished

**MCP server** over the API. Genuinely interesting, and near-free once the OpenAPI spec
exists since it's a thin wrapper over an already-documented contract. But it's
orthogonal to everything the brief asks about, so it's strictly a bonus that ships
after the core is solid — not something that competes with the priorities above for
time.

**Storybook** for the presentational building-block components. Useful as a
presentation aid when walking through component structure in the interview. Same
gating: a sparse, half-populated Storybook is worse than none, so it happens last or
not at all.
