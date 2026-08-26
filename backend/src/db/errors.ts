/**
 * SQLSTATE classification for `pg` errors.
 *
 * These are matched on the SQLSTATE code rather than on the driver's message text.
 * Message text is localised, varies between Postgres versions, and is not part of any
 * contract; SQLSTATE is standardised and stable, so a check written against it does not
 * quietly stop matching after a database upgrade.
 */

/** Integrity-constraint-violation codes we care about (Postgres class 23). */
export const SQLSTATE = {
  /** exclusion_violation — `reservation_no_overlap` rejected the write. */
  EXCLUSION_VIOLATION: '23P01',
  /** foreign_key_violation — e.g. reservation references a nonexistent rental unit. */
  FOREIGN_KEY_VIOLATION: '23503',
  /** check_violation — e.g. `reservation_valid_range` (end_date > start_date). */
  CHECK_VIOLATION: '23514',
  /** unique_violation. */
  UNIQUE_VIOLATION: '23505',
  /** not_null_violation. */
  NOT_NULL_VIOLATION: '23502',
} as const;

interface DatabaseErrorShape {
  code: string;
  constraint?: string;
  table?: string;
  detail?: string;
}

/**
 * Duck-typed rather than `instanceof pg.DatabaseError`: errors can cross module
 * instances (two copies of `pg` in a workspace, a wrapped/serialised error), and an
 * `instanceof` check that fails silently would route a constraint violation to the
 * generic 500 path instead of a 409.
 */
function asDatabaseError(err: unknown): DatabaseErrorShape | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const candidate = err as Partial<DatabaseErrorShape>;
  return typeof candidate.code === 'string' ? (candidate as DatabaseErrorShape) : undefined;
}

export function pgErrorCode(err: unknown): string | undefined {
  return asDatabaseError(err)?.code;
}

/** The name of the constraint that rejected the write, when Postgres reports one. */
export function pgConstraintName(err: unknown): string | undefined {
  return asDatabaseError(err)?.constraint;
}

/**
 * SQLSTATE 23P01. This is the backstop that makes double booking impossible: a
 * concurrent request that slipped past the application's pre-check lands here.
 */
export function isExclusionViolation(err: unknown): boolean {
  return pgErrorCode(err) === SQLSTATE.EXCLUSION_VIOLATION;
}

export function isForeignKeyViolation(err: unknown): boolean {
  return pgErrorCode(err) === SQLSTATE.FOREIGN_KEY_VIOLATION;
}

export function isCheckViolation(err: unknown): boolean {
  return pgErrorCode(err) === SQLSTATE.CHECK_VIOLATION;
}

export function isUniqueViolation(err: unknown): boolean {
  return pgErrorCode(err) === SQLSTATE.UNIQUE_VIOLATION;
}
