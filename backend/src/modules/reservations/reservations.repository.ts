import type {
  Reservation,
  ReservationQuery,
  ReservationStatus,
  ReservationSummary,
} from '@booking/shared';

import type { Queryable } from '../../db/pool';

/**
 * Every SQL statement the reservations feature runs. Nothing outside this file talks to
 * the database, so swapping in a query builder later — or adding a caching layer — is a
 * contained change rather than a search across the module.
 *
 * Two rules hold throughout:
 *
 *  1. **Every value is a bound parameter.** No user input is ever concatenated into a
 *     statement, including `LIMIT`/`OFFSET`, which arrive as query-string numbers.
 *     `ORDER BY` cannot be parameterised at all, so it is a fixed literal here; if a
 *     sort option were ever exposed it would have to be mapped through an allow-list
 *     rather than substituted.
 *  2. **"Overlap" is only ever written as `daterange(...) && daterange(...)`.** That is
 *     the same expression the `reservation_no_overlap` exclusion constraint is built
 *     from (db/schema.sql), so the query that reports a conflict and the constraint that
 *     prevents one cannot disagree about what a conflict is. Hand-rolled `<`/`>`
 *     comparisons would be a second definition of the rule, free to drift.
 */

/**
 * `date` columns come back as `'YYYY-MM-DD'` strings, not `Date` objects — see the
 * `setTypeParser(1082, …)` note in db/pool.ts. `timestamptz` columns keep the default
 * coercion because those genuinely are instants.
 */
interface ReservationRow {
  id: string;
  rental_unit_id: string;
  guest_name: string;
  start_date: string;
  end_date: string;
  status: ReservationStatus;
  created_at: Date;
  updated_at: Date;
}

type ReservationSummaryRow = Pick<ReservationRow, 'id' | 'guest_name' | 'start_date' | 'end_date'>;

const RESERVATION_COLUMNS = `
  id, rental_unit_id, guest_name, start_date, end_date, status, created_at, updated_at
`;

/** The subset §3.4 puts in `BOOKING_CONFLICT.details` and §3.6 in the dashboard. */
const SUMMARY_COLUMNS = `id, guest_name, start_date, end_date`;

