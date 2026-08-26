import { randomUUID } from 'node:crypto';

import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app';
import { SQLSTATE } from '../../db/errors';
import { pool } from '../../db/pool';
import { insertRentalUnit } from '../../test/db';

/**
 * The test the whole design exists for.
 *
 * "Overlapping reservations are impossible" and "here is the test that fires twenty
 * racing clients at one slot and gets exactly one booking" are very different statements,
 * and only the second one survives scrutiny. The reason it is worth writing is that the
 * *naive* implementation — check for conflicts, then insert — passes every single-threaded
 * test in this repository. It fails only here, and only under load, which is precisely
 * where nobody is watching.
 *
 * What is being asserted is a property of `reservation_no_overlap` in db/schema.sql, not
 * of any code in this module. The service's pre-check `SELECT` races by design and
 * contributes nothing to the outcome below: with twenty requests in flight, most of them
 * run their pre-check before anybody has committed, find nothing, and proceed to an
 * INSERT that the exclusion constraint then refuses. Nineteen 409s here are nineteen
 * SQLSTATE 23P01 rejections translated into the §3.4 envelope.
 *
 * (`PG_POOL_MAX` caps how many of the twenty are truly simultaneous at the database. That
 * does not weaken the assertion — it only changes how much contention is needed to
 * produce it, and the result must be one 201 at any level of overlap.)
 *
 * Filed as `.integration.` rather than the plan's `reservations.concurrency.test.ts` so it
 * matches the `src/**​/*.integration.test.ts` glob from T1.2's vitest workspace: the unit
 * project has no database and no truncation hooks, and this test needs both.
 */

let app: Express;

beforeAll(() => {
  app = createApp();
});

const CONTENDERS = 20;

const SLOT = { startDate: '2026-03-10', endDate: '2026-03-15' } as const;

async function countConfirmed(rentalUnitId?: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    rentalUnitId
      ? `SELECT count(*)::text AS count FROM reservations WHERE status = 'confirmed' AND rental_unit_id = $1`
      : `SELECT count(*)::text AS count FROM reservations WHERE status = 'confirmed'`,
    rentalUnitId ? [rentalUnitId] : [],
  );

  return Number(rows[0]!.count);
}

describe('concurrency: simultaneous bookings for the identical slot', () => {
  it('accepts exactly one of 20 simultaneous requests and 409s the rest', async () => {
    const unitId = await insertRentalUnit();

    // No `await` inside the loop: every request is dispatched before any of them is
    // awaited, so they contend for real rather than queueing behind each other.
    const responses = await Promise.all(
      Array.from({ length: CONTENDERS }, (_unused, index) =>
        request(app)
          .post('/v1/reservations')
          .send({ rentalUnitId: unitId, guestName: `Guest ${index}`, ...SLOT }),
      ),
    );

    const created = responses.filter((response) => response.status === 201);
    const conflicted = responses.filter((response) => response.status === 409);

    expect(created).toHaveLength(1);
    expect(conflicted).toHaveLength(CONTENDERS - 1);

    // No third outcome. A 500 here would mean a 23P01 escaped the catch in
    // reservations.service.ts and reached the generic error branch — the constraint would
    // still have held, but the API would be reporting an internal failure for what is a
    // perfectly ordinary lost race.
    expect(responses.map((response) => response.status).sort()).toEqual(
      [201, ...Array.from({ length: CONTENDERS - 1 }, () => 409)].sort(),
    );

    for (const response of conflicted) {
      expect(response.body.code).toBe('BOOKING_CONFLICT');
    }

    // The claim that actually matters: whatever the API said, the database holds one
    // booking. This is the assertion a naive check-then-insert implementation fails.
    expect(await countConfirmed(unitId)).toBe(1);
  });

  it('names the winning reservation in the losers’ 409 details', async () => {
    const unitId = await insertRentalUnit();

    const responses = await Promise.all(
      Array.from({ length: CONTENDERS }, (_unused, index) =>
        request(app)
          .post('/v1/reservations')
          .send({ rentalUnitId: unitId, guestName: `Guest ${index}`, ...SLOT }),
      ),
    );

    const winner = responses.find((response) => response.status === 201)!;
    const losers = responses.filter((response) => response.status === 409);

    // The 409 payload survives the race path, not just the happy pre-check path: a client
    // that lost gets the same actionable message as one that arrived a second late.
    for (const loser of losers) {
      expect(loser.body.details).toEqual([
        {
          id: winner.body.id,
          guestName: winner.body.guestName,
          startDate: SLOT.startDate,
          endDate: SLOT.endDate,
        },
      ]);
    }
  });

  it('serialises repeated waves onto the same unit', async () => {
    const unitId = await insertRentalUnit();

    // Three consecutive storms. After the first has settled the row is committed, so the
    // later waves exercise the *pre-check* path rather than the constraint path — and must
    // produce the same answer.
    for (let wave = 0; wave < 3; wave += 1) {
      await Promise.all(
        Array.from({ length: 8 }, (_unused, index) =>
          request(app)
            .post('/v1/reservations')
            .send({ rentalUnitId: unitId, guestName: `Wave ${wave} guest ${index}`, ...SLOT }),
        ),
      );
    }

    expect(await countConfirmed(unitId)).toBe(1);
  });
});

