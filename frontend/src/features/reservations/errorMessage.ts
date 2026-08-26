import { isApiError, isBookingConflict, isValidationError } from '@/lib/apiClient';
import type { ConflictingReservation } from '@/lib/apiClient';
import { conflictMessage } from './conflict';

/**
 * Turns a caught error into the sentence shown in an `ErrorBanner`.
 *
 * `ApiError.message` is already the server's human-readable `error` string from the §3.4
 * envelope, so it is used as-is; the branches below only add what the envelope keeps in
 * `details` and the generic fallback for a non-`ApiError`.
 *
 * Deliberately a copy of `features/rentalUnits/errorMessage.ts` rather than an import
 * across feature directories — one more Wave 4 dedupe candidate. The addition here is the
 * conflict branch, so that a `BOOKING_CONFLICT` surfacing anywhere *other* than the form
 * still names the blocking booking instead of degrading to the server's generic
 * "Reservation overlaps an existing booking".
 */
export function toErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (isBookingConflict(error)) {
    return error.details.map(conflictMessage).join('; ');
  }
  if (isValidationError(error) && error.details.length > 0) {
    // A validation error reaching the banner means a field the form does not surface was
    // rejected; naming the paths is the difference between a fixable message and a dead
    // end.
    const issues = error.details.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    return `${error.message} (${issues})`;
  }
  if (isApiError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * The conflicting reservations from a failed write, or `undefined` for every other kind
 * of error.
 *
 * The narrowing is `isBookingConflict`'s, which validates the payload's shape at runtime
 * rather than casting it — `details` arrives over the network, and a malformed one must
 * fall through to the generic message instead of rendering `undefined (undefined)` where
 * a guest's name should be.
 */
export function toConflicts(error: unknown): ConflictingReservation[] | undefined {
  return isBookingConflict(error) ? error.details : undefined;
}
