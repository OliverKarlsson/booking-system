import { z } from 'zod';
import { reservationSummarySchema } from './schemas/reservation';

/**
 * Every machine-readable error code the API can return (§3.4).
 *
 * A custom `{ error, code, details }` envelope rather than RFC 7807 `problem+json`:
 * clients branch on the stable `code` string, and the extra ceremony of a standard buys
 * nothing at this size. What matters is that `code` is closed and enumerable, so a
 * consumer can exhaustively handle it — which is why this is a `const` array the union
 * is derived from, rather than a hand-maintained union that could drift from the Zod
 * enum below.
 */
export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'RENTAL_UNIT_NOT_FOUND',
  'BOOKING_CONFLICT',
  'UNIT_HAS_RESERVATIONS',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorCodeSchema = z.enum(ERROR_CODES);

/** The HTTP status each code is served with (§3.4), so the mapping lives in one place. */
export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  RENTAL_UNIT_NOT_FOUND: 404,
  BOOKING_CONFLICT: 409,
  UNIT_HAS_RESERVATIONS: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/** `VALIDATION_ERROR.details` — one entry per failed field. */
export const validationIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});

/**
 * `BOOKING_CONFLICT.details` — the reservations that blocked the write.
 *
 * Carrying them is what lets the UI say *"conflicts with Jane Doe, 12–15 March"*
 * instead of "something went wrong"; a bare 409 would technically satisfy the contract
 * and be useless to the person looking at the form.
 */
export const bookingConflictDetailsSchema = z.array(reservationSummarySchema);

/**
 * `details` is optional and code-specific, so it is typed loosely here and narrowed by
 * the consumer with one of the schemas above. Making the envelope a discriminated union
 * over `code` was the alternative; it would force every unknown future code through a
 * schema change on the client, which is the opposite of what a stable envelope is for.
 */
export const errorResponseSchema = z.object({
  error: z.string(),
  code: errorCodeSchema,
  details: z.array(z.unknown()).optional(),
});
