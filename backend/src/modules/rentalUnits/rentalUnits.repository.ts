import type { Address, RentalUnit, RentalUnitStatus } from '@booking/shared';

import { toAddress } from '../../db/address';
import { pool, type Queryable } from '../../db/pool';

/**
 * All SQL for rental units, and nowhere else.
 *
 * Keeping queries confined to a repository module is what makes "swap `pg` for a query
 * builder later" a contained change rather than a grep across the codebase (see the FAQ's
 * ORM question). It also gives the `snake_case` → `camelCase` translation exactly one
 * home, so no service or route ever sees a raw row shape. The flat-columns →
 * nested-`address` half lives in `db/address.ts`, shared with the dashboard's read path
 * so the two cannot disagree about what an absent address looks like.
 *
 * Every statement below is parameterised. There is no string interpolation into SQL
 * anywhere in this file — including `LIMIT`/`OFFSET`, which are bound like any other
 * value rather than concatenated in.
 */

/** The row shape as Postgres returns it. `date` has no place here — units carry no dates. */
interface RentalUnitRow {
  id: string;
  name: string;
  timezone: string;
  street: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  status: RentalUnitStatus;
  created_at: Date;
  updated_at: Date;
}

/**
 * Selected explicitly rather than `SELECT *`.
 *
 * A star select silently changes shape when a column is added, and the mapper below would
 * keep compiling while quietly dropping the new field. Naming the columns means the
 * schema and the mapper fail together, which is when a mismatch is cheapest to find.
 */
const COLUMNS = `id, name, timezone, street, city, postcode, country, status, created_at, updated_at`;

/**
 * `created_at` / `updated_at` are `timestamptz`, so the driver hands back a JS `Date` —
 * and that is correct here, unlike for reservation dates (see the `setTypeParser(1082, …)`
 * note in db/pool.ts). These genuinely are instants, and `toISOString()` is the contract's
 * ISO 8601 wire format.
 */
