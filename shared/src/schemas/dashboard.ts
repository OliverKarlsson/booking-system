import { z } from 'zod';
import { dateStringSchema, isoDateTimeSchema } from './common';
import { rentalUnitSchema } from './rentalUnit';
import { reservationSummarySchema } from './reservation';

export const occupancySchema = z.enum(['occupied', 'vacant']);

/**
 * The unit as the dashboard reports it: identity, name, its timezone, and the address.
 * `status` and the timestamps are omitted — soft-deleted units never appear here, so
 * `status` would be a constant, and nothing on the card is derived from either
 * timestamp.
 */
export const dashboardRentalUnitSchema = rentalUnitSchema.pick({
  id: true,
  name: true,
  timezone: true,
  address: true,
});

export const dashboardEntrySchema = z.object({
  rentalUnit: dashboardRentalUnitSchema,
  /**
   * The date the occupancy was evaluated against, resolved in *this unit's* timezone by
   * the server. Echoed back so the calculation is inspectable rather than opaque.
   *
   * The UI may print it ("as of 26 Mar"). It must not be compared against the viewer's
   * own date: per §3.7 there is no timezone comparison anywhere in this system, and
   * building an "this property is on a different day" affordance on top of this field
   * is exactly the design it exists to avoid.
   */
  localDate: dateStringSchema,
  occupancy: occupancySchema,
  /** Confirmed reservation with `startDate <= localDate < endDate`, if any. */
  currentReservation: reservationSummarySchema.nullable(),
  /** Earliest confirmed reservation with `startDate > localDate`, if any. */
  nextCheckIn: reservationSummarySchema.nullable(),
});

export const dashboardResponseSchema = z.object({
  data: z.array(dashboardEntrySchema),
});

/**
 * **The client sends no date.** "Today" is per property, in the property's own zone,
 * resolved by the server (§3.7) — which is what makes this endpoint both smaller and
 * more correct than one taking a date from the viewer.
 *
 * `now` overrides the server clock so boundary cases (checkout today, back-to-back
 * changeover, two units whose local dates have diverged) can be driven deterministically
 * from tests. It is not part of the client-facing contract.
 */
export const dashboardQuerySchema = z.object({
  now: isoDateTimeSchema.optional(),
});
