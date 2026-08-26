-- The single source of truth for the booking rule.
--
-- Overlap prevention is NOT implemented in application code. It is the exclusion
-- constraint below, and the application's only job is to turn a violation into a good
-- error message. Nothing else in the codebase gets to define what "overlap" means.
--
-- Applied idempotently on boot by src/db/migrate.ts. `IF NOT EXISTS` is the only
-- deviation from the DDL as designed; a production system would use ordered, versioned
-- migrations (node-pg-migrate or similar) instead of applying a whole schema file.

-- Required by `reservation_no_overlap`: that constraint mixes `=` on a uuid with `&&` on
-- a range, and the stock GiST operator classes do not cover equality on scalar types.
-- Without this extension the constraint cannot be created at all.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE IF NOT EXISTS rental_units (
  id          uuid PRIMARY KEY,
  name        text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),

  -- IANA identifier ('Europe/Stockholm'), never a fixed offset — the tz database then
  -- handles DST and political timezone changes for us. This is the authority for "what
  -- day is it at this property", which is what occupancy actually depends on.
  --
  -- Validity is enforced in Zod (against Intl.supportedValuesOf('timeZone')), not by a
  -- CHECK constraint: Postgres forbids subqueries in CHECK, so pg_timezone_names can't
  -- be referenced there. Unlike the overlap rule below, this is a plain value-domain
  -- check with no concurrency dimension — nothing is lost by validating it in the
  -- application. A FK to a lookup table synced from pg_timezone_names would be the
  -- stricter option, at the cost of restating the tz database in our schema and having
  -- to refresh it.
  timezone    text NOT NULL,

  street      text,
  city        text,
  postcode    text,
  country     text,
  status      text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'deleted')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reservations (
  id             uuid PRIMARY KEY,
  rental_unit_id uuid NOT NULL REFERENCES rental_units(id),
  guest_name     text NOT NULL CHECK (length(guest_name) BETWEEN 1 AND 120),
  start_date     date NOT NULL,
  end_date       date NOT NULL,
  status         text NOT NULL DEFAULT 'confirmed'
                   CHECK (status IN ('confirmed', 'cancelled')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reservation_valid_range CHECK (end_date > start_date),

  -- THE BOOKING RULE. `[)` is the half-open interval, so a stay ending on the 10th and
  -- one starting on the 10th do not conflict (same-day turnover is allowed). The WHERE
  -- clause is the cancellation exemption. This constraint holds under any concurrency —
  -- there is no lock to take and no isolation level to configure.
  CONSTRAINT reservation_no_overlap EXCLUDE USING gist (
    rental_unit_id WITH =,
    daterange(start_date, end_date, '[)') WITH &&
  ) WHERE (status = 'confirmed')
);

-- Partial index matching the predicate every hot read carries (`status = 'confirmed'`):
-- the overlap lookup that builds the 409 payload, the reservation list filters, and the
-- dashboard's two LATERAL subqueries. Indexing only confirmed rows keeps it small, since
-- cancelled reservations are never searched by date.
CREATE INDEX IF NOT EXISTS reservations_unit_dates_idx
  ON reservations (rental_unit_id, start_date, end_date)
  WHERE status = 'confirmed';
