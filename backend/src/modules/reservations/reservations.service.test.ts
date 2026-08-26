import type { Reservation, ReservationSummary } from '@booking/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SQLSTATE } from '../../db/errors';
import type { Queryable } from '../../db/pool';
import {
  BookingConflictError,
  NotFoundError,
  RentalUnitNotFoundError,
  ValidationError,
} from '../../errors/AppError';
import * as repository from './reservations.repository';
import * as service from './reservations.service';

/**
 * Service branches, with the database mocked out.
 *
 * Mocking is right *here* and wrong for the booking rule itself. What these tests cover
 * is the service's own decision-making — which errors it maps to which `AppError`, when
 * it bothers to run the pre-check at all, and what it does with a `23P01` that the
 * pre-check missed. None of that is a claim about Postgres, so a fake repository is a
 * faithful stand-in.
 *
 * The claim that *is* about Postgres — that overlapping stays cannot both be committed —
 * is asserted only against a real database, in reservations.integration.test.ts and
 * reservations.concurrency.integration.test.ts. A mock could be made to "prove" it and
 * the proof would be worth nothing.
 *
 * The valuable case below is the 23P01 one: a genuine lost race is non-deterministic by
 * nature, so injecting the exclusion violation is the only way to assert the backstop
 * runs every time rather than usually.
 */
vi.mock('./reservations.repository');

const mocked = vi.mocked(repository);

/** The pre-check and the write both take a `Queryable`; nothing in these tests uses it. */
const db = {} as Queryable;

const UNIT_ID = '11111111-1111-4111-8111-111111111111';
const RESERVATION_ID = '22222222-2222-4222-8222-222222222222';

const CONFLICT: ReservationSummary = {
  id: '33333333-3333-4333-8333-333333333333',
  guestName: 'Jane Doe',
  startDate: '2026-03-12',
  endDate: '2026-03-15',
};

const STORED: Reservation = {
  id: RESERVATION_ID,
  rentalUnitId: UNIT_ID,
  guestName: 'John Smith',
  startDate: '2026-03-10',
  endDate: '2026-03-15',
  status: 'confirmed',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** A `pg` error as the driver reports it: an `Error` carrying a SQLSTATE `code`. */
function pgError(code: string, constraint?: string): Error {
  return Object.assign(new Error(`database error ${code}`), { code, constraint });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocked.isBookableRentalUnit.mockResolvedValue(true);
  mocked.findOverlapping.mockResolvedValue([]);
  mocked.insertReservation.mockResolvedValue(STORED);
  mocked.findReservationById.mockResolvedValue(STORED);
  mocked.updateReservation.mockResolvedValue(STORED);
  mocked.cancelReservation.mockResolvedValue({ ...STORED, status: 'cancelled' });
});

const createInput = {
  rentalUnitId: UNIT_ID,
  guestName: 'New Guest',
  startDate: '2026-03-11',
  endDate: '2026-03-13',
};

