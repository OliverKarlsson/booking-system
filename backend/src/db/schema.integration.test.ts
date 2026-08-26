import { describe, expect, it } from 'vitest';

import { pool } from './pool';
import { SQLSTATE } from './errors';
import { insertRentalUnit, insertReservationRaw } from '../test/db';

/**
 * The foundation smoke test.
 *
 * Everything here goes straight to SQL — no service, no route, no application code of any
 * kind. That is the entire point: if these pass, the booking rule is a property of the
 * data and a future feature written by someone who has never read the design notes still
 * cannot insert a double booking. If the rule lived in a service instead, an alternative
 * write path would route around it and every one of these tests would still be green.
 */
describe('schema: reservation_no_overlap exclusion constraint', () => {
  it('rejects a second confirmed reservation that overlaps the first', async () => {
    const unitId = await insertRentalUnit();

    await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Jane Doe',
      startDate: '2026-03-10',
      endDate: '2026-03-15',
    });

    await expect(
      insertReservationRaw({
        rentalUnitId: unitId,
        guestName: 'John Smith',
        startDate: '2026-03-12',
        endDate: '2026-03-18',
      }),
    ).rejects.toMatchObject({
      code: SQLSTATE.EXCLUSION_VIOLATION,
      constraint: 'reservation_no_overlap',
    });

    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM reservations WHERE rental_unit_id = $1`,
      [unitId],
    );
    expect(rows[0]?.count).toBe('1');
  });

  it.each([
    ['identical range', '2026-03-10', '2026-03-15'],
    ['fully contained', '2026-03-11', '2026-03-14'],
    ['fully containing', '2026-03-01', '2026-03-31'],
    ['overlapping the start', '2026-03-08', '2026-03-11'],
    ['overlapping the end', '2026-03-14', '2026-03-20'],
    ['single night inside', '2026-03-12', '2026-03-13'],
  ])('rejects an overlap: %s', async (_label, startDate, endDate) => {
    const unitId = await insertRentalUnit();
    await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
    });

    await expect(
      insertReservationRaw({ rentalUnitId: unitId, startDate, endDate }),
    ).rejects.toMatchObject({ code: SQLSTATE.EXCLUSION_VIOLATION });
  });

  /**
   * The half-open interval `[start, end)` in one test. This is the case most
   * implementations get wrong, and getting it wrong means refusing real bookings.
   */
  it('accepts same-day turnover in both directions', async () => {
    const unitId = await insertRentalUnit();

    await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
    });
    // Checks in on the morning the previous guest checks out.
    await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-15',
      endDate: '2026-03-20',
    });
    // And checks out on the morning the first guest checks in.
    await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-05',
      endDate: '2026-03-10',
    });

    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM reservations WHERE rental_unit_id = $1`,
      [unitId],
    );
    expect(rows[0]?.count).toBe('3');
  });

  it('scopes the constraint per unit, not globally', async () => {
    const unitA = await insertRentalUnit({ name: 'Unit A' });
    const unitB = await insertRentalUnit({ name: 'Unit B' });

    await insertReservationRaw({
      rentalUnitId: unitA,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
    });
    await expect(
      insertReservationRaw({
        rentalUnitId: unitB,
        startDate: '2026-03-10',
        endDate: '2026-03-15',
      }),
    ).resolves.toBeDefined();
  });

  it('exempts cancelled reservations, in both roles', async () => {
    const unitId = await insertRentalUnit();

    // A cancelled reservation does not block a new one...
    await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
      status: 'cancelled',
    });
    await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
      status: 'confirmed',
    });

    // ...and a new cancelled one is not blocked by a confirmed one.
    await expect(
      insertReservationRaw({
        rentalUnitId: unitId,
        startDate: '2026-03-11',
        endDate: '2026-03-14',
        status: 'cancelled',
      }),
    ).resolves.toBeDefined();
  });

  it('re-arms the constraint when a cancelled reservation is confirmed again', async () => {
    const unitId = await insertRentalUnit();

    const { id: cancelledId } = await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
      status: 'cancelled',
    });
    await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-12',
      endDate: '2026-03-18',
      status: 'confirmed',
    });

    // Flipping the cancelled row back to confirmed now collides — the partial index
    // covers UPDATEs, not just INSERTs.
    await expect(
      pool.query(`UPDATE reservations SET status = 'confirmed' WHERE id = $1`, [cancelledId]),
    ).rejects.toMatchObject({ code: SQLSTATE.EXCLUSION_VIOLATION });
  });
});

describe('schema: reservation_valid_range check constraint', () => {
  it.each([
    ['end before start', '2026-03-15', '2026-03-10'],
    ['zero-night stay', '2026-03-10', '2026-03-10'],
  ])('rejects %s', async (_label, startDate, endDate) => {
    const unitId = await insertRentalUnit();

    await expect(
      insertReservationRaw({ rentalUnitId: unitId, startDate, endDate }),
    ).rejects.toMatchObject({
      code: SQLSTATE.CHECK_VIOLATION,
      constraint: 'reservation_valid_range',
    });
  });
});

describe('schema: referential integrity', () => {
  it('rejects a reservation for a nonexistent rental unit', async () => {
    await expect(
      insertReservationRaw({
        rentalUnitId: '00000000-0000-4000-8000-000000000000',
        startDate: '2026-03-10',
        endDate: '2026-03-15',
      }),
    ).rejects.toMatchObject({ code: SQLSTATE.FOREIGN_KEY_VIOLATION });
  });
});

/**
 * Guards the `setTypeParser(1082, …)` line in db/pool.ts. Without it node-postgres hands
 * back a JS `Date` and every date in the API shifts by the process offset — a failure
 * that is invisible on a machine running UTC and wrong everywhere else.
 */
describe('driver: date columns come back as strings', () => {
  it('returns YYYY-MM-DD, not a Date object', async () => {
    const unitId = await insertRentalUnit();
    await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
    });

    const { rows } = await pool.query<{ start_date: unknown; end_date: unknown }>(
      `SELECT start_date, end_date FROM reservations WHERE rental_unit_id = $1`,
      [unitId],
    );

    expect(rows[0]?.start_date).toBe('2026-03-10');
    expect(rows[0]?.end_date).toBe('2026-03-15');
    expect(rows[0]?.start_date).not.toBeInstanceOf(Date);
  });

  it('still returns timestamptz columns as Date objects', async () => {
    // createdAt/updatedAt genuinely are instants, so the default coercion is correct
    // there. Only OID 1082 is overridden.
    const unitId = await insertRentalUnit();
    const { rows } = await pool.query<{ created_at: unknown }>(
      `SELECT created_at FROM rental_units WHERE id = $1`,
      [unitId],
    );

    expect(rows[0]?.created_at).toBeInstanceOf(Date);
  });
});
