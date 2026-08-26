import type { ConflictingReservation } from '@/lib/apiClient';
import { formatDateRange } from '@/lib/formatDate';

/**
 * Turning a `BOOKING_CONFLICT` payload into the sentence the user actually needs.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * This is the point of the whole feature, and the reason the API is shaped as it is.
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * The backend goes to real trouble to produce this payload: the exclusion constraint
 * that actually prevents the double booking reports only SQLSTATE 23P01, which says
 * "a constraint rejected your row" and nothing about *whose* booking was in the way. So
 * the service runs a deliberately racy overlap `SELECT` — one whose only purpose is this
 * message — and puts the conflicting reservations in `details` (§3.4).
 *
 * Answering that with "Something went wrong" would throw away the entire design. The
 * user is looking at a form with four fields, one of which is wrong, and the server has
 * already told us which booking is in the way and on what dates. Saying so is the
 * difference between a form the user can fix and one they can only guess at.
 *
 * Dates are formatted from the `YYYY-MM-DD` strings directly (§3.7) — a conflict message
 * that named the wrong day would be worse than no message at all.
 */

/** `'Jane Doe (12–15 March 2026)'` — the guest and their stay, as one phrase. */
export function describeConflict(conflict: ConflictingReservation): string {
  return `${conflict.guestName} (${formatDateRange(conflict.startDate, conflict.endDate)})`;
}

/** `'Conflicts with Jane Doe (12–15 March 2026)'` — one line per blocking booking. */
export function conflictMessage(conflict: ConflictingReservation): string {
  return `Conflicts with ${describeConflict(conflict)}`;
}

/**
 * The heading above the list. Kept separate from the per-conflict lines so the count is
 * stated once rather than repeated, and so a single conflict — the overwhelmingly common
 * case — does not read as a list of one.
 */
export function conflictTitle(conflicts: ConflictingReservation[]): string {
  return conflicts.length === 1
    ? 'These dates are already booked'
    : `These dates overlap ${conflicts.length} existing bookings`;
}
