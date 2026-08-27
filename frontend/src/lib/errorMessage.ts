import {
  isApiError,
  isBookingConflict,
  isValidationError,
  type ConflictingReservation,
} from './apiClient';
import { conflictMessage } from './conflict';

/**
 * Turns a caught error into the sentence shown in an `ErrorBanner`.
 *
 * `ApiError.message` is already the server's human-readable `error` string from the §3.4
 * envelope, so it is used as-is; the branches below only add what the envelope keeps in
 * `details`, plus the generic fallback for a non-`ApiError` (a rendering bug, never a
 * response).
 *
 * This lives in `lib/` beside `apiClient` because it is the envelope's counterpart:
 * `apiClient` turns a response into a typed `ApiError`, and this turns that `ApiError`
 * back into a sentence. Every feature needs the same mapping, so a per-feature copy would
 * only be three chances to drift.
 */
export function toErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (isBookingConflict(error)) {
    // A 409 reaching a banner rather than the reservation form's `ConflictNotice` still
    // has to name the blocking booking, otherwise it degrades to the server's generic
    // "Reservation overlaps an existing booking" and the user cannot act on it.
    return error.details.map(conflictMessage).join('; ');
  }
  if (isValidationError(error) && error.details.length > 0) {
    // A validation error reaching the banner means a field the form does not surface was
    // rejected; naming the paths is the difference between a fixable message and a dead
    // end.
    const issues = error.details.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    return `${error.message} (${issues})`;
  }
  if (isApiError(error)) {
    // An unexpected server failure is the one case where the message alone is a dead end:
    // it is deliberately generic, so there is nothing in it to act on. Appending the
    // correlation id gives the user something to quote and support something to grep,
    // which is the entire reason the opaque 500 body is acceptable.
    //
    // Only for INTERNAL_ERROR. A conflict or a validation failure already says exactly
    // what is wrong, and an id bolted onto those would be noise suggesting a bug where
    // the user simply picked dates that were taken.
    if (error.code === 'INTERNAL_ERROR' && error.requestId) {
      return `${error.message} (reference: ${error.requestId})`;
    }
    return error.message;
  }
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
