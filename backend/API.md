# API reference

The machine-readable contract is the OpenAPI 3.1 document, generated from the same Zod
schemas that validate every request:

| | |
|---|---|
| Spec | `GET /v1/openapi.json` |
| Browsable docs | `GET /v1/docs` (Swagger UI) |
| Health | `GET /health` — deliberately unversioned; see below |

This file covers the two cross-cutting decisions a consumer needs before reading any
individual endpoint: **how the API is versioned**, and **what a failure looks like**.
Per-endpoint request/response shapes live in the generated document, because that is the
one place they cannot drift.

---

## The spec is generated, not written

`src/openapi/` builds the document from `@booking/shared` via
`@asteasolutions/zod-to-openapi`. The Zod objects that reject a bad request are the
objects the schema section is rendered from, so a change to validation changes the
published contract in the same commit. There is no second, hand-maintained description
of the API to fall out of step.

That is worth insisting on because a stale spec is worse than no spec: nothing executes
a document, so drift is invisible until a client integrates against a field that no
longer exists. Here the failure mode is impossible for anything a schema can express.

What a schema *cannot* express — which 404 code a missing rental unit produces, that
`DELETE` cancels rather than removes, that a malformed id is a 400 — is attached as
descriptions and examples, and those can still drift. They are kept pinned to real
response bodies for that reason, and `src/openapi/document.test.ts` asserts the parts
that matter: every endpoint present, every documented status code, and a populated
`BOOKING_CONFLICT` example.

---

## Versioning: `/v1` as a URI prefix

Every endpoint lives under `/v1`. The OpenAPI document declares `servers: [{ url: "/v1" }]`,
so paths inside it are written relative to that root.

**Why a URI prefix rather than a header** (`Accept: application/vnd.booking.v2+json` or an
`X-API-Version` header):

- **It is visible everywhere.** The version appears in access logs, in a `curl` command, in
  a browser address bar, and in a bug report someone pastes into Slack. A header-based
  version is invisible in exactly the places you look when something is wrong, and it is
  the first thing an intermediary strips or a client forgets.
- **A second version is a second mount, not a deployment event.** `/v2` can be added
  beside `/v1` in the same process — `createV1Router()` is already a factory — and both
  answer until `/v1` is retired. Header negotiation puts both versions in one handler and
  makes every route responsible for branching.
- **It is cacheable and routable by default.** Two versions are two URLs, so a CDN, a
  reverse proxy, or a load balancer can treat them differently with no `Vary` header and
  no content negotiation logic.
- **The purist objection does not pay here.** The REST argument is that `/v1/reservations`
  and `/v2/reservations` name the same resource and so should share a URI, with the
  representation negotiated by header. That is coherent, and it buys nothing at this
  scale while costing discoverability on every request.

`GET /health` is deliberately **outside** `/v1` and outside the error envelope. It is an
infrastructure endpoint for Docker and orchestrators, not part of the client-facing
contract — versioning it would imply a compatibility promise that a liveness probe should
never make. It verifies the pool answers `SELECT 1` rather than merely that the process is
up, because "the process is running" is not the question an orchestrator is asking: an API
whose database is gone answers every real request with a 500 while a process-only check
reports healthy, so the container is never restarted and never pulled from the load
balancer.

**What counts as a breaking change** (and would require `/v2`): removing or renaming a
field, narrowing an accepted value, adding a required request field, or changing the
status code or `code` for an existing condition. Adding an optional request field, adding
a response field, or adding a new endpoint is not breaking — clients must ignore unknown
response fields.

---

## The error envelope

