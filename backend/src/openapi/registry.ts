import { OpenAPIRegistry, extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import {
  createRentalUnitSchema,
  createReservationSchema,
  dashboardEntrySchema,
  dashboardRentalUnitSchema,
  dashboardResponseSchema,
  errorResponseSchema,
  paginatedSchema,
  paginationMetaSchema,
  rentalUnitSchema,
  reservationSchema,
  reservationSummarySchema,
  updateRentalUnitSchema,
  updateReservationSchema,
  validationIssueSchema,
  type ErrorCode,
} from '@booking/shared';
import { z } from 'zod';

/**
 * The OpenAPI document is *generated from the shared Zod schemas*, never hand-written.
 *
 * That is the whole point of this module. A hand-maintained spec is a second, weaker
 * definition of the contract: it agrees with the code on the day it is written and drifts
 * silently forever after, and the drift is invisible precisely because nothing executes
 * the document. Here the objects that validate every request are the objects the
 * document is rendered from, so "the spec is wrong" and "validation is wrong" become the
 * same bug — and the second one has tests.
 *
 * The cost is that the document can only say what the schemas can express. Behaviour that
 * lives in a service rather than a schema (which 404 code a missing rental unit produces,
 * that DELETE cancels rather than removes) is attached here as descriptions and examples,
 * and those *can* drift. They are kept short and pinned to real response bodies for that
 * reason — see `responses.ts`.
 */

/**
 * `extendZodWithOpenApi` adds `.openapi()` to `ZodType.prototype`. Patching the prototype
 * is what lets it reach schemas constructed *before* the call — which is every schema in
 * @booking/shared.
 *
 * The catch is that "the prototype" is per module instance, and this project reliably has
 * two. Under Node the backend is CommonJS and both workspaces `require('zod')`, resolving
 * the one hoisted copy. Under Vitest, backend sources are transformed to ESM and get zod's
 * ESM build, while `@booking/shared` is consumed as its built CJS `dist/` and gets zod's
 * CJS build. Same version, same files on disk, two `ZodType.prototype` objects — so
 * patching only the one this module imported leaves every shared schema without
 * `.openapi()`, which is a `TypeError` at registration time.
 *
 * Both are therefore extended. The call is idempotent (it returns early if `.openapi` is
 * already present), so in the single-instance case the second call is a no-op rather than
 * a double-wrap of `optional`/`nullable`.
 */
extendZodWithOpenApi(z);

/**
 * Recovers the constructors of whichever zod instance built the shared schemas, by walking
 * a known shared schema's prototype chain: the last prototype before `Object.prototype` is
 * `ZodType.prototype`, and the first is `ZodObject.prototype`.
 *
 * Structural rather than name-based on purpose — `constructor.name` survives zod's current
 * unminified build but is not something to depend on. `extendZodWithOpenApi` reads exactly
 * these two constructors and nothing else off the module namespace, so this stand-in is
 * sufficient. It is also the reason the generator itself is safe across instances: it
 * discriminates on `_def.typeName`, never `instanceof`.
 */
function sharedZodConstructors(): typeof z {
  const objectPrototype: object = Object.getPrototypeOf(paginationMetaSchema);

  let base = objectPrototype;
  for (
    let next = Object.getPrototypeOf(base);
    next !== null && next !== Object.prototype;
    next = Object.getPrototypeOf(base)
  ) {
    base = next;
  }

  return {
    ZodType: (base as { constructor: unknown }).constructor,
    ZodObject: (objectPrototype as { constructor: unknown }).constructor,
  } as unknown as typeof z;
}

extendZodWithOpenApi(sharedZodConstructors());

export const registry = new OpenAPIRegistry();

/**
 * `registry.register()` returns a *copy* of the schema tagged with a component name; the
 * shared instance is untouched. Nested fields therefore still hold the untagged original,
 * so a schema referenced from two places is inlined at both unless the tagged copy is
 * substituted back in.
 *
 * Every substitution below swaps a field for a ref-tagged copy of the identical shared
 * schema. The shape is unchanged by construction — only how it renders in the document —
 * which is why this is not the "rebuild the schema by hand" drift the module exists to
 * avoid.
 */
const paginationMeta = registry.register('PaginationMeta', paginationMetaSchema);
const reservationSummary = registry.register('ReservationSummary', reservationSummarySchema);
const validationIssue = registry.register('ValidationIssue', validationIssueSchema);

const rentalUnit = registry.register('RentalUnit', rentalUnitSchema);
const createRentalUnit = registry.register('CreateRentalUnit', createRentalUnitSchema);
const updateRentalUnit = registry.register('UpdateRentalUnit', updateRentalUnitSchema);

const reservation = registry.register('Reservation', reservationSchema);
const createReservation = registry.register('CreateReservation', createReservationSchema);
const updateReservation = registry.register('UpdateReservation', updateReservationSchema);

const dashboardRentalUnit = registry.register('DashboardRentalUnit', dashboardRentalUnitSchema);

const dashboardEntry = registry.register(
  'DashboardEntry',
  dashboardEntrySchema.extend({
    rentalUnit: dashboardRentalUnit,
    currentReservation: reservationSummary.nullable(),
    nextCheckIn: reservationSummary.nullable(),
  }),
);

/**
 * The §3.5 list envelope, built with the shared `paginatedSchema` helper rather than
 * restated — so a change to the envelope reaches the document without anyone editing it.
 */
const paginatedRentalUnits = registry.register(
  'PaginatedRentalUnits',
  paginatedSchema(rentalUnit).extend({ pagination: paginationMeta }),
);

const paginatedReservations = registry.register(
  'PaginatedReservations',
  paginatedSchema(reservation).extend({ pagination: paginationMeta }),
);

/**
 * The §3.4 envelope. `details` is deliberately open (`unknown[]`) in the shared schema
 * because it is code-specific, so the two codes that actually carry a payload get their
 * own narrowed component below. A client reading the generic envelope still knows
 * `details` may be present; a client handling `BOOKING_CONFLICT` gets the exact shape.
 */
const errorResponse = registry.register('ErrorResponse', errorResponseSchema);

function narrowedErrorSchema<C extends ErrorCode, D extends z.ZodTypeAny>(code: C, details: D) {
  return errorResponseSchema.extend({
    // `z.literal` rather than the full `code` enum: on a specific response the code is
    // known, and pinning it lets a generated client discriminate without a runtime check.
    code: z.literal(code),
    details: details.optional(),
  });
}

const validationErrorResponse = registry.register(
  'ValidationErrorResponse',
  narrowedErrorSchema('VALIDATION_ERROR', z.array(validationIssue)),
);

/**
 * The reason `details` exists at all (§3.4).
 *
 * A bare 409 satisfies the letter of the contract and leaves the reservation form with
 * nothing to say beyond "that didn't work". Carrying the blocking reservations is what
 * lets the UI say *"conflicts with Jane Doe, 12–15 March"* — so the document types the
 * payload precisely and `responses.ts` shows a populated example rather than an empty
 * array.
 *
 * `z.array(reservationSummary)` is the shared `bookingConflictDetailsSchema` with the
 * ref-tagged item substituted in; same shape, one `$ref` instead of a second inline copy.
 */
const bookingConflictResponse = registry.register(
  'BookingConflictResponse',
  narrowedErrorSchema('BOOKING_CONFLICT', z.array(reservationSummary)),
);

export const components = {
  rentalUnit,
  createRentalUnit,
  updateRentalUnit,
  paginatedRentalUnits,
  reservation,
  createReservation,
  updateReservation,
  paginatedReservations,
  reservationSummary,
  dashboardEntry,
  /**
   * Registered from the shared response schema so the dashboard's `{ data: [...] }`
   * envelope — which is *not* the paginated one, deliberately (§3.6) — is documented as
   * its own component rather than inlined.
   */
  dashboardResponse: registry.register(
    'DashboardResponse',
    dashboardResponseSchema.extend({ data: z.array(dashboardEntry) }),
  ),
  errorResponse,
  validationErrorResponse,
  bookingConflictResponse,
} as const;