describe('createReservation', () => {
  it('rejects a reservation for a unit that is not active', async () => {
    mocked.isBookableRentalUnit.mockResolvedValue(false);

    await expect(service.createReservation(createInput, db)).rejects.toBeInstanceOf(
      RentalUnitNotFoundError,
    );
    expect(mocked.insertReservation).not.toHaveBeenCalled();
  });

  it('inserts when nothing overlaps', async () => {
    await expect(service.createReservation(createInput, db)).resolves.toEqual(STORED);
    expect(mocked.insertReservation).toHaveBeenCalledTimes(1);
  });

  it('generates the id in the application, not the database', async () => {
    await service.createReservation(createInput, db);

    expect(mocked.insertReservation.mock.calls[0]?.[1].id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('returns the conflicting reservations in the error when the pre-check finds one', async () => {
    mocked.findOverlapping.mockResolvedValue([CONFLICT]);

    const error = await service.createReservation(createInput, db).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BookingConflictError);
    expect((error as BookingConflictError).details).toEqual([CONFLICT]);
    // The pre-check short-circuits: no point issuing a write the constraint will refuse.
    expect(mocked.insertReservation).not.toHaveBeenCalled();
  });

  /**
   * The race, injected. In production this is a request that committed between our
   * `SELECT` and our `INSERT`; the pre-check found nothing and the constraint refused the
   * write anyway. The important assertion is the last one: a lost race is reported to the
   * client identically to one the pre-check caught, so the caller never has to know a
   * race happened.
   */
  it('converts a 23P01 from a lost race into the same BookingConflictError', async () => {
    mocked.findOverlapping.mockResolvedValueOnce([]).mockResolvedValueOnce([CONFLICT]);
    mocked.insertReservation.mockRejectedValue(
      pgError(SQLSTATE.EXCLUSION_VIOLATION, 'reservation_no_overlap'),
    );

    const error = await service.createReservation(createInput, db).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BookingConflictError);
    expect((error as BookingConflictError).details).toEqual([CONFLICT]);
    expect(mocked.findOverlapping).toHaveBeenCalledTimes(2);
  });

  it('still reports a conflict when the racing reservation is gone by the time we re-query', async () => {
    // The winner was cancelled between the rejection and the re-query, so there is
    // nothing to name. Reporting a 409 with empty `details` beats a 500: the write did
    // fail, and the client's retry will now succeed.
    mocked.insertReservation.mockRejectedValue(pgError(SQLSTATE.EXCLUSION_VIOLATION));

    const error = await service.createReservation(createInput, db).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BookingConflictError);
    expect((error as BookingConflictError).details).toEqual([]);
  });

  it('maps a foreign key violation to RENTAL_UNIT_NOT_FOUND', async () => {
    mocked.insertReservation.mockRejectedValue(pgError(SQLSTATE.FOREIGN_KEY_VIOLATION));

    await expect(service.createReservation(createInput, db)).rejects.toBeInstanceOf(
      RentalUnitNotFoundError,
    );
  });

  it('maps a range check violation to a validation error rather than a 500', async () => {
    mocked.insertReservation.mockRejectedValue(
      pgError(SQLSTATE.CHECK_VIOLATION, 'reservation_valid_range'),
    );

    await expect(service.createReservation(createInput, db)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('rethrows an unrecognised database error untouched', async () => {
    const failure = pgError('08006'); // connection_failure
    mocked.insertReservation.mockRejectedValue(failure);

    await expect(service.createReservation(createInput, db)).rejects.toBe(failure);
  });
});

describe('updateReservation', () => {
  it('404s on a reservation that does not exist', async () => {
    mocked.findReservationById.mockResolvedValue(undefined);

    await expect(
      service.updateReservation(RESERVATION_ID, { guestName: 'Someone' }, db),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('skips the overlap check when the dates are untouched', async () => {
    await service.updateReservation(RESERVATION_ID, { guestName: 'Renamed' }, db);

    // Running it would 409 a guest-name correction on a stay whose dates were already
    // legal — the row would be found overlapping itself.
    expect(mocked.findOverlapping).not.toHaveBeenCalled();
    expect(mocked.updateReservation).toHaveBeenCalledTimes(1);
  });

  it('excludes the reservation from its own pre-check when dates change', async () => {
    await service.updateReservation(RESERVATION_ID, { endDate: '2026-03-16' }, db);

    expect(mocked.findOverlapping).toHaveBeenCalledWith(db, {
      rentalUnitId: UNIT_ID,
      startDate: '2026-03-10',
      endDate: '2026-03-16',
      excludeId: RESERVATION_ID,
    });
  });

  it('checks for conflicts when a cancelled reservation is confirmed again', async () => {
    // Its slot stopped being reserved the moment it was cancelled, so somebody else may
    // be in it now. Unchanged dates are not evidence that the slot is still free.
    mocked.findReservationById.mockResolvedValue({ ...STORED, status: 'cancelled' });

    await service.updateReservation(RESERVATION_ID, { status: 'confirmed' }, db);

    expect(mocked.findOverlapping).toHaveBeenCalledTimes(1);
  });

  it('does not check for conflicts when a cancelled reservation is merely moved', async () => {
    mocked.findReservationById.mockResolvedValue({ ...STORED, status: 'cancelled' });

    await service.updateReservation(RESERVATION_ID, { startDate: '2026-03-11' }, db);

    // The constraint does not index cancelled rows, so there is nothing it could collide
    // with and nothing to warn about.
    expect(mocked.findOverlapping).not.toHaveBeenCalled();
  });

  it('validates a one-sided date patch against the stored value', async () => {
    // `updateReservationSchema` compares only the dates it was given; `endDate` alone has
    // to be checked against the stored `startDate`, and that check has nowhere to live
    // but the service.
    await expect(
      service.updateReservation(RESERVATION_ID, { endDate: '2026-03-09' }, db),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(mocked.updateReservation).not.toHaveBeenCalled();
  });

  it('rejects a patch that would make the stay zero nights', async () => {
    await expect(
      service.updateReservation(RESERVATION_ID, { endDate: STORED.startDate }, db),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('converts a 23P01 on update into a BookingConflictError', async () => {
    mocked.updateReservation.mockRejectedValue(
      pgError(SQLSTATE.EXCLUSION_VIOLATION, 'reservation_no_overlap'),
    );
    mocked.findOverlapping.mockResolvedValueOnce([]).mockResolvedValueOnce([CONFLICT]);

    const error = await service
      .updateReservation(RESERVATION_ID, { startDate: '2026-03-12', endDate: '2026-03-14' }, db)
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(BookingConflictError);
    expect((error as BookingConflictError).details).toEqual([CONFLICT]);
  });
});

describe('cancelReservation', () => {
  it('404s when there was nothing to cancel', async () => {
    mocked.cancelReservation.mockResolvedValue(undefined);

    await expect(service.cancelReservation(RESERVATION_ID, db)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('resolves for an already-cancelled reservation, so DELETE is idempotent', async () => {
    mocked.cancelReservation.mockResolvedValue({ ...STORED, status: 'cancelled' });

    await expect(service.cancelReservation(RESERVATION_ID, db)).resolves.toBeUndefined();
  });
});

describe('listReservations', () => {
  it('reports pagination metadata for the requested page', async () => {
    mocked.listReservations.mockResolvedValue({ data: [STORED], total: 57 });

    await expect(
      service.listReservations(
        { page: 2, limit: 20, status: 'confirmed', rentalUnitId: undefined, from: undefined, to: undefined },
        db,
      ),
    ).resolves.toEqual({
      data: [STORED],
      pagination: { page: 2, limit: 20, total: 57, totalPages: 3 },
    });
  });

  it('reports zero pages for an empty collection', async () => {
    mocked.listReservations.mockResolvedValue({ data: [], total: 0 });

    const result = await service.listReservations(
      { page: 1, limit: 20, status: 'confirmed', rentalUnitId: undefined, from: undefined, to: undefined },
      db,
    );

    expect(result.pagination.totalPages).toBe(0);
  });
});