describe('concurrency: the constraint is per-unit, not a global lock', () => {
  it('accepts simultaneous bookings for the same dates on different units', async () => {
    const unitIds = await Promise.all(
      Array.from({ length: CONTENDERS }, (_unused, index) =>
        insertRentalUnit({ name: `Unit ${index}` }),
      ),
    );

    const responses = await Promise.all(
      unitIds.map((unitId, index) =>
        request(app)
          .post('/v1/reservations')
          .send({ rentalUnitId: unitId, guestName: `Guest ${index}`, ...SLOT }),
      ),
    );

    // All of them. `rental_unit_id WITH =` scopes the exclusion to one property, so twenty
    // properties booking the same week is twenty bookings — not a queue, and not a
    // throughput ceiling shared across the whole business.
    expect(responses.every((response) => response.status === 201)).toBe(true);
    expect(await countConfirmed()).toBe(CONTENDERS);
  });

  it('accepts a simultaneous chain of same-day turnovers on one unit', async () => {
    const unitId = await insertRentalUnit();

    // Ten back-to-back stays, all submitted at once. Each ends on the day the next begins,
    // so under the half-open rule none of them conflict — but they are adjacent in the
    // same GiST index pages, which is where an implementation that over-locks (a table
    // lock, `SELECT … FOR UPDATE` on the unit, a serialisable retry loop) would start
    // rejecting or deadlocking.
    const responses = await Promise.all(
      Array.from({ length: 10 }, (_unused, index) =>
        request(app)
          .post('/v1/reservations')
          .send({
            rentalUnitId: unitId,
            guestName: `Turnover ${index}`,
            startDate: `2026-03-${String(index * 2 + 1).padStart(2, '0')}`,
            endDate: `2026-03-${String(index * 2 + 3).padStart(2, '0')}`,
          }),
      ),
    );

    expect(responses.map((response) => response.status)).toEqual(
      Array.from({ length: 10 }, () => 201),
    );
    expect(await countConfirmed(unitId)).toBe(10);
  });
});

/**
 * The bypass test.
 *
 * Every other test in this suite reaches the database through the service layer, so all of
 * them would keep passing if the booking rule were quietly reimplemented in TypeScript.
 * These do not: they issue the overlapping INSERT with `pool.query` directly — no route,
 * no service, no repository, no pre-check — and assert Postgres refuses it.
 *
 * That is the difference between "our code prevents double bookings" and "double bookings
 * are impossible". A future feature written by someone who has never read the design notes
 * — a bulk importer, an admin script, a fix applied by hand in psql — reaches the same
 * constraint. There is no path around it, which is the whole reason the rule was put in
 * the schema instead of in a service.
 */
