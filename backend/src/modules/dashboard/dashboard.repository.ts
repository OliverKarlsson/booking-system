import type { Address, DashboardEntry, ReservationSummary } from '@booking/shared';

import type { Queryable } from '../../db/pool';

/**
 * One row of the dashboard query: the unit, its locally-resolved date, and the two
 * reservations found by the LATERAL subqueries, left-joined and therefore nullable.
 *
 * `snake_case` because these are the column names Postgres returns; the mapping to the
 * camelCase contract happens in `toDashboardEntry` and nowhere else.
 *
 * `start_date` / `end_date` / `local_date` are `string`, not `Date`: the driver's OID
 * 1082 parser (db/pool.ts) hands `date` columns back verbatim as 'YYYY-MM-DD'. Typing
 * them as strings here is not optimism — if that parser were ever removed these fields
 * would be `Date` objects and every date in this response would shift by the process
 * offset, which is precisely why the parser has its own test.
 */
export interface DashboardRow {
  id: string;
  name: string;
  timezone: string;
  street: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  local_date: string;
  current_id: string | null;
  current_guest_name: string | null;
  current_start_date: string | null;
  current_end_date: string | null;
  next_id: string | null;
  next_guest_name: string | null;
  next_start_date: string | null;
  next_end_date: string | null;
}

/**
 * The whole dashboard in one statement.
 *
 * The alternative — select the active units, then loop and issue two queries per unit —
 * is a textbook N+1: 2N+1 round trips for a page that is conceptually a single read, and
 * a page whose latency grows linearly with the portfolio size rather than with the work.
 * The LATERAL joins collapse it to one round trip while keeping each subquery's `WHERE`
 * correlated to the row being built, which is the thing a plain `JOIN` cannot express
 * (there is no way to say "the *earliest* future reservation for this unit" in a flat
 * join without a window function or a second pass).
 *
 * Why each piece is what it is:
 *
 * - `CROSS JOIN LATERAL` for `local_date`: "today" has to be resolved *per row*, in that
 *   unit's own zone (§3.7), because occupancy is a physical fact about the flat. A
 *   manager in Stockholm looking at a Los Angeles unit at 08:00 CET is looking at 23:00
 *   the previous day in LA, and the guest has not checked out. Computing this once from
 *   the server's clock — or from a date the client sent — is the bug this endpoint
 *   exists to not have. Materialising it as a join rather than repeating the expression
 *   three times means the two subqueries below and the echoed `localDate` are guaranteed
 *   to be talking about the same day.
 *
 * - `LEFT JOIN LATERAL` for `current`: `start_date <= D AND end_date > D` is the
 *   half-open interval `[start, end)` restated for a single day. A guest whose
 *   `end_date` *is* D has checked out this morning, so the unit reads vacant — that
 *   falls out of the same rule the exclusion constraint uses, rather than being a second
 *   definition of occupancy that could drift from it. `LIMIT 1` because the exclusion
 *   constraint already guarantees at most one confirmed reservation covers any given
 *   day; it is there to let the planner stop early, not to paper over duplicates.
 *
 * - `LEFT JOIN LATERAL` for `next`: strictly `start_date > D`, so on a back-to-back
 *   changeover day the arriving guest is the *current* reservation (they check in on D
 *   itself) and `nextCheckIn` moves on to the stay after that.
 *
 * - `status = 'confirmed'` in both: cancelled reservations neither occupy a unit nor
 *   count as an upcoming arrival.
 *
 * Both subqueries are served by `reservations_unit_dates_idx` — the partial index on
 * `(rental_unit_id, start_date, end_date) WHERE status = 'confirmed'` from §4. Its
 * predicate matches theirs exactly, so the index is usable rather than merely present,
 * its leading column is the correlation key, and `start_date` being second means the
 * `next` subquery's `ORDER BY start_date LIMIT 1` is an index scan that stops at the
 * first row instead of a sort over the unit's whole history.
 */
