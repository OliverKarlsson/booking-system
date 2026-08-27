# Booking system

This is the handwritten version made not to word-bomb innocent reviewers. You can see Claude's in `./README by claude.md`

The layout of the project is simple. Three workspaces `backend`, `frontend` and `shared` holding Zod schemas both sides validates with.

## Quickstart

`docker compose up --build`

|                       |                                                      |
| --------------------- | ---------------------------------------------------- |
| Web app               | <http://localhost:8080>                              |
| API                   | <http://localhost:5006/v1>                           |
| API docs (Swagger UI) | <http://localhost:5006/v1/docs>                      |
| Health                | <http://localhost:5006/health>                       |
| Postgres              | `localhost:5433` — `booking` / `booking` / `booking` |

The API applies its schema and seeds on boot, so the dashboard has data straight away.

## Why SQL over MongoDB

I chose SQL instead of mongodb since i think that it raises the overall quality of a 4h booking system. The reason being that whilst mongodb can solve the concurrency issue well through optimistic writes, the bargained complexity will never amount to any real performance gain in this scenario. I hope to make it clear further down but basically I can move the invariant into the DB schema of the SQL instead of making it live in every possible write an AI agent or human may invent. Hence a shorter path to success in my mind.

Further, when speaking with claude, it stated "a mongo transaction cannot by itself prevent double bookings.". Among other things. Which is true only as far as transactions go. E.g. If each units day was modelled in MongoDB together with an amount, writes could be made both atomic and conditional based upon that. I went with the constraint because it was the shorter path to success :)

As it stands the rule that works with SQL is an gist exclusion. This is necessary since the transactions depend not only on the row being written but on rows nobody is modifying. Two overlapping bookings are separate rows, so there is no write conflict to detect and both commit. The gist exclusion puts the check in the index, where it cannot be bypassed.

## Same day checkout, checkin

Bookings are allowed to share the same end- and start-date with eachother. The rule lives in the schema with a constraint `reservation_no_overlap` using the gist from earlier.

## Error handling

Mainly conflict feedback.

- Every error comes with a stable machine code. `BOOKING_CONFLICT`, `VALIDATION_ERROR`, `UNIT_HAS_RESERVATIONS`.
- A 409 carries the reservations it collided with, so the form can say "Conflicts with Jane Doe (12–15 March)" on the still-open dialog instead of a generic failure.
- Validation errors report every bad field at once, with paths.

## Frontend

The FE client is modelled with three kinds of state. Server state which is handled with Tanstack, client state which is handled by unit tested Zustand and transient state of components.

There is a presentation/wrapper split for components. This makes the design of components a deliverable and statically "tested"/"affirmed" in storybook.

## Some other system design decisions

I put a larger focus on the quality of the project. examples being the _informed_ delete of rental units. It checks against existing bookings which must be cancelled before deletion. The deletion is also a _soft_ delete which allows for the record to still be used in the db by past reservations.

Another impactful design decision that I made was to remove time and with it timezones from the reservations. I made the unit responsible of their time zone. Then the dashboard is using it to show the correct information about which unit is occupied etc.

## Tests

715 passing.

```bash
docker compose up -d db   # the integration tests run against a real Postgres
npm test                  # all three workspaces
```

### Proven facts

- In order to see what happens under many concurrent requests, there is a test which lives in `backend/src/modules/reservations/reservations.concurrency.integration.test.ts`. It ensures that 20 simultaneous requests at one slot produces exactly one 201 response. The remaining appropriate error responses.
- The same file goes around the application entirely and attempts the overlapping insert in raw SQL. Postgres rejects it. The guarantee belongs to the database, not to code a later change could route past.

## Final notes

I cut out auth deliberatly. The intended design (which can be found in the FAQ) considered JWT, units owned by accounts and scoped queries by their callers.

The API is otherwise built for more than one kind of client: stable error codes to branch on, a pagination envelope, and correlation and rate-limit headers exposed to cross-origin callers.
