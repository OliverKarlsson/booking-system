import { OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';

import { dashboardPaths, DASHBOARD_TAG } from '../modules/dashboard/openapi';
import { rentalUnitPaths, RENTAL_UNITS_TAG } from '../modules/rentalUnits/openapi';
import { reservationPaths, RESERVATIONS_TAG } from '../modules/reservations/openapi';
import { registry } from './registry';

/** The generator's own return type, so `openapi3-ts` need not be an explicit dependency. */
export type OpenApiDocument = ReturnType<OpenApiGeneratorV31['generateDocument']>;

const DESCRIPTION = [
  'A booking system for short-stay rental units. Two design decisions shape most of this API, and both are worth reading before integrating against it.',
  '',
  '### Overlapping reservations are impossible',
  '',
  'Two confirmed reservations for the same unit cannot overlap, and the guarantee belongs to the database rather than to application code: a single `EXCLUDE USING gist` constraint over `daterange(start_date, end_date, \'[)\')` enforces it under any level of concurrency. There is no lock to take, no isolation level to configure, and no window for two racing clients to both succeed.',
  '',
  'The interval is **half-open**, which is where most of the observable behaviour comes from. `startDate` is inclusive and `endDate` is exclusive, so a stay ending on the 12th and a stay starting on the 12th do not conflict — same-day turnover is allowed, as it is at every hotel. Cancelled reservations block nothing.',
  '',
  'A `409 BOOKING_CONFLICT` carries the blocking reservations in `details`, so a client can say *"conflicts with Jane Doe, 12–15 March"* rather than "something went wrong". That payload is the reason the write path runs an overlap query at all — the constraint reports only SQLSTATE `23P01` and cannot name the guest.',
  '',
  '### Reservation dates are calendar dates, never instants',
  '',
  '`startDate` and `endDate` are `YYYY-MM-DD` strings backed by Postgres `date` columns. They have no time and no timezone component, so there is no offset for anything to be shifted by — a stay booked for the 26th is the 26th for every client in every timezone. **Do not parse them into a `Date` for display**; format the string directly, or a browser offset will render some of them a day early.',
  '',
  'All dates are local to the property, the way an airline ticket\'s departure time is, so nothing is ever converted for a viewer and no timezone comparison exists in this API. The single exception is a conversion rather than a comparison: `GET /dashboard` resolves what day it currently is *at each property*, from that unit\'s IANA `timezone`, to decide whether it is occupied.',
  '',
  '`createdAt` and `updatedAt` are the deliberate opposite: those genuinely are instants, and serialize as ISO 8601.',
  '',
  '### Errors',
  '',
  'Every non-2xx response is `{ error, code, details? }`. Branch on `code` — it is a closed, enumerable set — and treat `error` as a human-readable message that may change. `details` is optional and code-specific; `VALIDATION_ERROR` and `BOOKING_CONFLICT` are the two codes that populate it. See `backend/API.md`.',
  '',
  '### Authentication',
  '',
  'There is none, deliberately. No operation declares a security scheme because none exists in this build — a linter flagging that is reading the document correctly. The intended design is JWT bearer auth with every rental unit belonging to an account and reservations inheriting access through their unit, scoped at the query layer rather than the route layer; it was traded against depth on the booking rule and is documented rather than implemented.',
].join('\n');

/**
 * Builds the OpenAPI 3.1 document from the registered Zod schemas and paths.
 *
 * Paths are passed as data and registered here rather than by import side effect, so that
 * "when does registration happen" has one answer and re-registering the same path twice is
 * not possible. The result is memoised by `openApiDocument()` below — generation walks
 * every schema and there is no reason to repeat it per request.
 */
let pathsRegistered = false;

export function buildOpenApiDocument(): OpenApiDocument {
  // The registry accumulates definitions, and it is a module singleton. Re-registering
  // would produce an identical document (paths are keyed by path + method, so duplicates
  // collapse) but would grow the definition list on every call — a leak with no symptom,
  // which is the kind worth closing at the source.
  if (!pathsRegistered) {
    for (const route of [...rentalUnitPaths, ...reservationPaths, ...dashboardPaths]) {
      registry.registerPath(route);
    }
    pathsRegistered = true;
  }

  const generator = new OpenApiGeneratorV31(registry.definitions);

  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Booking System API',
      version: '1.0.0',
      description: DESCRIPTION,
      // `identifier` (SPDX) rather than `url` — an OpenAPI 3.1 addition, and the right
      // half of the mutually exclusive pair when the licence is a standard one.
      license: { name: 'ISC', identifier: 'ISC' },
    },
    /*
     * The version is the base URL, not a header (§2). A relative server URL keeps the
     * document correct wherever it is served from — localhost, a container, a reverse
     * proxy — while still pinning `/v1` as the versioned root, and it is what makes
     * Swagger UI's "Try it out" hit the right origin without configuration.
     *
     * A future v2 is then a second mount on the same process and a second document, not a
     * deployment event: `/v1` keeps answering while `/v2` appears beside it.
     */
    servers: [{ url: '/v1', description: 'Version 1 of the API, relative to this host' }],
    tags: [
      { name: RENTAL_UNITS_TAG, description: 'Properties that can be booked. Soft-deleted, never removed.' },
      { name: RESERVATIONS_TAG, description: 'Stays. Half-open date intervals; cancelled rather than deleted.' },
      { name: DASHBOARD_TAG, description: 'Occupancy right now, resolved in each property\'s own timezone.' },
    ],
  });
}

let cached: OpenApiDocument | undefined;

/** The document, generated once per process. */
export function openApiDocument(): OpenApiDocument {
  cached ??= buildOpenApiDocument();
  return cached;
}
