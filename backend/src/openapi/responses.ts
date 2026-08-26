import type { ResponseConfig } from '@asteasolutions/zod-to-openapi';
import type { ErrorResponse } from '@booking/shared';
import { z } from 'zod';

import { components } from './registry';

/**
 * Reusable error responses, one per code in §3.4.
 *
 * Every `example` below is a **real response body**, copied from the message the
 * corresponding `AppError` subclass carries and shaped by `middleware/errorHandler.ts`.
 * That includes a detail easy to get wrong: `errorHandler` only emits `details` when the
 * error actually carries one, so `NOT_FOUND` and `UNIT_HAS_RESERVATIONS` examples have no
 * `details` key at all, while `INTERNAL_ERROR` has an empty array — because that is what
 * the handler sends. A document that invented a uniform shape here would be teaching
 * clients to expect a field that never arrives.
 */

/** `example` is typed as the shared envelope so an invented field cannot slip in. */
function errorResponse(
  description: string,
  example: ErrorResponse,
  schema: z.ZodTypeAny = components.errorResponse,
): ResponseConfig {
  return {
    description,
    content: { 'application/json': { schema, example } },
  };
}

export const validationError = (
  description = 'The request body, query string, or path parameter failed validation.',
): ResponseConfig =>
  errorResponse(
    description,
    {
      error: 'Request validation failed',
      code: 'VALIDATION_ERROR',
      details: [{ path: 'endDate', message: 'End date must be after start date' }],
    },
    components.validationErrorResponse,
  );

/**
 * A malformed path id is a 400, not a 404 — the id could not identify a resource in any
 * state of the database, so "does not exist" would be a guess dressed as a fact. Every
 * `/{id}` route documents this response for that reason.
 */
export const malformedId = (): ResponseConfig =>
  errorResponse(
    'The path parameter is not a UUID. A malformed id is a bad request rather than a 404: it could never identify a resource, in any state of the database.',
    {
      error: 'Request validation failed',
      code: 'VALIDATION_ERROR',
      details: [{ path: 'id', message: 'Must be a UUID' }],
    },
    components.validationErrorResponse,
  );

export const notFound = (resource: 'Reservation' | 'Rental unit'): ResponseConfig =>
  errorResponse(
    resource === 'Rental unit'
      ? 'No such rental unit. A soft-deleted unit reads identically to one that never existed — the contract has no "deleted" state for a client to branch on.'
      : 'No such reservation.',
    // No `details` key: `NotFoundError` carries none, and `errorHandler` omits the field
    // entirely rather than sending an empty array.
    { error: `${resource} not found`, code: 'NOT_FOUND' },
  );

/**
 * Distinct from `NOT_FOUND` on purpose. A reservation write names two ids — the
 * reservation and its rental unit — so a single 404 code would leave the client guessing
 * which one was bad. `RENTAL_UNIT_NOT_FOUND` says it was the unit.
 */
export const rentalUnitNotFound = (): ResponseConfig =>
  errorResponse(
    'The referenced rental unit does not exist or has been soft-deleted. Distinct from NOT_FOUND so the form can say "that unit no longer exists" rather than leaving the caller to guess which of the two ids in the request was wrong.',
    { error: 'Rental unit not found', code: 'RENTAL_UNIT_NOT_FOUND' },
  );

/**
 * The response the whole design exists to make useful.
 *
 * Overlap prevention is an `EXCLUDE USING gist` constraint in the database, which reports
 * only SQLSTATE 23P01 — it cannot say *which* booking was in the way. The write path
 * therefore runs a (deliberately racy, non-authoritative) overlap SELECT purely to
 * populate `details`, so a client can name the conflicting guest and dates instead of
 * rendering a generic failure. The example is populated for exactly that reason: an empty
 * `details` would document the field without showing what it is for.
 */
export const bookingConflict = (): ResponseConfig =>
  errorResponse(
    'The requested dates overlap a confirmed reservation on the same unit. `details` lists the reservations that blocked the write, so the client can name the guest and dates — e.g. "Conflicts with Jane Doe (12–15 March)". Same-day turnover is not a conflict: the interval is half-open, so a stay ending on the 12th and one starting on the 12th coexist.',
    {
      error: 'Reservation overlaps an existing booking',
      code: 'BOOKING_CONFLICT',
      details: [
        {
          id: '8f14e45f-ceea-4d0a-9c1b-2f2a1c8d3b71',
          guestName: 'Jane Doe',
          startDate: '2026-03-12',
          endDate: '2026-03-15',
        },
      ],
    },
    components.bookingConflictResponse,
  );

export const unitHasReservations = (): ResponseConfig =>
  errorResponse(
    'The unit still has non-cancelled reservations. 409 rather than 400: the request is well-formed and the unit exists, so nothing in the message could be corrected — it is the state of the resource that refuses.',
    {
      error: 'Cannot delete a rental unit with 3 non-cancelled reservation(s)',
      code: 'UNIT_HAS_RESERVATIONS',
    },
  );

export const rateLimited = (): ResponseConfig =>
  errorResponse(
    'Too many requests. The limit is applied per process across all of `/v1`; `GET /health` is deliberately exempt.',
    { error: 'Too many requests, please try again later', code: 'RATE_LIMITED' },
  );

export const internalError = (): ResponseConfig =>
  errorResponse(
    'An unexpected failure. The message is always this fixed string — no stack trace, no driver error, no SQL — because an error the API did not anticipate is not one the caller can act on, and a driver message is a free schema map for anyone probing the API. The request id in the logs is the artefact that matters.',
    { error: 'An unexpected error occurred', code: 'INTERNAL_ERROR', details: [] },
  );

/**
 * Attached to every operation, so the document does not imply that only some endpoints
 * are rate limited or can fail unexpectedly.
 */
export const commonErrors = (): Record<string, ResponseConfig> => ({
  429: rateLimited(),
  500: internalError(),
});

/** 204 carries no body; the interesting answers on these routes are the failures. */
export const noContent = (description: string): ResponseConfig => ({ description });
