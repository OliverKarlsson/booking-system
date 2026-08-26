/**
 * Types inferred from the schemas, so the contract has exactly one definition.
 *
 * Nothing here is hand-written structurally: if a schema changes, every consumer's
 * types change with it and the compiler finds the call sites. A parallel set of
 * hand-maintained interfaces would be free to drift from the validation that actually
 * runs, which is the failure mode this file exists to prevent.
 */
import type { z } from 'zod';

import type {
  paginationMetaSchema,
  paginationQuerySchema,
} from './schemas/common';
import type {
  addressSchema,
  createRentalUnitSchema,
  rentalUnitSchema,
  rentalUnitStatusSchema,
  updateRentalUnitSchema,
} from './schemas/rentalUnit';
import type {
  createReservationSchema,
  reservationQuerySchema,
  reservationSchema,
  reservationStatusSchema,
  reservationSummarySchema,
  updateReservationSchema,
} from './schemas/reservation';
import type {
  dashboardEntrySchema,
  dashboardQuerySchema,
  dashboardResponseSchema,
  dashboardRentalUnitSchema,
  occupancySchema,
} from './schemas/dashboard';
import type {
  errorResponseSchema,
  validationIssueSchema,
} from './errors';

/**
 * A calendar date as `YYYY-MM-DD`. An alias for `string`, not a branded type: branding
 * would be stronger, but it would also force a cast at every boundary where a date
 * arrives from SQL or JSON, and the Zod schemas already guard those boundaries.
 */
export type DateString = string;

export type Address = z.infer<typeof addressSchema>;
export type RentalUnitStatus = z.infer<typeof rentalUnitStatusSchema>;
export type RentalUnit = z.infer<typeof rentalUnitSchema>;
export type CreateRentalUnitInput = z.infer<typeof createRentalUnitSchema>;
export type UpdateRentalUnitInput = z.infer<typeof updateRentalUnitSchema>;

export type ReservationStatus = z.infer<typeof reservationStatusSchema>;
export type Reservation = z.infer<typeof reservationSchema>;
export type ReservationSummary = z.infer<typeof reservationSummarySchema>;
export type CreateReservationInput = z.infer<typeof createReservationSchema>;
export type UpdateReservationInput = z.infer<typeof updateReservationSchema>;
/** Post-parse shape: `page`, `limit`, and `status` are defaulted, so they are required here. */
export type ReservationQuery = z.infer<typeof reservationQuerySchema>;
/** Pre-parse shape, for callers building a query string. */
export type ReservationQueryInput = z.input<typeof reservationQuerySchema>;

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type PaginationQueryInput = z.input<typeof paginationQuerySchema>;
export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

/**
 * The §3.5 list envelope as a generic. `paginatedSchema()` builds the runtime validator;
 * this is its compile-time counterpart, since a generic function's return type can't be
 * `z.infer`red without instantiating it per item type.
 */
export interface Paginated<T> {
  data: T[];
  pagination: PaginationMeta;
}

export type Occupancy = z.infer<typeof occupancySchema>;
export type DashboardRentalUnit = z.infer<typeof dashboardRentalUnitSchema>;
export type DashboardEntry = z.infer<typeof dashboardEntrySchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
export type ValidationIssue = z.infer<typeof validationIssueSchema>;
