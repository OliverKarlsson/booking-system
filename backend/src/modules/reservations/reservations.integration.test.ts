import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app';
import { pool } from '../../db/pool';
import { insertRentalUnit, insertReservationRaw } from '../../test/db';

/**
 * The reservations API end to end: real Express, real middleware, real Postgres.
 *
 * Nothing is mocked, because the two things most worth asserting here — that overlapping
 * stays are refused and that same-day turnover is not an overlap — are properties of the
 * exclusion constraint, and a test against a fake database would assert them about the
 * fake. The fixtures write with raw SQL (test/db.ts) so a reservations test is not also
 * silently a test of the rental-units service, which another agent is writing in parallel.
 */

let app: Express;

beforeAll(() => {
  app = createApp();
});

const NONEXISTENT_ID = '00000000-0000-4000-8000-000000000000';

const booking = (rentalUnitId: string, startDate: string, endDate: string, guestName = 'Guest') => ({
  rentalUnitId,
  guestName,
  startDate,
  endDate,
});

describe('POST /v1/reservations', () => {
  it('creates a reservation', async () => {
    const unitId = await insertRentalUnit();

    const response = await request(app)
      .post('/v1/reservations')
      .send(booking(unitId, '2026-03-10', '2026-03-15', 'Jane Doe'));

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      rentalUnitId: unitId,
      guestName: 'Jane Doe',
      // Verbatim strings, not ISO instants: a `date` column has no offset for anything to
      // shift by, and the driver is configured not to reintroduce one (§3.1).
      startDate: '2026-03-10',
      endDate: '2026-03-15',
      status: 'confirmed',
    });
    expect(response.body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(typeof response.body.createdAt).toBe('string');
  });

  it('trims the guest name via the shared schema', async () => {
    const unitId = await insertRentalUnit();

    const response = await request(app)
      .post('/v1/reservations')
      .send(booking(unitId, '2026-03-10', '2026-03-15', '  Jane Doe  '));

    expect(response.status).toBe(201);
    expect(response.body.guestName).toBe('Jane Doe');
  });

  it.each([
    ['end before start', { startDate: '2026-03-15', endDate: '2026-03-10' }],
    ['zero-night stay', { startDate: '2026-03-10', endDate: '2026-03-10' }],
    ['impossible calendar date', { startDate: '2026-02-31', endDate: '2026-03-10' }],
    ['a timestamp instead of a date', { startDate: '2026-03-10T00:00:00Z', endDate: '2026-03-15' }],
    ['an unpadded date', { startDate: '2026-3-10', endDate: '2026-03-15' }],
  ])('400s on %s', async (_label, dates) => {
    const unitId = await insertRentalUnit();

    const response = await request(app)
      .post('/v1/reservations')
      .send({ rentalUnitId: unitId, guestName: 'Guest', ...dates });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.details.length).toBeGreaterThan(0);
  });

  it('400s on a missing guest name', async () => {
    const unitId = await insertRentalUnit();

    const response = await request(app)
      .post('/v1/reservations')
      .send({ rentalUnitId: unitId, startDate: '2026-03-10', endDate: '2026-03-15' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('404s RENTAL_UNIT_NOT_FOUND for a unit that does not exist', async () => {
    const response = await request(app)
      .post('/v1/reservations')
      .send(booking(NONEXISTENT_ID, '2026-03-10', '2026-03-15'));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('RENTAL_UNIT_NOT_FOUND');
  });

  it('404s RENTAL_UNIT_NOT_FOUND for a soft-deleted unit', async () => {
    // The foreign key cannot express this: a soft-deleted unit is still a valid FK target,
    // so "active" is a rule the service has to enforce.
    const unitId = await insertRentalUnit({ status: 'deleted' });

    const response = await request(app)
      .post('/v1/reservations')
      .send(booking(unitId, '2026-03-10', '2026-03-15'));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('RENTAL_UNIT_NOT_FOUND');
  });
});

describe('POST /v1/reservations — conflicts', () => {
  /**
   * The 409 payload contract (§3.4). This is what lets the reservation form say
   * "Conflicts with Jane Doe (12–15 March)" instead of "something went wrong", and it is
   * the entire reason the write path runs a racy pre-check at all.
   */
  it('409s with the conflicting reservation in details', async () => {
    const unitId = await insertRentalUnit();
    const { id: existingId } = await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Jane Doe',
      startDate: '2026-03-12',
      endDate: '2026-03-15',
    });

    const response = await request(app)
      .post('/v1/reservations')
      .send(booking(unitId, '2026-03-10', '2026-03-13', 'John Smith'));

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'BOOKING_CONFLICT',
      details: [
        {
          id: existingId,
          guestName: 'Jane Doe',
          startDate: '2026-03-12',
          endDate: '2026-03-15',
        },
      ],
    });
    expect(typeof response.body.error).toBe('string');
    // Only the four summary fields — no `rentalUnitId`, no timestamps, no internals.
    expect(Object.keys(response.body.details[0]).sort()).toEqual([
      'endDate',
      'guestName',
      'id',
      'startDate',
    ]);
  });

  it('names every reservation the request collides with', async () => {
    const unitId = await insertRentalUnit();
    await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'First',
      startDate: '2026-03-10',
      endDate: '2026-03-15',
    });
    await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Second',
      startDate: '2026-03-15',
      endDate: '2026-03-20',
    });

    const response = await request(app)
      .post('/v1/reservations')
      .send(booking(unitId, '2026-03-01', '2026-03-31', 'Long Stay'));

    expect(response.status).toBe(409);
    expect(response.body.details.map((d: { guestName: string }) => d.guestName)).toEqual([
      'First',
      'Second',
    ]);
  });

  it.each([
    ['identical range', '2026-03-10', '2026-03-15'],
    ['fully contained', '2026-03-11', '2026-03-14'],
    ['fully containing', '2026-03-01', '2026-03-31'],
    ['overlapping the start', '2026-03-08', '2026-03-11'],
    ['overlapping the end', '2026-03-14', '2026-03-20'],
    ['single night inside', '2026-03-12', '2026-03-13'],
  ])('409s on an overlap: %s', async (_label, startDate, endDate) => {
    const unitId = await insertRentalUnit();
    await insertReservationRaw({ rentalUnitId: unitId, startDate: '2026-03-10', endDate: '2026-03-15' });

    const response = await request(app)
      .post('/v1/reservations')
      .send(booking(unitId, startDate, endDate));

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('BOOKING_CONFLICT');
  });

  /**
   * The most commonly broken case, and the one that costs money when it breaks: refusing
   * a legitimate changeover looks like conservative behaviour and is simply lost bookings.
   */
  it('accepts same-day turnover in both directions', async () => {
    const unitId = await insertRentalUnit();
    await insertReservationRaw({ rentalUnitId: unitId, startDate: '2026-03-10', endDate: '2026-03-15' });

    const checkInOnCheckoutDay = await request(app)
      .post('/v1/reservations')
      .send(booking(unitId, '2026-03-15', '2026-03-20', 'Arriving'));
    expect(checkInOnCheckoutDay.status).toBe(201);

    const checkOutOnCheckInDay = await request(app)
      .post('/v1/reservations')
      .send(booking(unitId, '2026-03-05', '2026-03-10', 'Departing'));
    expect(checkOutOnCheckInDay.status).toBe(201);
  });

  it('does not conflict across rental units', async () => {
    const unitA = await insertRentalUnit({ name: 'A' });
    const unitB = await insertRentalUnit({ name: 'B' });
    await insertReservationRaw({ rentalUnitId: unitA, startDate: '2026-03-10', endDate: '2026-03-15' });

    const response = await request(app)
      .post('/v1/reservations')
      .send(booking(unitB, '2026-03-10', '2026-03-15'));

    expect(response.status).toBe(201);
  });

  it('is not blocked by a cancelled reservation', async () => {
    const unitId = await insertRentalUnit();
    await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
      status: 'cancelled',
    });

    const response = await request(app)
      .post('/v1/reservations')
      .send(booking(unitId, '2026-03-10', '2026-03-15'));

    expect(response.status).toBe(201);
  });
});

