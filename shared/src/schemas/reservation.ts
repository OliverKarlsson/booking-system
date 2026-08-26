import { z } from 'zod';
import { dateStringSchema, isoDateTimeSchema, paginationQuerySchema, uuidSchema } from './common';

export const reservationStatusSchema = z.enum(['confirmed', 'cancelled']);

const guestNameSchema = z
  .string()
  .trim()
  .min(1, { message: 'Guest name is required' })
  .max(120, { message: 'Guest name must be at most 120 characters' });

/**
 * `startDate` is inclusive (check-in), `endDate` is **exclusive** (check-out): the
 * interval is `[startDate, endDate)`. Every rule in the system falls out of that one
 * choice — a stay ending on the 10th and a stay starting on the 10th do not overlap,
 * and a unit whose guest checks out today reads vacant today.
 */
const reservationDatesShape = {
  startDate: dateStringSchema,
  endDate: dateStringSchema,
};

/**
 * `endDate > startDate` strictly: a reservation is at least one night. This mirrors the
 * `reservation_valid_range` CHECK constraint rather than replacing it — the database
 * still refuses the row if a write ever reaches it another way.
 */
const VALID_RANGE_MESSAGE = 'End date must be after start date';

const hasValidRange = (value: { startDate: string; endDate: string }): boolean => value.endDate > value.startDate;

const reservationBaseSchema = z.object({
  id: uuidSchema,
  rentalUnitId: uuidSchema,
  guestName: guestNameSchema,
  ...reservationDatesShape,
  status: reservationStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

export const reservationSchema = reservationBaseSchema.refine(hasValidRange, {
  message: VALID_RANGE_MESSAGE,
  path: ['endDate'],
});

/**
 * The reservation as it appears *inside* another payload: `BOOKING_CONFLICT.details`
 * (§3.4) and the dashboard's `currentReservation` / `nextCheckIn` (§3.6).
 *
 * One definition for both, because both exist for the same reason — naming a guest and
 * their dates — and two copies would drift.
 */
export const reservationSummarySchema = reservationBaseSchema.pick({
  id: true,
  guestName: true,
  startDate: true,
  endDate: true,
});

/**
 * `status` is absent: a reservation is created `confirmed`, and `DELETE` cancels it.
 */
export const createReservationSchema = z
  .object({
    rentalUnitId: uuidSchema,
    guestName: guestNameSchema,
    ...reservationDatesShape,
  })
  .refine(hasValidRange, { message: VALID_RANGE_MESSAGE, path: ['endDate'] });

/**
 * Partial update. `rentalUnitId` is intentionally not updatable — moving a booking to a
 * different property is a cancel-and-rebook, not an edit, and treating it as an edit
 * would silently relocate a reservation's conflict domain.
 *
 * The range check only fires when both dates are present; a patch that moves only
 * `endDate` has to be validated against the *stored* `startDate`, which is the
 * service's job (and the `reservation_valid_range` CHECK constraint's backstop).
 */
export const updateReservationSchema = z
  .object({
    guestName: guestNameSchema,
    startDate: dateStringSchema,
    endDate: dateStringSchema,
    status: reservationStatusSchema,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'At least one field must be provided',
  })
  .refine(
    (patch) => patch.startDate === undefined || patch.endDate === undefined || patch.endDate > patch.startDate,
    { message: VALID_RANGE_MESSAGE, path: ['endDate'] },
  );

/**
 * `from`/`to` describe a window that returned reservations must **overlap**, using the
 * same half-open rule as everything else (§3.3) — a stay straddling the window's edge
 * is in the result set, it is not "not contained, therefore excluded".
 *
 * `status` defaults to `confirmed` because a list of bookings that includes cancelled
 * ones is, in practice, always the wrong default for a calendar view.
 */
export const reservationQuerySchema = paginationQuerySchema
  .extend({
    rentalUnitId: uuidSchema.optional(),
    from: dateStringSchema.optional(),
    to: dateStringSchema.optional(),
    status: reservationStatusSchema.default('confirmed'),
  })
  .refine((query) => query.from === undefined || query.to === undefined || query.to > query.from, {
    message: 'to must be after from',
    path: ['to'],
  });