describe('bypass: the guarantee belongs to the database', () => {
  it('rejects an overlapping raw INSERT against a reservation created through the API', async () => {
    const unitId = await insertRentalUnit();

    const created = await request(app)
      .post('/v1/reservations')
      .send({ rentalUnitId: unitId, guestName: 'Jane Doe', ...SLOT });
    expect(created.status).toBe(201);

    await expect(
      pool.query(
        `INSERT INTO reservations (id, rental_unit_id, guest_name, start_date, end_date, status)
         VALUES ($1, $2, $3, $4::date, $5::date, 'confirmed')`,
        [randomUUID(), unitId, 'Smuggled In', '2026-03-12', '2026-03-18'],
      ),
    ).rejects.toMatchObject({
      code: SQLSTATE.EXCLUSION_VIOLATION,
      constraint: 'reservation_no_overlap',
    });

    expect(await countConfirmed(unitId)).toBe(1);
  });

  it('rejects an overlapping raw UPDATE, not just an INSERT', async () => {
    const unitId = await insertRentalUnit();

    const first = await request(app)
      .post('/v1/reservations')
      .send({ rentalUnitId: unitId, guestName: 'Jane Doe', ...SLOT });
    const second = await request(app)
      .post('/v1/reservations')
      .send({ rentalUnitId: unitId, guestName: 'John Smith', startDate: '2026-03-20', endDate: '2026-03-25' });
    expect([first.status, second.status]).toEqual([201, 201]);

    // Dragging the second stay onto the first, in SQL. The constraint is on the row's
    // *state*, not on the statement that produced it, so an UPDATE is checked identically.
    await expect(
      pool.query(`UPDATE reservations SET start_date = $2::date, end_date = $3::date WHERE id = $1`, [
        second.body.id,
        '2026-03-12',
        '2026-03-18',
      ]),
    ).rejects.toMatchObject({ code: SQLSTATE.EXCLUSION_VIOLATION });
  });

  it('rejects the second of two overlapping raw INSERTs inside one transaction', async () => {
    const unitId = await insertRentalUnit();
    const client = await pool.connect();

    // Atomicity was never the missing ingredient — a transaction around a check-then-write
    // is exactly the MongoDB approach the FAQ shows to be insufficient. What makes this
    // fail is mutual exclusion in the index, which a transaction neither provides nor
    // suppresses.
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO reservations (id, rental_unit_id, guest_name, start_date, end_date)
         VALUES ($1, $2, 'First', '2026-03-10'::date, '2026-03-15'::date)`,
        [randomUUID(), unitId],
      );

      await expect(
        client.query(
          `INSERT INTO reservations (id, rental_unit_id, guest_name, start_date, end_date)
           VALUES ($1, $2, 'Second', '2026-03-12'::date, '2026-03-18'::date)`,
          [randomUUID(), unitId],
        ),
      ).rejects.toMatchObject({ code: SQLSTATE.EXCLUSION_VIOLATION });
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }

    expect(await countConfirmed(unitId)).toBe(0);
  });

  it('rejects a raw INSERT that races two concurrent transactions', async () => {
    const unitId = await insertRentalUnit();
    const [a, b] = await Promise.all([pool.connect(), pool.connect()]);

    try {
      await Promise.all([a.query('BEGIN'), b.query('BEGIN')]);

      // A commits first and takes the slot.
      await a.query(
        `INSERT INTO reservations (id, rental_unit_id, guest_name, start_date, end_date)
         VALUES ($1, $2, 'A', '2026-03-10'::date, '2026-03-15'::date)`,
        [randomUUID(), unitId],
      );

      // B's INSERT blocks on the GiST index while A is uncommitted — this is the mutual
      // exclusion a `find()`-then-`insertOne()` in a snapshot-isolated transaction does not
      // have — and is rejected the moment A commits.
      const bInsert = b.query(
        `INSERT INTO reservations (id, rental_unit_id, guest_name, start_date, end_date)
         VALUES ($1, $2, 'B', '2026-03-12'::date, '2026-03-18'::date)`,
        [randomUUID(), unitId],
      );

      await a.query('COMMIT');
      await expect(bInsert).rejects.toMatchObject({ code: SQLSTATE.EXCLUSION_VIOLATION });
      await b.query('ROLLBACK');
    } finally {
      a.release();
      b.release();
    }

    expect(await countConfirmed(unitId)).toBe(1);
  });
});
