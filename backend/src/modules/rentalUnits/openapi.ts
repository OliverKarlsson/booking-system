import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { uuidSchema } from '@booking/shared';
import { z } from 'zod';

import { paginationQuery } from '../../openapi/parameters';
import { components } from '../../openapi/registry';
import {
  commonErrors,
  malformedId,
  noContent,
  notFound,
  unitHasReservations,
  validationError,
} from '../../openapi/responses';

/**
 * OpenAPI paths for `/v1/rental-units`, kept next to the routes they describe.
 *
 * A separate file rather than annotations on `rentalUnits.routes.ts`: the route module is
 * already the place where a reader looks for behaviour, and interleaving document
 * metadata with handlers makes both harder to scan. Exported as data rather than
 * registered as an import side effect so `openapi/document.ts` controls when — and how
 * often — registration happens.
 */

export const RENTAL_UNITS_TAG = 'Rental units';

/**
 * The same `z.object({ id: uuidSchema })` the route validates with. It cannot be imported
 * from `rentalUnits.routes.ts` (it is private there, and that file belongs to another
 * task), so it is rebuilt from the shared `uuidSchema` — the part that carries the actual
 * format — rather than described as a bare string.
 */
const idParams = z.object({
  id: uuidSchema.openapi({ param: { description: 'Rental unit id (UUID v4).' } }),
});

export const rentalUnitPaths: RouteConfig[] = [
  {
    method: 'post',
    path: '/rental-units',
    tags: [RENTAL_UNITS_TAG],
    operationId: 'createRentalUnit',
    summary: 'Create a rental unit',
    description:
      '`timezone` is required and must be an IANA identifier such as `Europe/Stockholm` — never a fixed offset like `+01:00`, which cannot express DST and would report the wrong local date for half the year. It is the authority for "what day is it at this property", which is what the dashboard\'s occupancy badge depends on.',
    request: {
      body: {
        required: true,
        content: { 'application/json': { schema: components.createRentalUnit } },
      },
    },
    responses: {
      201: {
        description: 'The created unit. Single resources are returned bare, not wrapped.',
        content: { 'application/json': { schema: components.rentalUnit } },
      },
      400: validationError(),
      ...commonErrors(),
    },
  },
  {
    method: 'get',
    path: '/rental-units',
    tags: [RENTAL_UNITS_TAG],
    operationId: 'listRentalUnits',
    summary: 'List rental units',
    description:
      'Soft-deleted units are excluded. Sorted by name, with the id as a tie-break so paging cannot show or skip a row across two requests.',
    request: { query: paginationQuery },
    responses: {
      200: {
        description: 'A page of rental units in the §3.5 list envelope.',
        content: { 'application/json': { schema: components.paginatedRentalUnits } },
      },
      400: validationError(
        'An out-of-range `page`/`limit` is rejected rather than clamped: a client asking for 1000 rows and silently receiving 100 is a harder bug to notice than a 400.',
      ),
      ...commonErrors(),
    },
  },
  {
    method: 'get',
    path: '/rental-units/{id}',
    tags: [RENTAL_UNITS_TAG],
    operationId: 'getRentalUnit',
    summary: 'Get a rental unit',
    request: { params: idParams },
    responses: {
      200: {
        description: 'The rental unit.',
        content: { 'application/json': { schema: components.rentalUnit } },
      },
      400: malformedId(),
      404: notFound('Rental unit'),
      ...commonErrors(),
    },
  },
  {
    method: 'patch',
    path: '/rental-units/{id}',
    tags: [RENTAL_UNITS_TAG],
    operationId: 'updateRentalUnit',
    summary: 'Update a rental unit',
    description:
      '`timezone` is patchable like any other field. Because reservation dates are calendar dates, the zone never participates in interpreting stored rows — changing it reinterprets nothing and only moves the dashboard\'s derived `localDate`. Freezing it would protect nothing while making a mis-picked zone permanently uncorrectable, since a unit with reservations cannot be deleted either. `status` is not patchable: exposing it would be an unguarded second route around the delete rule. An empty patch is a 400, not a silent no-op.',
    request: {
      params: idParams,
      body: {
        required: true,
        content: { 'application/json': { schema: components.updateRentalUnit } },
      },
    },
    responses: {
      200: {
        description: 'The updated rental unit.',
        content: { 'application/json': { schema: components.rentalUnit } },
      },
      400: validationError(),
      404: notFound('Rental unit'),
      ...commonErrors(),
    },
  },
  {
    method: 'delete',
    path: '/rental-units/{id}',
    tags: [RENTAL_UNITS_TAG],
    operationId: 'deleteRentalUnit',
    summary: 'Soft-delete a rental unit',
    description:
      'Sets `status` to `deleted` rather than removing the row, because cancelled reservations may still reference the unit and keeping the row keeps those historical references resolvable. Idempotent: deleting an already-deleted unit returns 404, exactly as a nonexistent one does — a client that cannot distinguish its own second call from a wrong id is what makes the retry safe.',
    request: { params: idParams },
    responses: {
      204: noContent('Deleted. No body: a deleted unit is not a resource the client should keep.'),
      400: malformedId(),
      404: notFound('Rental unit'),
      409: unitHasReservations(),
      ...commonErrors(),
    },
  },
];