function mapRow(row: RentalUnitRow): RentalUnit {
  const address = toAddress(row);

  return {
    id: row.id,
    name: row.name,
    timezone: row.timezone,
    ...(address ? { address } : {}),
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface NewRentalUnit {
  id: string;
  name: string;
  timezone: string;
  address?: Address;
}

export interface RentalUnitPatch {
  name?: string;
  timezone?: string;
  address?: Address;
}

export interface ListRentalUnitsParams {
  page: number;
  limit: number;
}

export interface ListRentalUnitsResult {
  rows: RentalUnit[];
  total: number;
}

/**
 * The outcome of an attempted soft delete.
 *
 * A three-way result rather than a boolean or a thrown error: the repository knows *which*
 * precondition failed because it is the thing holding the row lock, but choosing the HTTP
 * shape for that fact is the service's job. Returning the reason keeps the SQL layer free
 * of `AppError` and keeps the service's mapping testable against a mock.
 */
export type SoftDeleteOutcome =
  | { outcome: 'deleted'; unit: RentalUnit }
  | { outcome: 'not_found' }
  | { outcome: 'has_reservations'; blockingCount: number };

export interface RentalUnitsRepository {
  insert(unit: NewRentalUnit, db?: Queryable): Promise<RentalUnit>;
  findById(id: string, db?: Queryable): Promise<RentalUnit | null>;
  list(params: ListRentalUnitsParams, db?: Queryable): Promise<ListRentalUnitsResult>;
  update(id: string, patch: RentalUnitPatch, db?: Queryable): Promise<RentalUnit | null>;
  /**
   * `db` is required, unlike everywhere else in this interface: the guard depends on a
   * `FOR UPDATE` row lock, and a lock taken on the pool is released the instant that
   * statement returns. Passing a transaction client is a precondition of the method
   * working at all, so the type says so rather than defaulting to a pool that would make
   * it quietly meaningless.
   */
  softDelete(id: string, db: Queryable): Promise<SoftDeleteOutcome>;
  countBlockingReservations(id: string, db?: Queryable): Promise<number>;
}

async function insert(unit: NewRentalUnit, db: Queryable = pool): Promise<RentalUnit> {
  const { rows } = await db.query<RentalUnitRow>(
    `INSERT INTO rental_units (id, name, timezone, street, city, postcode, country)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${COLUMNS}`,
    [
      unit.id,
      unit.name,
      unit.timezone,
      // `?? null` rather than leaving them undefined: node-postgres maps `undefined` to
      // NULL anyway, but only by coincidence of its parameter serialisation. Being
      // explicit means an accidental `undefined` can never be mistaken for "keep".
      unit.address?.street ?? null,
      unit.address?.city ?? null,
      unit.address?.postcode ?? null,
      unit.address?.country ?? null,
    ],
  );

  // The INSERT either returns its row or throws; a missing row here is impossible rather
  // than merely unlikely, so this narrows the type instead of handling a real case.
  const row = rows[0];
  if (!row) throw new Error('INSERT INTO rental_units returned no row');

  return mapRow(row);
}

/**
 * `status = 'active'` is part of every read predicate in this file, not applied afterwards
 * in TypeScript.
 *
 * Soft-deleted units must be invisible to every read path (§3.6), and the reliable way to
 * get that is for the filter to live in the query — a caller cannot forget a WHERE clause
 * it never had to write. Filtering in the application would also make pagination lie, by
 * counting rows it then drops.
 */
async function findById(id: string, db: Queryable = pool): Promise<RentalUnit | null> {
  const { rows } = await db.query<RentalUnitRow>(
    `SELECT ${COLUMNS} FROM rental_units WHERE id = $1 AND status = 'active'`,
    [id],
  );

  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * Offset pagination (§3.5).
 *
 * Two statements rather than a `count(*) OVER ()` window: the window function returns no
 * rows at all for an out-of-range page, which would report `total: 0` for page 9 of a
 * 3-page list and break the client's "go back" affordance. They are issued concurrently,
 * so this costs a connection rather than a round trip.
 *
 * The count is a full scan of the active rows, which is the accepted cost of offset
 * pagination and the reason cursor pagination is the scalable alternative (noted in the
 * FAQ, deliberately not built). The two statements are also not in one transaction, so a
 * concurrent insert can make `total` disagree with the page by one — harmless for a page
 * counter, and not worth a transaction per list request.
 *
 * `ORDER BY name, id`: the tie-break is not cosmetic. Ordering by a non-unique column
 * alone leaves row order undefined between statements, so a unit can appear on two
 * consecutive pages or on neither. `id` makes the order total and pagination stable.
 */
async function list(
  params: ListRentalUnitsParams,
  db: Queryable = pool,
): Promise<ListRentalUnitsResult> {
  const offset = (params.page - 1) * params.limit;

  const [pageResult, countResult] = await Promise.all([
    db.query<RentalUnitRow>(
      `SELECT ${COLUMNS}
         FROM rental_units
        WHERE status = 'active'
        ORDER BY name ASC, id ASC
        LIMIT $1 OFFSET $2`,
      [params.limit, offset],
    ),
    db.query<{ total: string }>(
      `SELECT count(*)::text AS total FROM rental_units WHERE status = 'active'`,
    ),
  ]);

  return {
    rows: pageResult.rows.map(mapRow),
    // `count(*)` is bigint; node-postgres returns bigint as a string to avoid silently
    // losing precision past 2^53. Cast in SQL and parse here rather than pretending.
    total: Number(countResult.rows[0]?.total ?? '0'),
  };
}

/**
 * A partial update expressed as one static statement, not as a SET clause assembled from
 * the patch.
 *
 * A builder would be the conventional answer and would still be safe if written carefully
 * (column names from an allow-list, values bound) — but "safe if written carefully" is the
 * property worth avoiding in SQL. With three updatable fields, `COALESCE`/`CASE` keeps the
 * statement literal, which makes rule 7 true by construction rather than by review.
 *
 * `address` uses a presence flag ($4) rather than `COALESCE` because it is a **value
 * object, replaced wholesale**: `PATCH { address: { city: 'Malmö' } }` clears street,
 * postcode and country. Deep-merging instead would make clearing a single field
 * impossible to express, since the schema admits no `null`. Under replace semantics
 * `{ "address": {} }` clears the address and omitting the key leaves it untouched — both
 * intents are sayable, which is what a PATCH needs.
 */
async function update(
  id: string,
  patch: RentalUnitPatch,
  db: Queryable = pool,
): Promise<RentalUnit | null> {
  const replaceAddress = patch.address !== undefined;

  const { rows } = await db.query<RentalUnitRow>(
    `UPDATE rental_units
        SET name       = COALESCE($2::text, name),
            timezone   = COALESCE($3::text, timezone),
            street     = CASE WHEN $4::boolean THEN $5::text ELSE street   END,
            city       = CASE WHEN $4::boolean THEN $6::text ELSE city     END,
            postcode   = CASE WHEN $4::boolean THEN $7::text ELSE postcode END,
            country    = CASE WHEN $4::boolean THEN $8::text ELSE country  END,
            updated_at = now()
      WHERE id = $1 AND status = 'active'
      RETURNING ${COLUMNS}`,
    [
      id,
      patch.name ?? null,
      patch.timezone ?? null,
      replaceAddress,
      patch.address?.street ?? null,
      patch.address?.city ?? null,
      patch.address?.postcode ?? null,
      patch.address?.country ?? null,
    ],
  );

  return rows[0] ? mapRow(rows[0]) : null;
}

/**
 * "Non-cancelled" is `status <> 'cancelled'`, matching §3.6 literally rather than
 * narrowing to `= 'confirmed'`.
 *
 * The two are the same set today, and writing it as a negation keeps it correct if a third
 * status is ever added: a new `pending` state should block deletion by default, and would
 * with this predicate. Failing *open* on an unrecognised status is the wrong direction for
 * a guard.
 *
 * Note the consequence, which is per spec and worth being explicit about: a completed stay
 * from years ago is still a non-cancelled reservation, so a unit that has ever hosted a
 * guest can never be deleted. That is the intended reading — soft delete exists so those
 * historical references stay resolvable (§3.6) — but it does mean "delete" is only
 * available to units that were never used.
 */
async function countBlockingReservations(id: string, db: Queryable = pool): Promise<number> {
  const { rows } = await db.query<{ total: string }>(
    `SELECT count(*)::text AS total
       FROM reservations
      WHERE rental_unit_id = $1 AND status <> 'cancelled'`,
    [id],
  );

  return Number(rows[0]?.total ?? '0');
}

/**
 * Soft delete, guarded, inside one transaction.
 *
 * The `SELECT … FOR UPDATE` is what makes the guard more than decorative. Without it, two
 * concurrent DELETEs would both read zero blocking reservations and both succeed —
 * harmless here — but more importantly the lock serialises this check against anything
 * else that takes the same row lock.
 *
 * Honesty about the limit, because it contrasts with the booking rule: unlike overlap,
 * this invariant is **not** enforced by the schema. Postgres cannot express "no active
 * reservations for a deleted unit" as a constraint without a trigger or a materialised
 * counter, so this is a transactional check, not a guarantee. A `POST /v1/reservations`
 * that does not take this row lock could still commit between the count and the UPDATE,
 * leaving a deleted unit with one confirmed reservation. The window is small and the
 * failure benign — a stale row that reads as 404 while its reservation stays resolvable,
 * which is exactly what soft delete was chosen to preserve. The contrast is the point: the
 * overlap rule got a constraint because a constraint was available; this one gets a
 * documented approximation because it was not.
 */
async function softDelete(id: string, db: Queryable): Promise<SoftDeleteOutcome> {
  const locked = await db.query<{ status: RentalUnitStatus }>(
    `SELECT status FROM rental_units WHERE id = $1 FOR UPDATE`,
    [id],
  );

  const current = locked.rows[0];

  // Nonexistent and already-deleted are deliberately the same outcome. §3.6 requires
  // DELETE to be idempotent: a second call must look identical to deleting something that
  // never existed, so a client retrying a timed-out request cannot tell the difference.
  if (!current || current.status !== 'active') {
    return { outcome: 'not_found' };
  }

  const blockingCount = await countBlockingReservations(id, db);
  if (blockingCount > 0) {
    return { outcome: 'has_reservations', blockingCount };
  }

  const { rows } = await db.query<RentalUnitRow>(
    `UPDATE rental_units
        SET status = 'deleted', updated_at = now()
      WHERE id = $1 AND status = 'active'
      RETURNING ${COLUMNS}`,
    [id],
  );

  const row = rows[0];
  if (!row) return { outcome: 'not_found' };

  return { outcome: 'deleted', unit: mapRow(row) };
}

export const rentalUnitsRepository: RentalUnitsRepository = {
  insert,
  findById,
  list,
  update,
  softDelete,
  countBlockingReservations,
};
