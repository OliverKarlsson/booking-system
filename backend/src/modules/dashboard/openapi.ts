import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { dashboardQuerySchema, isoDateTimeSchema } from '@booking/shared';

import { components } from '../../openapi/registry';
import { commonErrors, validationError } from '../../openapi/responses';

/**
 * OpenAPI path for `GET /v1/dashboard`.
 *
 * The one thing this operation has to communicate is a *negative*: there is no date
 * parameter, and a client should not go looking for one. The description says why rather
 * than leaving the omission to read as an oversight.
 */

export const DASHBOARD_TAG = 'Dashboard';

/**
 * The shared query schema, with `now` re-tagged for the document.
 *
 * `now` is accepted by the running server, so omitting it from the spec would make the
 * document a lie about the API's surface. But it is *not* part of the client-facing
 * contract, so it is documented and immediately disclaimed rather than presented as a
 * feature. The field is a ref-tagged copy of the same shared `isoDateTimeSchema` the
 * route validates with — the substitution changes how it renders, not what it accepts.
 */
const dashboardQuery = dashboardQuerySchema.extend({
  now: isoDateTimeSchema.optional().openapi({
    example: '2026-03-26T07:00:00Z',
    // `param` puts the text on the OpenAPI *parameter* rather than on its schema, which is
    // where Swagger UI and every generator look for a parameter's documentation.
    param: {
      description:
        '**Test-only, not part of the client-facing contract.** Overrides the server clock so boundary cases — checkout today, a back-to-back changeover, two units whose local dates have diverged — can be driven deterministically. Note it is an *instant*, not a date: it is still converted to a calendar date per unit in that unit\'s own zone, so even this escape hatch cannot smuggle a viewer\'s timezone into the calculation.',
    },
  }),
});

export const dashboardPaths: RouteConfig[] = [
  {
    method: 'get',
    path: '/dashboard',
    tags: [DASHBOARD_TAG],
    operationId: 'getDashboard',
    summary: 'Occupancy for every active rental unit',
    description: [
      '**The client sends no date.** A caller does not know what day it is at the property, and occupancy is a fact about the flat — whether someone is asleep in it right now. So "today" is resolved per unit, on the server, from that unit\'s own IANA timezone, and echoed back as `localDate` so the calculation is inspectable rather than opaque.',
      '',
      'With `D` = that unit\'s `localDate`, and confirmed reservations only:',
      '',
      '- **occupied** iff `startDate <= D < endDate`',
      '- a guest checking out *on* `D` leaves the unit **vacant** — `endDate == D` fails `D < endDate`',
      '- `nextCheckIn` is the earliest reservation with `startDate > D`. On a back-to-back changeover the departing guest is gone and the arriving guest is the `currentReservation`, because they check in on `D` itself',
      '- soft-deleted units are excluded entirely',
      '',
      '`localDate` may be displayed plainly ("as of 26 Mar") but must not be compared against the viewer\'s own date: all dates in this API are local to the property by convention, the way an airline ticket\'s departure time is, so there is nothing to reconcile.',
      '',
      'Not paginated. This is one row per active unit and it is the landing page — a partial dashboard is a worse answer than a slow one.',
    ].join('\n'),
    request: { query: dashboardQuery },
    responses: {
      200: {
        description:
          'One entry per active rental unit, ordered by name. Wrapped in `{ data }` but with no `pagination` — see above.',
        content: { 'application/json': { schema: components.dashboardResponse } },
      },
      400: validationError('`now` was not a valid ISO 8601 instant.'),
      ...commonErrors(),
    },
  },
];
