import { randomUUID } from 'node:crypto';

import { pool } from '../db/pool';

/**
 * Reset between tests.
 *
 * `TRUNCATE … RESTART IDENTITY CASCADE` rather than dropping and recreating the schema:
 * it is a single fast statement, and — more importantly — it leaves the exclusion
 * constraint, the foreign key and the partial index exactly as the migration created
 * them. A drop/recreate cycle re-runs the DDL once per test and, if the migration were
 * ever wrong, would happily test a schema the application never actually produces.
 *
 * `CASCADE` is what lets `rental_units` be truncated while `reservations` references it;
 * both are named explicitly anyway so the order does not matter.
 */
export async function truncateAll(): Promise<void> {
  await pool.query('TRUNCATE TABLE reservations, rental_units RESTART IDENTITY CASCADE');
}

export interface RentalUnitFixture {
  id?: string;
  name?: string;
  timezone?: string;
  status?: 'active' | 'deleted';
}

/**
 * Inserts a rental unit in raw SQL. Parameterised, like every query in this codebase.
 *
 * Fixtures write directly to the tables rather than going through the service layer, so
 * a test of the reservations service is not silently also a test of the rental-units
 * service.
 */
export async function insertRentalUnit(fixture: RentalUnitFixture = {}): Promise<string> {
  const id = fixture.id ?? randomUUID();

  await pool.query(
    `INSERT INTO rental_units (id, name, timezone, status)
     VALUES ($1, $2, $3, $4)`,
    [
      id,
      fixture.name ?? 'Test Unit',
      fixture.timezone ?? 'Europe/Stockholm',
      fixture.status ?? 'active',
    ],
  );

  return id;
}

export interface ReservationFixture {
  id?: string;
  rentalUnitId: string;
  guestName?: string;
  startDate: string;
  endDate: string;
  status?: 'confirmed' | 'cancelled';
}

/**
 * Inserts a reservation in raw SQL, bypassing the service layer entirely.
 *
 * That bypass is the point, not a shortcut: a test that reaches the exclusion constraint
 * without passing through any application code is what demonstrates the booking rule
 * belongs to the database. Rejections surface as a `pg` error with SQLSTATE 23P01.
 */
export async function insertReservationRaw(
  fixture: ReservationFixture,
): Promise<{ id: string }> {
  const id = fixture.id ?? randomUUID();

  await pool.query(
    `INSERT INTO reservations (id, rental_unit_id, guest_name, start_date, end_date, status)
     VALUES ($1, $2, $3, $4::date, $5::date, $6)`,
    [
      id,
      fixture.rentalUnitId,
      fixture.guestName ?? 'Test Guest',
      fixture.startDate,
      fixture.endDate,
      fixture.status ?? 'confirmed',
    ],
  );

  return { id };
}