function mapRow(row: ReservationRow): Reservation {
  return {
    id: row.id,
    rentalUnitId: row.rental_unit_id,
    guestName: row.guest_name,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function mapSummaryRow(row: ReservationSummaryRow): ReservationSummary {
  return {
    id: row.id,
    guestName: row.guest_name,
    startDate: row.start_date,
    endDate: row.end_date,
  };
}

export interface OverlapCriteria {
  rentalUnitId: string;
  startDate: string;
  endDate: string;
  /** The reservation being edited, so a `PATCH` does not report a clash with itself. */
  excludeId?: string;
}

/**
 * The reservations a candidate `[startDate, endDate)` would collide with.
 *
 * **This query does not make anything safe.** It races with any concurrent write, by
 * construction — see the comment block in reservations.service.ts. It exists so a 409
 * can name the guest and dates that blocked the booking; the guarantee that no two
 * confirmed stays overlap is the exclusion constraint's alone.
 *
 * `status = 'confirmed'` is the cancellation exemption, matching the constraint's
 * `WHERE (status = 'confirmed')` clause — a cancelled stay blocks nothing.
 */
export async function findOverlapping(
  db: Queryable,
  criteria: OverlapCriteria,
): Promise<ReservationSummary[]> {
  const { rows } = await db.query<ReservationSummaryRow>(
    `SELECT ${SUMMARY_COLUMNS}
       FROM reservations
      WHERE rental_unit_id = $1
        AND status = 'confirmed'
        AND daterange(start_date, end_date, '[)') && daterange($2::date, $3::date, '[)')
        AND ($4::uuid IS NULL OR id <> $4)
      ORDER BY start_date, id`,
    [criteria.rentalUnitId, criteria.startDate, criteria.endDate, criteria.excludeId ?? null],
  );

  return rows.map(mapSummaryRow);
}

export interface InsertReservationInput {
  id: string;
  rentalUnitId: string;
  guestName: string;
  startDate: string;
  endDate: string;
}

/**
 * Inserts, or throws a `pg` error. Notably it may throw SQLSTATE 23P01 — that rejection
 * is the booking rule doing its job and the service is expected to catch it, not to
 * prevent it from ever happening.
 */
export async function insertReservation(
  db: Queryable,
  input: InsertReservationInput,
): Promise<Reservation> {
  const { rows } = await db.query<ReservationRow>(
    `INSERT INTO reservations (id, rental_unit_id, guest_name, start_date, end_date)
     VALUES ($1, $2, $3, $4::date, $5::date)
     RETURNING ${RESERVATION_COLUMNS}`,
    [input.id, input.rentalUnitId, input.guestName, input.startDate, input.endDate],
  );

  // `status` is omitted above so the column DEFAULT 'confirmed' applies: the contract
  // says a reservation is created confirmed and `DELETE` cancels it, and restating the
  // literal here would be a second place for that default to live.
  return mapRow(rows[0]!);
}

export async function findReservationById(
  db: Queryable,
  id: string,
): Promise<Reservation | undefined> {
  const { rows } = await db.query<ReservationRow>(
    `SELECT ${RESERVATION_COLUMNS} FROM reservations WHERE id = $1`,
    [id],
  );

  // Cancelled reservations are returned, not hidden: they are still real resources with
  // a history worth reading. Only the *list* defaults to confirmed (§3.6).
  return rows[0] ? mapRow(rows[0]) : undefined;
}

/**
 * Builds the shared `WHERE` for the list and its count.
 *
 * Both queries must filter identically or the pagination metadata describes a different
 * result set than the page it accompanies. Generating the clause once is what makes that
 * true by construction rather than by two developers remembering.
 *
 * Returns 1-based placeholder text plus the values in matching order; the caller appends
 * its own placeholders after `values.length`.
 */
function buildListFilters(query: ReservationQuery): { where: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];

  const placeholder = (value: unknown): string => {
    values.push(value);
    return `$${values.length}`;
  };

  // Always present: `status` is defaulted to 'confirmed' by the shared query schema.
  conditions.push(`status = ${placeholder(query.status)}`);

  if (query.rentalUnitId !== undefined) {
    conditions.push(`rental_unit_id = ${placeholder(query.rentalUnitId)}`);
  }

  // §3.6: `from`/`to` select reservations that **overlap** the window, not ones contained
  // by it — a stay straddling the edge of the month a user is looking at is precisely the
  // one they need to see.
  //
  // A `daterange` with a NULL bound is unbounded on that side, so `from` alone and `to`
  // alone need no separate branches: `daterange(NULL, '2026-04-01', '[)')` is everything
  // before April. The predicate is skipped entirely when neither is given, since
  // `(,) && anything` is trivially true and only costs a scan.
  if (query.from !== undefined || query.to !== undefined) {
    const from = placeholder(query.from ?? null);
    const to = placeholder(query.to ?? null);
    conditions.push(
      `daterange(start_date, end_date, '[)') && daterange(${from}::date, ${to}::date, '[)')`,
    );
  }

  return { where: `WHERE ${conditions.join(' AND ')}`, values };
}

export interface ReservationPage {
  data: Reservation[];
  total: number;
}

export async function listReservations(
  db: Queryable,
  query: ReservationQuery,
): Promise<ReservationPage> {
  const { where, values } = buildListFilters(query);
  const offset = (query.page - 1) * query.limit;

  // Two round trips rather than `count(*) OVER ()`: the window function returns no row at
  // all for a page past the end of the result set, which would report `total: 0` for a
  // collection that is not empty. Correct pagination metadata is worth one extra query at
  // this size; a very large table would want an estimate instead of an exact count.
  //
  // `ORDER BY start_date` is the contract's sort (§3.6). `id` breaks ties so paging is
  // stable — without it two stays starting the same day can swap places between page
  // requests and one of them is never seen. Both are literals: `ORDER BY` cannot take a
  // bound parameter, so nothing user-supplied may reach it.
  const [page, count] = await Promise.all([
    db.query<ReservationRow>(
      `SELECT ${RESERVATION_COLUMNS}
         FROM reservations
         ${where}
        ORDER BY start_date ASC, id ASC
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, query.limit, offset],
    ),
    db.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM reservations ${where}`,
      values,
    ),
  ]);

  return {
    data: page.rows.map(mapRow),
    // `count(*)` is bigint; `pg` returns those as strings to avoid silent precision loss
    // past 2^53. Cast in SQL and parse here rather than letting `Number(bigint)` happen
    // implicitly somewhere less visible.
    total: Number(count.rows[0]?.total ?? '0'),
  };
}

export interface ReservationPatch {
  guestName?: string;
  startDate?: string;
  endDate?: string;
  status?: ReservationStatus;
}

/**
 * Column names come from this fixed map, never from the keys of the request body. Zod has
 * already stripped unknown keys, but building SQL identifiers from a request object is
 * the shape of an injection bug regardless of what validated it upstream.
 */
const PATCH_COLUMNS: Readonly<Record<keyof ReservationPatch, string>> = {
  guestName: 'guest_name',
  startDate: 'start_date',
  endDate: 'end_date',
  status: 'status',
};

export async function updateReservation(
  db: Queryable,
  id: string,
  patch: ReservationPatch,
): Promise<Reservation | undefined> {
  const assignments: string[] = [];
  const values: unknown[] = [id];

  for (const [key, column] of Object.entries(PATCH_COLUMNS) as [keyof ReservationPatch, string][]) {
    const value = patch[key];
    if (value === undefined) continue;
    values.push(value);
    // `::date` on the date columns so the driver's inferred parameter type cannot turn a
    // 'YYYY-MM-DD' string into something else on the way in.
    const cast = key === 'startDate' || key === 'endDate' ? '::date' : '';
    assignments.push(`${column} = $${values.length}${cast}`);
  }

  if (assignments.length === 0) {
    // Unreachable via the API — `updateReservationSchema` rejects an empty body with a
    // 400 — but a repository that silently issues `SET updated_at = now()` for a no-op
    // patch would be lying about having updated something.
    return findReservationById(db, id);
  }

  const { rows } = await db.query<ReservationRow>(
    `UPDATE reservations
        SET ${assignments.join(', ')}, updated_at = now()
      WHERE id = $1
      RETURNING ${RESERVATION_COLUMNS}`,
    values,
  );

  return rows[0] ? mapRow(rows[0]) : undefined;
}

/**
 * `DELETE` is a cancellation (§3.6): the row stays, its status changes.
 *
 * Keeping it preserves history — a manager can still see what used to be booked — and
 * the exclusion constraint's `WHERE (status = 'confirmed')` clause means a cancelled row
 * stops blocking new bookings the instant it is cancelled, with no delete-and-archive
 * dance.
 *
 * `WHERE status <> 'cancelled'` is deliberately absent: cancelling an already-cancelled
 * reservation returns the row unchanged, so the endpoint is idempotent.
 */
export async function cancelReservation(
  db: Queryable,
  id: string,
): Promise<Reservation | undefined> {
  const { rows } = await db.query<ReservationRow>(
    `UPDATE reservations
        SET status = 'cancelled', updated_at = now()
      WHERE id = $1
      RETURNING ${RESERVATION_COLUMNS}`,
    [id],
  );

  return rows[0] ? mapRow(rows[0]) : undefined;
}

/**
 * Whether a bookable (active, not soft-deleted) rental unit exists.
 *
 * Queried here rather than through the rental-units repository so the two feature modules
 * stay independent: reservations needs one boolean, not that module's row mapping, its
 * address flattening, or a build-order dependency on it. The foreign key still backs this
 * up for hard-deleted rows; what it cannot express is the *soft*-delete rule, since a
 * soft-deleted unit is a perfectly valid FK target.
 */
export async function isBookableRentalUnit(db: Queryable, id: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `SELECT 1 FROM rental_units WHERE id = $1 AND status = 'active'`,
    [id],
  );

  return (rowCount ?? 0) > 0;
}