const DASHBOARD_SQL = `
  SELECT
    ru.id,
    ru.name,
    ru.timezone,
    ru.street,
    ru.city,
    ru.postcode,
    ru.country,
    d.local_date,
    cur.id         AS current_id,
    cur.guest_name AS current_guest_name,
    cur.start_date AS current_start_date,
    cur.end_date   AS current_end_date,
    nxt.id         AS next_id,
    nxt.guest_name AS next_guest_name,
    nxt.start_date AS next_start_date,
    nxt.end_date   AS next_end_date
  FROM rental_units ru
  CROSS JOIN LATERAL (
    -- "Today" per property, not per viewer, not per server. See §3.7.
    SELECT (COALESCE($1::timestamptz, now()) AT TIME ZONE ru.timezone)::date AS local_date
  ) d
  LEFT JOIN LATERAL (
    SELECT r.id, r.guest_name, r.start_date, r.end_date
    FROM reservations r
    WHERE r.rental_unit_id = ru.id
      AND r.status = 'confirmed'
      AND r.start_date <= d.local_date
      AND r.end_date > d.local_date
    LIMIT 1
  ) cur ON true
  LEFT JOIN LATERAL (
    SELECT r.id, r.guest_name, r.start_date, r.end_date
    FROM reservations r
    WHERE r.rental_unit_id = ru.id
      AND r.status = 'confirmed'
      AND r.start_date > d.local_date
    ORDER BY r.start_date
    LIMIT 1
  ) nxt ON true
  WHERE ru.status = 'active'
  ORDER BY ru.name, ru.id
`;

/**
 * The four address columns are stored flat and exposed nested (§3.2).
 *
 * A unit with nothing filled in gets no `address` key at all rather than an empty
 * object: `address` is optional in the contract, and `{}` would make a client's
 * `if (unit.address)` check true for a unit that has no address.
 */
function toAddress(row: DashboardRow): Address | undefined {
  const address: Address = {};
  if (row.street !== null) address.street = row.street;
  if (row.city !== null) address.city = row.city;
  if (row.postcode !== null) address.postcode = row.postcode;
  if (row.country !== null) address.country = row.country;

  return Object.keys(address).length > 0 ? address : undefined;
}

/**
 * The left-joined columns are all-or-nothing: either the subquery matched a row and every
 * column is present, or it matched nothing and every column is null. Keying the decision
 * on the id and then asserting the rest is what lets the four nullable columns become one
 * nullable object.
 */
function toReservationSummary(
  id: string | null,
  guestName: string | null,
  startDate: string | null,
  endDate: string | null,
): ReservationSummary | null {
  if (id === null || guestName === null || startDate === null || endDate === null) {
    return null;
  }
  return { id, guestName, startDate, endDate };
}

/**
 * Exported for its own unit test: this is the only part of the read path that is pure,
 * and the row→entry mapping is where a nullable column quietly becoming `undefined` (or
 * an occupancy flag inverting) would hide.
 */
export function toDashboardEntry(row: DashboardRow): DashboardEntry {
  const currentReservation = toReservationSummary(
    row.current_id,
    row.current_guest_name,
    row.current_start_date,
    row.current_end_date,
  );
  const address = toAddress(row);

  return {
    rentalUnit: {
      id: row.id,
      name: row.name,
      timezone: row.timezone,
      ...(address !== undefined ? { address } : {}),
    },
    localDate: row.local_date,
    // Occupancy is not a third piece of state to keep in sync — it *is* "did the current
    // reservation subquery match", so it is derived here rather than computed a second
    // way in SQL where the two could disagree.
    occupancy: currentReservation !== null ? 'occupied' : 'vacant',
    currentReservation,
    nextCheckIn: toReservationSummary(
      row.next_id,
      row.next_guest_name,
      row.next_start_date,
      row.next_end_date,
    ),
  };
}

export interface DashboardQueryOptions {
  /**
   * Test-only override for `now()`, as an ISO instant. **Not part of the client-facing
   * contract** (§3.6) — it exists so boundary cases (checkout today, a back-to-back
   * changeover, two units whose local dates have diverged) can be driven
   * deterministically instead of by waiting for the clock. `undefined` in every real
   * request, which is what makes `COALESCE($1, now())` fall through to the server clock.
   *
   * It is not a "date the client picks": it is an *instant*, and it is still resolved to
   * a calendar date per unit in that unit's own zone. Even under the override there is no
   * path by which a viewer's timezone reaches the occupancy calculation.
   */
  now?: string;
}

export async function findDashboardEntries(
  db: Queryable,
  options: DashboardQueryOptions = {},
): Promise<DashboardEntry[]> {
  const { rows } = await db.query<DashboardRow>(DASHBOARD_SQL, [options.now ?? null]);
  return rows.map(toDashboardEntry);
}
