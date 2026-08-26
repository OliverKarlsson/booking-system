import { randomUUID } from 'node:crypto';

import type {
  CreateReservationInput,
  Paginated,
  Reservation,
  ReservationQuery,
  UpdateReservationInput,
} from '@booking/shared';

import { isCheckViolation, isExclusionViolation, isForeignKeyViolation } from '../../db/errors';
import { pool, type Queryable } from '../../db/pool';
import {
  BookingConflictError,
  NotFoundError,
  RentalUnitNotFoundError,
  ValidationError,
} from '../../errors/AppError';
import * as repository from './reservations.repository';

/**
 * Reservation business rules.
 *
 * ───────────────────────────────────────────────────────────────────────────────────────
 *  THE CHECK IS FOR HUMANS. THE CONSTRAINT IS FOR CORRECTNESS.
 * ───────────────────────────────────────────────────────────────────────────────────────
 *
 * This module does **not** prevent double bookings, and it must never be changed to try.
 * That job belongs entirely to `reservation_no_overlap`, the `EXCLUDE USING gist`
 * constraint in db/schema.sql, which cannot be raced: two transactions inserting
 * overlapping stays for one unit make the second block on the GiST index and then fail
 * with SQLSTATE 23P01. There is no isolation level to pick, no lock to remember to take,
 * and no window between a check and a write for a competitor to slip through.
 *
 * What this module contributes is a *good error message*. A raw 23P01 says only "an
 * exclusion constraint rejected your row" — it does not say which booking was in the way,
 * and the reservation form needs to tell the user "conflicts with Jane Doe, 12–15 March".
 * So every write path runs an overlap `SELECT` first, purely to build that payload.
 *
 * That `SELECT` races. It is *supposed* to be allowed to race: it is a user-experience
 * affordance, not a guard. If a concurrent request commits between the check and the
 * insert, the constraint rejects the insert and the catch below re-queries to find out
 * who won. Correctness never depended on step 1 at any point.
 *
 * The practical test of this design: **deleting the pre-check entirely would degrade
 * error messages and would not permit a single double booking.** The inverse — deleting
 * the constraint and keeping the check — would look identical in every single-threaded
 * test and be wrong under load, which is exactly the failure this project is about. See
 * reservations.concurrency.integration.test.ts, which fires 20 simultaneous requests at
 * one slot, and schema.integration.test.ts, which reaches the constraint in raw SQL with
 * no application code in the path at all.
 */

/**
 * Runs the pre-check, inserts/updates, and converts a 23P01 rejection into the same
 * `BookingConflictError` the pre-check would have produced.
 *
 * Both call sites share this so the two paths cannot drift into disagreeing about what a
 * conflict response looks like — a `PATCH` that moves a stay onto an occupied slot must
 * be indistinguishable, to the client, from a `POST` onto the same slot.
 *
 * `excludeId` is passed on `PATCH` and matters *only to the pre-check*: a stay shifted by
 * one day still overlaps its own stored dates, so without it the `SELECT` would report
 * the row conflicting with itself and 409 a perfectly legal edit. The constraint needs no
 * such exclusion — an `UPDATE` replaces the row's own index entry, so it never collides
 * with its previous value. The two mechanisms are asymmetric here, and that asymmetry is
 * the reason the parameter exists.
 */
async function withConflictReporting<T>(
  db: Queryable,
  criteria: repository.OverlapCriteria,
  write: () => Promise<T>,
): Promise<T> {
  // 1. Query overlapping reservations first — purely to build a useful 409 payload.
  //    This SELECT is NOT what makes the operation safe; it races, and that is fine.
  const conflicts = await repository.findOverlapping(db, criteria);
  if (conflicts.length > 0) throw new BookingConflictError(conflicts);

  // 2. Write. If a concurrent request slipped in between the SELECT and here, the
  //    exclusion constraint rejects this write. Correctness never depended on step 1.
  try {
    return await write();
  } catch (err) {
    if (isExclusionViolation(err)) {
      // Re-query to name the winner. This can legitimately come back empty — the racing
      // reservation may itself have been cancelled in the meantime — so the error still
      // carries a usable message with an empty `details` rather than assuming a hit.
      const raced = await repository.findOverlapping(db, criteria);
      throw new BookingConflictError(raced);
    }

    // `reservation_valid_range` (end_date > start_date). Zod and the service both check
    // this before we get here, so reaching it means a validation path was bypassed; it is
    // reported as a 400 rather than a 500 because the request genuinely is invalid.
    if (isCheckViolation(err)) {
      throw new ValidationError('Reservation dates are invalid', [
        { path: 'endDate', message: 'End date must be after start date' },
      ]);
    }

    throw err;
  }
}