describe('GET /v1/reservations/:id', () => {
  it('returns the reservation', async () => {
    const unitId = await insertRentalUnit();
    const { id } = await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Jane Doe',
      startDate: '2026-03-10',
      endDate: '2026-03-15',
    });

    const response = await request(app).get(`/v1/reservations/${id}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id, guestName: 'Jane Doe', startDate: '2026-03-10' });
  });

  it('returns a cancelled reservation rather than hiding it', async () => {
    // Cancellation is a status, not a delete: the row is still a resource with a history
    // worth reading. Only the list defaults to confirmed.
    const unitId = await insertRentalUnit();
    const { id } = await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
      status: 'cancelled',
    });

    const response = await request(app).get(`/v1/reservations/${id}`);

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('cancelled');
  });

  it('404s for an unknown id', async () => {
    const response = await request(app).get(`/v1/reservations/${NONEXISTENT_ID}`);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('400s for a malformed id', async () => {
    const response = await request(app).get('/v1/reservations/not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /v1/reservations — filters', () => {
  async function seedWindowFixtures(): Promise<string> {
    const unitId = await insertRentalUnit();
    await insertReservationRaw({ rentalUnitId: unitId, guestName: 'Before', startDate: '2026-03-01', endDate: '2026-03-05' });
    await insertReservationRaw({ rentalUnitId: unitId, guestName: 'Straddles start', startDate: '2026-03-08', endDate: '2026-03-12' });
    await insertReservationRaw({ rentalUnitId: unitId, guestName: 'Inside', startDate: '2026-03-12', endDate: '2026-03-14' });
    await insertReservationRaw({ rentalUnitId: unitId, guestName: 'Straddles end', startDate: '2026-03-14', endDate: '2026-03-18' });
    await insertReservationRaw({ rentalUnitId: unitId, guestName: 'After', startDate: '2026-03-20', endDate: '2026-03-25' });
    return unitId;
  }

  const names = (body: { data: Array<{ guestName: string }> }): string[] =>
    body.data.map((reservation) => reservation.guestName);

  it('returns everything, sorted by start date, with no filters', async () => {
    await seedWindowFixtures();

    const response = await request(app).get('/v1/reservations');

    expect(response.status).toBe(200);
    expect(names(response.body)).toEqual([
      'Before',
      'Straddles start',
      'Inside',
      'Straddles end',
      'After',
    ]);
    expect(response.body.pagination).toEqual({ page: 1, limit: 20, total: 5, totalPages: 1 });
  });

  /**
   * `from`/`to` select stays that **overlap** the window, not stays contained by it
   * (§3.6). A guest whose stay straddles the edge of the month a manager is looking at is
   * precisely the one they need to see — a containment filter hides exactly the bookings
   * that matter and looks correct while doing it.
   */
  it('filters by overlap with the window, not containment', async () => {
    await seedWindowFixtures();

    const response = await request(app)
      .get('/v1/reservations')
      .query({ from: '2026-03-10', to: '2026-03-15' });

    expect(response.status).toBe(200);
    expect(names(response.body)).toEqual(['Straddles start', 'Inside', 'Straddles end']);
  });

  it('applies the half-open rule at the window edges', async () => {
    const unitId = await insertRentalUnit();
    await insertReservationRaw({ rentalUnitId: unitId, guestName: 'Ends on from', startDate: '2026-03-05', endDate: '2026-03-10' });
    await insertReservationRaw({ rentalUnitId: unitId, guestName: 'Starts on to', startDate: '2026-03-15', endDate: '2026-03-20' });
    await insertReservationRaw({ rentalUnitId: unitId, guestName: 'Last night before to', startDate: '2026-03-14', endDate: '2026-03-15' });

    const response = await request(app)
      .get('/v1/reservations')
      .query({ from: '2026-03-10', to: '2026-03-15' });

    // A stay checking out on `from` and one checking in on `to` are both outside a
    // half-open window — the same rule that makes same-day turnover legal.
    expect(names(response.body)).toEqual(['Last night before to']);
  });

  it('treats a lone `from` as an open-ended window', async () => {
    await seedWindowFixtures();

    const response = await request(app).get('/v1/reservations').query({ from: '2026-03-14' });

    expect(names(response.body)).toEqual(['Straddles end', 'After']);
  });

  it('treats a lone `to` as an open-ended window', async () => {
    await seedWindowFixtures();

    const response = await request(app).get('/v1/reservations').query({ to: '2026-03-12' });

    expect(names(response.body)).toEqual(['Before', 'Straddles start']);
  });

  it('400s when `to` is not after `from`', async () => {
    const response = await request(app)
      .get('/v1/reservations')
      .query({ from: '2026-03-15', to: '2026-03-10' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('filters by rental unit', async () => {
    const unitA = await insertRentalUnit({ name: 'A' });
    const unitB = await insertRentalUnit({ name: 'B' });
    await insertReservationRaw({ rentalUnitId: unitA, guestName: 'In A', startDate: '2026-03-10', endDate: '2026-03-15' });
    await insertReservationRaw({ rentalUnitId: unitB, guestName: 'In B', startDate: '2026-03-10', endDate: '2026-03-15' });

    const response = await request(app).get('/v1/reservations').query({ rentalUnitId: unitA });

    expect(names(response.body)).toEqual(['In A']);
    expect(response.body.pagination.total).toBe(1);
  });

  it('defaults to confirmed reservations only', async () => {
    const unitId = await insertRentalUnit();
    await insertReservationRaw({ rentalUnitId: unitId, guestName: 'Confirmed', startDate: '2026-03-10', endDate: '2026-03-15' });
    await insertReservationRaw({ rentalUnitId: unitId, guestName: 'Cancelled', startDate: '2026-03-10', endDate: '2026-03-15', status: 'cancelled' });

    const response = await request(app).get('/v1/reservations');

    expect(names(response.body)).toEqual(['Confirmed']);
  });

  it('returns cancelled reservations when asked for them', async () => {
    const unitId = await insertRentalUnit();
    await insertReservationRaw({ rentalUnitId: unitId, guestName: 'Confirmed', startDate: '2026-03-10', endDate: '2026-03-15' });
    await insertReservationRaw({ rentalUnitId: unitId, guestName: 'Cancelled', startDate: '2026-03-10', endDate: '2026-03-15', status: 'cancelled' });

    const response = await request(app).get('/v1/reservations').query({ status: 'cancelled' });

    expect(names(response.body)).toEqual(['Cancelled']);
  });

  it('paginates', async () => {
    const unitId = await insertRentalUnit();
    for (let day = 1; day <= 5; day += 1) {
      await insertReservationRaw({
        rentalUnitId: unitId,
        guestName: `Guest ${day}`,
        startDate: `2026-03-0${day}`,
        endDate: `2026-03-0${day + 1}`,
      });
    }

    const page1 = await request(app).get('/v1/reservations').query({ page: 1, limit: 2 });
    const page3 = await request(app).get('/v1/reservations').query({ page: 3, limit: 2 });

    expect(names(page1.body)).toEqual(['Guest 1', 'Guest 2']);
    expect(page1.body.pagination).toEqual({ page: 1, limit: 2, total: 5, totalPages: 3 });
    expect(names(page3.body)).toEqual(['Guest 5']);
  });

  it('reports honest metadata for a page past the end', async () => {
    const unitId = await insertRentalUnit();
    await insertReservationRaw({ rentalUnitId: unitId, startDate: '2026-03-10', endDate: '2026-03-15' });

    const response = await request(app).get('/v1/reservations').query({ page: 9, limit: 20 });

    // Empty data with a true `total` — not a 404, and not `total: 0`, which is what a
    // `count(*) OVER ()` window would have reported here.
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual([]);
    expect(response.body.pagination.total).toBe(1);
  });

  it('400s on a limit above the documented maximum', async () => {
    const response = await request(app).get('/v1/reservations').query({ limit: 500 });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /v1/reservations/:id', () => {
  it('updates the guest name', async () => {
    const unitId = await insertRentalUnit();
    const { id } = await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Typo',
      startDate: '2026-03-10',
      endDate: '2026-03-15',
    });

    const response = await request(app).patch(`/v1/reservations/${id}`).send({ guestName: 'Jane Doe' });

    expect(response.status).toBe(200);
    expect(response.body.guestName).toBe('Jane Doe');
    expect(response.body.startDate).toBe('2026-03-10');
  });

  /**
   * The self-conflict case. A stay shifted by one day still overlaps its own stored dates,
   * so a pre-check that did not exclude the row being edited would 409 a perfectly legal
   * edit. The constraint needs no such exclusion — an UPDATE replaces the row's own index
   * entry — which is why the exclusion lives only in the query that builds the payload.
   */
  it('does not conflict with itself when the dates are shifted', async () => {
    const unitId = await insertRentalUnit();
    const { id } = await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
    });

    const response = await request(app)
      .patch(`/v1/reservations/${id}`)
      .send({ startDate: '2026-03-11', endDate: '2026-03-16' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ startDate: '2026-03-11', endDate: '2026-03-16' });
  });

  it('does not conflict with itself when the dates are resent unchanged', async () => {
    const unitId = await insertRentalUnit();
    const { id } = await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
    });

    const response = await request(app)
      .patch(`/v1/reservations/${id}`)
      .send({ startDate: '2026-03-10', endDate: '2026-03-15' });

    expect(response.status).toBe(200);
  });

  it('409s when moved onto another reservation', async () => {
    const unitId = await insertRentalUnit();
    const { id } = await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-01',
      endDate: '2026-03-05',
    });
    await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Jane Doe',
      startDate: '2026-03-10',
      endDate: '2026-03-15',
    });

    const response = await request(app)
      .patch(`/v1/reservations/${id}`)
      .send({ startDate: '2026-03-12', endDate: '2026-03-14' });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('BOOKING_CONFLICT');
    expect(response.body.details[0]).toMatchObject({ guestName: 'Jane Doe' });
  });

  it('allows a move into an adjacent slot (same-day turnover)', async () => {
    const unitId = await insertRentalUnit();
    const { id } = await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-01',
      endDate: '2026-03-05',
    });
    await insertReservationRaw({ rentalUnitId: unitId, startDate: '2026-03-10', endDate: '2026-03-15' });

    const response = await request(app)
      .patch(`/v1/reservations/${id}`)
      .send({ startDate: '2026-03-15', endDate: '2026-03-18' });

    expect(response.status).toBe(200);
  });

  it('validates a one-sided date patch against the stored date', async () => {
    const unitId = await insertRentalUnit();
    const { id } = await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
    });

    const response = await request(app).patch(`/v1/reservations/${id}`).send({ endDate: '2026-03-09' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('400s on an empty body', async () => {
    const unitId = await insertRentalUnit();
    const { id } = await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
    });

    const response = await request(app).patch(`/v1/reservations/${id}`).send({});

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });

  it('ignores rentalUnitId — moving a booking between properties is a cancel-and-rebook', async () => {
    const unitA = await insertRentalUnit({ name: 'A' });
    const unitB = await insertRentalUnit({ name: 'B' });
    const { id } = await insertReservationRaw({
      rentalUnitId: unitA,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
    });

    const response = await request(app)
      .patch(`/v1/reservations/${id}`)
      .send({ rentalUnitId: unitB, guestName: 'Jane Doe' });

    // `updateReservationSchema` has no `rentalUnitId`, so Zod strips it rather than
    // relocating the reservation's conflict domain behind the caller's back.
    expect(response.status).toBe(200);
    expect(response.body.rentalUnitId).toBe(unitA);
  });

  it('409s when un-cancelling into a slot that has since been taken', async () => {
    const unitId = await insertRentalUnit();
    const { id } = await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
      status: 'cancelled',
    });
    await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Took the slot',
      startDate: '2026-03-12',
      endDate: '2026-03-18',
    });

    const response = await request(app).patch(`/v1/reservations/${id}`).send({ status: 'confirmed' });

    expect(response.status).toBe(409);
    expect(response.body.details[0]).toMatchObject({ guestName: 'Took the slot' });
  });

  it('allows un-cancelling when the slot is still free', async () => {
    const unitId = await insertRentalUnit();
    const { id } = await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
      status: 'cancelled',
    });

    const response = await request(app).patch(`/v1/reservations/${id}`).send({ status: 'confirmed' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('confirmed');
  });

  it('404s for an unknown reservation', async () => {
    const response = await request(app)
      .patch(`/v1/reservations/${NONEXISTENT_ID}`)
      .send({ guestName: 'Jane Doe' });

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });
});

describe('DELETE /v1/reservations/:id', () => {
  it('cancels rather than removes', async () => {
    const unitId = await insertRentalUnit();
    const { id } = await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
    });

    const response = await request(app).delete(`/v1/reservations/${id}`);
    expect(response.status).toBe(204);

    const { rows } = await pool.query<{ status: string }>(
      'SELECT status FROM reservations WHERE id = $1',
      [id],
    );
    // The row survives, so a manager can still see what used to be booked.
    expect(rows[0]?.status).toBe('cancelled');
  });

  it('frees the slot for a new booking', async () => {
    const unitId = await insertRentalUnit();
    const { id } = await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
    });

    await request(app).delete(`/v1/reservations/${id}`);
    const response = await request(app)
      .post('/v1/reservations')
      .send(booking(unitId, '2026-03-10', '2026-03-15', 'Replacement'));

    expect(response.status).toBe(201);
  });

  it('is idempotent', async () => {
    const unitId = await insertRentalUnit();
    const { id } = await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
    });

    await request(app).delete(`/v1/reservations/${id}`);
    const second = await request(app).delete(`/v1/reservations/${id}`);

    expect(second.status).toBe(204);
  });

  it('404s for an unknown reservation', async () => {
    const response = await request(app).delete(`/v1/reservations/${NONEXISTENT_ID}`);

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });
});

describe('reservations: full lifecycle', () => {
  it('creates, reads, updates, lists and cancels', async () => {
    const unitId = await insertRentalUnit();

    const created = await request(app)
      .post('/v1/reservations')
      .send(booking(unitId, '2026-03-10', '2026-03-15', 'Jane Doe'));
    expect(created.status).toBe(201);
    const { id } = created.body;

    const read = await request(app).get(`/v1/reservations/${id}`);
    expect(read.body).toEqual(created.body);

    const updated = await request(app)
      .patch(`/v1/reservations/${id}`)
      .send({ guestName: 'Jane Smith', endDate: '2026-03-17' });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ guestName: 'Jane Smith', endDate: '2026-03-17' });

    const listed = await request(app).get('/v1/reservations').query({ rentalUnitId: unitId });
    expect(listed.body.data).toHaveLength(1);

    expect((await request(app).delete(`/v1/reservations/${id}`)).status).toBe(204);
    expect((await request(app).get('/v1/reservations').query({ rentalUnitId: unitId })).body.data)
      .toHaveLength(0);
  });
});
