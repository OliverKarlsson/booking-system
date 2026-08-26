import type { z } from 'zod';
import type {
  CreateReservationInput,
  RentalUnit,
  Reservation,
  UpdateReservationInput,
} from '@booking/shared';
import { createReservationSchema } from '@booking/shared';
import type { ReservationFilters } from '@/store';

/**
 * The pure, testable half of the reservation feature: what the form fields hold, how
 * those values become the two different request bodies the API accepts, and how the
 * filter slice becomes a query string.
 *
 * Kept out of the components — mirroring `rentalUnitModel.ts` — so the rules that are
 * actually easy to get wrong (never patching `rentalUnitId`, never sending an empty
 * `PATCH`, never letting an inverted date range reach the server) can be asserted
 * directly rather than through a rendered form.
 *
 * No function here constructs a `Date`. Reservation dates are `YYYY-MM-DD` calendar
 * strings from the column to the pixel (§3.7), and for zero-padded ISO dates
 * lexicographic order *is* chronological order, so `endDate > startDate` is a correct
 * comparison with nothing parsed.
 */

/**
 * Field values are the *input* type of the shared create schema rather than a
 * hand-written interface, so a change to the contract surfaces here as a type error
 * instead of as a form that has quietly stopped matching it.
 */
export type ReservationFormValues = z.input<typeof createReservationSchema>;

/**
 * A blank form. Every field is present as `''` rather than absent: react-hook-form treats
 * a field that starts out `undefined` as uncontrolled, and React then logs the
 * "changing an uncontrolled input to be controlled" warning the first time it is typed in.
 *
 * `rentalUnitId` can be pre-selected — booking from a unit's page should not make the
 * user pick the unit they just came from.
 */
export function emptyFormValues(rentalUnitId = ''): ReservationFormValues {
  return { rentalUnitId, guestName: '', startDate: '', endDate: '' };
}

/** Fills the form from an existing reservation, for the edit case. */
export function formValuesFromReservation(reservation: Reservation): ReservationFormValues {
  return {
    rentalUnitId: reservation.rentalUnitId,
    guestName: reservation.guestName,
    startDate: reservation.startDate,
    endDate: reservation.endDate,
  };
}

export function toCreateInput(values: ReservationFormValues): CreateReservationInput {
  return {
    rentalUnitId: values.rentalUnitId,
    guestName: values.guestName.trim(),
    startDate: values.startDate,
    endDate: values.endDate,
  };
}

/**
 * Diffs the submitted values against the stored reservation and returns only what
 * changed, or `null` when nothing did.
 *
 * Two rules are encoded here, both of them backend decisions rather than UI preferences:
 *
 * 1. **`rentalUnitId` is never in the patch.** `updateReservationSchema` omits it
 *    deliberately — moving a booking to a different property is a cancel-and-rebook, not
 *    an edit, because it silently relocates the stay's conflict domain. The form shows
 *    the unit read-only on edit for the same reason; this function is the enforcement.
 * 2. **An unchanged form sends no request.** `PATCH {}` is a deliberate 400 (the shared
 *    schema rejects an empty patch as a probable client bug), so pressing Save on an
 *    untouched form must produce no request at all rather than an error the user caused
 *    by doing nothing.
 *
 * `status` is absent too: cancelling is `DELETE` (§3.6), not a status patch, so there is
 * one way to cancel a booking rather than two that could diverge.
 */
export function buildReservationPatch(
  reservation: Reservation,
  values: ReservationFormValues,
): UpdateReservationInput | null {
  const patch: UpdateReservationInput = {};

  const guestName = values.guestName.trim();
  if (guestName !== reservation.guestName) patch.guestName = guestName;
  if (values.startDate !== reservation.startDate) patch.startDate = values.startDate;
  if (values.endDate !== reservation.endDate) patch.endDate = values.endDate;

  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * The `GET /v1/reservations` query params (§3.6), as sent.
 *
 * Absent filters are omitted rather than sent as `null`, because this object doubles as
 * the TanStack Query cache key: `{ from: null }` and `{}` describe the same request but
 * hash differently, which would split one list across two cache entries and leave a
 * stale one on screen after an invalidation.
 *
 * A `type` alias rather than an `interface`, and not by accident: `queryKeys.*.list()`
 * takes `Record<string, unknown>`, and TypeScript infers an implicit index signature for
 * an object *type* but never for an interface. Declaring it as an interface compiles
 * everywhere except the one call that matters.
 */
export type ReservationQueryParams = {
  rentalUnitId?: string;
  from?: string;
  to?: string;
  status: ReservationFilters['status'];
  page: number;
  limit: number;
};

export function toReservationQuery(
  filters: ReservationFilters,
  limit: number,
): ReservationQueryParams {
  return {
    ...(filters.rentalUnitId ? { rentalUnitId: filters.rentalUnitId } : {}),
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    status: filters.status,
    page: filters.page,
    limit,
  };
}

/**
 * Validates the filter bar's date window before it is ever requested.
 *
 * `reservationQuerySchema` refines `to > from`, so an inverted window is a 400 from the
 * API. Catching it here turns a red error banner into an inline hint on the field that
 * caused it, and — more importantly — stops the list from being replaced by an error
 * state while the user is still mid-way through typing the second date.
 */
export function dateRangeError(from: string | null, to: string | null): string | undefined {
  if (!from || !to) return undefined;
  return to > from ? undefined : 'The end of the window must be after the start.';
}

/** Units as `<Select>` options, for the filter bar and the create form. */
export function toRentalUnitOptions(units: RentalUnit[]): { value: string; label: string }[] {
  return units.map((unit) => ({ value: unit.id, label: unit.name }));
}

/**
 * Unit id → name, for the list rows.
 *
 * A lookup rather than a join on the reservation: `GET /v1/reservations` returns
 * `rentalUnitId` and not the unit itself (§3.2), and fetching each row's unit separately
 * would be an N+1 across the page. The units are already loaded for the filter picker, so
 * naming them costs nothing extra.
 */
export function toUnitNames(units: RentalUnit[]): Record<string, string> {
  return Object.fromEntries(units.map((unit) => [unit.id, unit.name]));
}