export async function createReservation(
  input: CreateReservationInput,
  db: Queryable = pool,
): Promise<Reservation> {
  // Checked explicitly because the foreign key cannot express it: a *soft-deleted* unit
  // is still a valid FK target, and §3.2 requires the referenced unit to be active.
  if (!(await repository.isBookableRentalUnit(db, input.rentalUnitId))) {
    throw new RentalUnitNotFoundError();
  }

  const criteria: repository.OverlapCriteria = {
    rentalUnitId: input.rentalUnitId,
    startDate: input.startDate,
    endDate: input.endDate,
  };

  try {
    return await withConflictReporting(db, criteria, () =>
      repository.insertReservation(db, {
        // Application-generated (§2), so the id exists before the round trip and a
        // client-side optimistic update has something stable to key on.
        id: randomUUID(),
        rentalUnitId: input.rentalUnitId,
        guestName: input.guestName,
        startDate: input.startDate,
        endDate: input.endDate,
      }),
    );
  } catch (err) {
    // The unit was hard-deleted between the check above and the insert. Rare, but the
    // honest answer is still "that unit does not exist", not a 500.
    if (isForeignKeyViolation(err)) throw new RentalUnitNotFoundError();
    throw err;
  }
}

export async function getReservation(id: string, db: Queryable = pool): Promise<Reservation> {
  const reservation = await repository.findReservationById(db, id);
  if (!reservation) throw new NotFoundError('Reservation not found');
  return reservation;
}

export async function listReservations(
  query: ReservationQuery,
  db: Queryable = pool,
): Promise<Paginated<Reservation>> {
  const { data, total } = await repository.listReservations(db, query);

  return {
    data,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      // A page past the end is an empty `data` with honest metadata, not a 404: the
      // collection exists, the client simply asked for a slice beyond it.
      totalPages: Math.ceil(total / query.limit),
    },
  };
}

export async function updateReservation(
  id: string,
  patch: UpdateReservationInput,
  db: Queryable = pool,
): Promise<Reservation> {
  const existing = await repository.findReservationById(db, id);
  if (!existing) throw new NotFoundError('Reservation not found');

  const startDate = patch.startDate ?? existing.startDate;
  const endDate = patch.endDate ?? existing.endDate;
  const status = patch.status ?? existing.status;

  // The shared schema can only compare two dates it was *given*, so a patch that moves
  // one endpoint has to be validated against the stored value for the other — that check
  // has nowhere to live but here. Lexicographic comparison is chronological comparison
  // for zero-padded ISO dates (§3.1), so there is nothing to parse.
  if (endDate <= startDate) {
    throw new ValidationError('Reservation dates are invalid', [
      { path: 'endDate', message: 'End date must be after start date' },
    ]);
  }

  const datesChanged = startDate !== existing.startDate || endDate !== existing.endDate;
  // Un-cancelling re-arms the constraint for this row: a cancelled stay blocks nothing,
  // so the slot it used to hold may have been booked by someone else since. Flipping it
  // back to confirmed has to be checked exactly like a fresh booking, even with untouched
  // dates. (The constraint catches it either way; this is what makes the 409 informative.)
  const becomingConfirmed = status === 'confirmed' && existing.status !== 'confirmed';

  const applyPatch = (): Promise<Reservation | undefined> =>
    repository.updateReservation(db, id, {
      ...(patch.guestName !== undefined ? { guestName: patch.guestName } : {}),
      ...(patch.startDate !== undefined ? { startDate: patch.startDate } : {}),
      ...(patch.endDate !== undefined ? { endDate: patch.endDate } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
    });

  // A rename, or a move that keeps a cancelled row cancelled, cannot conflict with
  // anything: the constraint only indexes confirmed rows. Skipping the pre-check there is
  // not an optimisation for its own sake — running it would mean 409ing a guest-name typo
  // fix on a stay whose dates were already legal.
  const needsConflictCheck = status === 'confirmed' && (datesChanged || becomingConfirmed);

  const updated = needsConflictCheck
    ? await withConflictReporting(
        db,
        { rentalUnitId: existing.rentalUnitId, startDate, endDate, excludeId: id },
        applyPatch,
      )
    : await applyPatch();

  // The row was deleted between the read and the write. Not reachable through this API —
  // nothing hard-deletes reservations — but returning `undefined` up the stack as if it
  // were a reservation would be worse than saying so.
  if (!updated) throw new NotFoundError('Reservation not found');
  return updated;
}

export async function cancelReservation(id: string, db: Queryable = pool): Promise<void> {
  const cancelled = await repository.cancelReservation(db, id);
  if (!cancelled) throw new NotFoundError('Reservation not found');
}