Every non-2xx response, without exception, has this shape:

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_CODE",
  "details": []
}
```

- **`code`** is the field to branch on. It is a closed, enumerable set (below), stable
  across releases.
- **`error`** is for humans — a log line, or a fallback message. It may change wording at
  any time; do not match on it.
- **`details`** is optional and **code-specific**. It is omitted entirely for codes that
  carry no payload, so treat its absence and an empty array as the same thing.

One place constructs this: `src/middleware/errorHandler.ts`. No route formats an error
response, which is why the shape cannot vary by endpoint.

### Codes

| Code | HTTP | Meaning | `details` |
|------|------|---------|-----------|
| `VALIDATION_ERROR` | 400 | Body, query, or path parameter failed validation | `[{ path, message }]` |
| `NOT_FOUND` | 404 | The resource does not exist, or is soft-deleted | — |
| `RENTAL_UNIT_NOT_FOUND` | 404 | A reservation references a nonexistent or deleted unit | — |
| `BOOKING_CONFLICT` | 409 | The dates overlap a confirmed reservation | the conflicting reservations |
| `UNIT_HAS_RESERVATIONS` | 409 | Cannot delete a unit with non-cancelled reservations | — |
| `RATE_LIMITED` | 429 | Too many requests | — |
| `INTERNAL_ERROR` | 500 | Unexpected failure | `[]` |

### Why a custom envelope rather than RFC 7807 `problem+json`

A client branches on one stable string. RFC 7807's `type` URI, `title`, `instance`, and
`application/problem+json` content type add ceremony that would be earned by a public,
multi-team API and is not earned by this one. The property that actually matters —
`code` is closed, enumerable, and exhaustively handleable — is present either way.

### Two codes worth explaining

**`NOT_FOUND` vs `RENTAL_UNIT_NOT_FOUND`** are deliberately distinct. A reservation write
names two ids, its own and its unit's, so a single 404 code would leave the caller
guessing which one was wrong. `RENTAL_UNIT_NOT_FOUND` lets a form say "that unit no longer
exists" instead of "not found".

Both also cover the soft-deleted case. A deleted rental unit reads identically to one that
never existed — the contract has no "deleted" state for a client to branch on, and leaking
the distinction would invite someone to build on it.

**`BOOKING_CONFLICT` carries the reservations it collided with**, and that payload is the
reason the write path does any overlap checking at all:

```json
{
  "error": "Reservation overlaps an existing booking",
  "code": "BOOKING_CONFLICT",
  "details": [
    {
      "id": "8f14e45f-ceea-4d0a-9c1b-2f2a1c8d3b71",
      "guestName": "Jane Doe",
      "startDate": "2026-03-12",
      "endDate": "2026-03-15"
    }
  ]
}
```

Overlap prevention is an `EXCLUDE USING gist` constraint in the schema, not application
logic — that is what makes it hold under any concurrency. But a constraint violation
arrives as SQLSTATE `23P01` and cannot say *which* booking was in the way, and the
reservation form needs to render *"Conflicts with Jane Doe (12–15 March)"*. So the service
runs an overlap query purely to populate `details`. That query races, and is allowed to:
if a competitor commits in between, the constraint rejects the write and the handler
re-queries to name the winner. **The check is for humans; the constraint is for
correctness.**

`details` can legitimately come back empty — the racing reservation may itself have been
cancelled in the meantime — so a client should render a generic conflict message when the
array is empty rather than assuming an entry exists.

### Validation errors

`path` is dot-joined, so a nested field reads `address.city` and a path parameter reads
`id`:

```json
{
  "error": "Request validation failed",
  "code": "VALIDATION_ERROR",
  "details": [{ "path": "endDate", "message": "End date must be after start date" }]
}
```

A **malformed path id is a 400, not a 404.** `/v1/reservations/not-a-uuid` could not
identify a resource in any state of the database, so "does not exist" would be a guess
dressed as a fact; 400 tells the caller the request itself is wrong, which is the
actionable answer. It also keeps a garbage parameter from reaching Postgres as a failed
`uuid` cast that would surface as a 500.

### `INTERNAL_ERROR` never says anything

The message is always the fixed string above — no stack trace, no `err.message`, no SQL,
no table or constraint name. Two reasons, and the security one is second: a driver error
message is a free schema map for anyone probing the API, and the client can do nothing
with it regardless. An error the API did not anticipate is by definition not one the
caller can handle. The request id in the server log is the artefact that matters.

---

## Conventions that apply everywhere

**Dates.** `startDate` and `endDate` are `YYYY-MM-DD` calendar dates backed by Postgres
`date` columns — no time, no timezone component, nothing for an offset to shift. **Do not
parse them with `new Date()` for display**, or a browser offset will render some of them a
day early. Format the string directly. All dates are local to the property, the way an
airline ticket's departure time is, so nothing is ever converted for a viewer and no
timezone comparison exists anywhere in this API. `createdAt` / `updatedAt` are the
deliberate opposite: those genuinely are instants, and serialize as ISO 8601.

**Intervals are half-open**, `[startDate, endDate)`. `endDate` is the checkout date and is
exclusive, so a stay ending on the 12th and one starting on the 12th do not conflict —
same-day turnover is allowed. Only `confirmed` reservations block.

**Single resources return bare; collections are wrapped.** `GET /v1/reservations/{id}`
returns the reservation itself. Lists return `{ data, pagination }` with `page` 1-based,
`limit` defaulting to 20 and capped at 100. An over-large `limit` is a 400 rather than a
silent clamp. `GET /v1/dashboard` is wrapped in `{ data }` but is **not** paginated: it is
one row per active unit and it is the landing page, where a partial answer would be worse
than a slow one.

**Deletes are soft.** `DELETE /v1/rental-units/{id}` sets `status: 'deleted'` and is
refused with 409 while non-cancelled reservations exist. `DELETE /v1/reservations/{id}`
sets `status: 'cancelled'`. Both are idempotent, and a cancelled reservation stays
readable by id — the status field preserves history rather than erasing it.

**Authentication: there is none**, deliberately, so no operation in the spec declares a
security scheme. The intended design is JWT bearer auth with rental units belonging to an
account and reservations inheriting access through their unit, scoped at the query layer
rather than the route layer. It was traded against depth on the booking rule; see the
project FAQ.
