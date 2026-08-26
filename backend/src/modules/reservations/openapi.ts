import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { reservationQuerySchema, uuidSchema } from '@booking/shared';
import { z } from 'zod';

import { paginationQuery } from '../../openapi/parameters';
import { components } from '../../openapi/registry';
import {
  bookingConflict,
  commonErrors,
  malformedId,
  noContent,
  notFound,
  rentalUnitNotFound,
  validationError,
} from '../../openapi/responses';

/**
 * OpenAPI paths for `/v1/reservations`.
 *
 * The descriptions here carry more weight than on the other two resources, because the
 * two rules a client most needs to know are not expressible in a schema: that the
 * interval is half-open (so same-day turnover is legal), and that a 409 carries the
 * conflicting reservations in `details`. Both are stated on the operations they affect.
 */

export const RESERVATIONS_TAG = 'Reservations';

const idParams = z.object({
  id: uuidSchema.openapi({ param: { description: 'Reservation id (UUID v4).' } }),
});

/**
 * The shared query schema with per-parameter descriptions attached.
 *
 * `reservationQuerySchema` is a `ZodEffects` — it carries the cross-field `to > from`
 * refinement — so `.innerType()` is needed to reach the object underneath. Nothing is lost
 * by unwrapping: the generator unwraps query effects itself, and a cross-field rule is not
 * expressible in OpenAPI anyway (it is documented in the 400 response instead). Each field
 * below is the identical shared schema with documentation attached, not a restatement.
 */
const reservationQueryShape = reservationQuerySchema.innerType().shape;

const reservationQuery = reservationQuerySchema.innerType().extend({
  ...paginationQuery.shape,
  rentalUnitId: reservationQueryShape.rentalUnitId.openapi({
    param: { description: 'Only reservations for this rental unit.' },
  }),
  from: reservationQueryShape.from.openapi({
    example: '2026-03-01',
    param: {
      description:
        'Start of the window, inclusive. Returns reservations that **overlap** `[from, to)` — a stay straddling the edge is included, not excluded for failing to be contained.',
    },
  }),
  to: reservationQueryShape.to.openapi({
    example: '2026-04-01',
    param: { description: 'End of the window, exclusive. Must be after `from`.' },
  }),
  status: reservationQueryShape.status.openapi({
    param: {
      description:
        'Defaults to `confirmed`. A calendar view that silently included cancelled bookings is the wrong default in practice, so the wider set has to be asked for explicitly.',
    },
  }),
});

const HALF_OPEN_NOTE =
  '`startDate` is inclusive (check-in) and `endDate` is **exclusive** (check-out): the stay is the half-open interval `[startDate, endDate)`. A reservation is at least one night, so `endDate > startDate` strictly.';

export const reservationPaths: RouteConfig[] = [
  {
    method: 'post',
    path: '/reservations',
    tags: [RESERVATIONS_TAG],
    operationId: 'createReservation',
    summary: 'Create a reservation',
    description: `${HALF_OPEN_NOTE}\n\nOverlaps are prevented by an \`EXCLUDE USING gist\` constraint in the database, not by application code, so the rule holds under any concurrency — twenty simultaneous requests for one slot produce exactly one 201 and nineteen 409s. The service adds only the *message*: it runs an overlap query purely to populate \`details\` on the 409.`,
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: components.createReservation } },
      },
    },
    responses: {
      201: {
        description: 'The created reservation, born `confirmed`.',
        content: { 'application/json': { schema: components.reservation } },
      },
      400: validationError(),
      404: rentalUnitNotFound(),
      409: bookingConflict(),
      ...commonErrors(),
    },
  },
  {
    method: 'get',
    path: '/reservations',
    tags: [RESERVATIONS_TAG],
    operationId: 'listReservations',
    summary: 'List reservations',
    description:
      '`from`/`to` describe a window that returned reservations must **overlap**, using the same half-open rule as everything else — a stay straddling the window edge is in the result set; it is not "not contained, therefore excluded". `status` defaults to `confirmed`, because a calendar view that silently includes cancelled bookings is the wrong default in practice. Sorted by `startDate` ascending, with the id as a tie-break so paging is stable.',
    request: { query: reservationQuery },
    responses: {
      200: {
        description: 'A page of reservations in the §3.5 list envelope.',
        content: { 'application/json': { schema: components.paginatedReservations } },
      },
      400: validationError(
        'Invalid filters — a malformed date, a `to` that is not after `from`, or an out-of-range `page`/`limit`.',
      ),
      ...commonErrors(),
    },
  },
  {
    method: 'get',
    path: '/reservations/{id}',
    tags: [RESERVATIONS_TAG],
    operationId: 'getReservation',
    summary: 'Get a reservation',
    description:
      'Cancelled reservations remain readable by id — the status field preserves history rather than erasing it.',
    request: { params: idParams },
    responses: {
      200: {
        description: 'The reservation.',
        content: { 'application/json': { schema: components.reservation } },
      },
      400: malformedId(),
      404: notFound('Reservation'),
      ...commonErrors(),
    },
  },
  {
    method: 'patch',
    path: '/reservations/{id}',
    tags: [RESERVATIONS_TAG],
    operationId: 'updateReservation',
    summary: 'Update a reservation',
    description: `Re-checks overlap when the dates move, excluding the reservation itself — a stay shifted by one day still overlaps its own stored dates, so without that exclusion a perfectly legal edit would 409 against itself.\n\nSetting \`status\` back to \`confirmed\` is also re-checked, because a cancelled stay blocks nothing and its old slot may have been taken since. \`rentalUnitId\` is **not** updatable: moving a booking to a different property is a cancel-and-rebook, not an edit, and treating it as an edit would silently relocate the reservation's conflict domain. A patch that moves only one date is validated against the stored value for the other.`,
    request: {
      params: idParams,
      body: {
        required: true,
        content: { 'application/json': { schema: components.updateReservation } },
      },
    },
    responses: {
      200: {
        description: 'The updated reservation.',
        content: { 'application/json': { schema: components.reservation } },
      },
      400: validationError(),
      404: notFound('Reservation'),
      409: bookingConflict(),
      ...commonErrors(),
    },
  },
  {
    method: 'delete',
    path: '/reservations/{id}',
    tags: [RESERVATIONS_TAG],
    operationId: 'cancelReservation',
    summary: 'Cancel a reservation',
    description:
      'Cancels rather than removes: sets `status` to `cancelled`. The row survives, so a manager can still see what used to be booked and can still read it back through `GET /reservations/{id}`; the exclusion constraint stops counting it, so its slot becomes bookable again immediately. Idempotent — cancelling an already-cancelled reservation is another 204, not a 404, so the operation is safe to retry.',
    request: { params: idParams },
    responses: {
      204: noContent(
        'Cancelled. No body: the only state change is one the client requested, and it already knows the id.',
      ),
      400: malformedId(),
      404: notFound('Reservation'),
      ...commonErrors(),
    },
  },
];
