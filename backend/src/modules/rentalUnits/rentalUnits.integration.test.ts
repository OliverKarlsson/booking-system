import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../app';
import { pool } from '../../db/pool';
import { insertRentalUnit, insertReservationRaw } from '../../test/db';

/**
 * The five endpoints of §3.6, driven through the real app against real Postgres.
 *
 * Supertest talks to `createApp()` rather than to the service, so every assertion below
 * covers the whole stack — Zod validation, the route, the service, the SQL, and the error
 * envelope — which is the only level at which "a soft-deleted unit reads as 404" is a
 * claim about the API rather than about a mock.
 *
 * Fixtures go in through `test/db.ts`'s raw SQL, deliberately: seeding a delete test with
 * `POST /v1/rental-units` would make it fail for two unrelated reasons, and reservations
 * cannot be created any other way here because the reservations module belongs to another
 * task in this build.
 */

let app: Express;

beforeAll(() => {
  app = createApp();
});

const VALID_UNIT = {
  name: 'Seaside Flat',
  timezone: 'Europe/Stockholm',
  address: { street: 'Storgatan 1', city: 'Malmö', postcode: '211 00', country: 'SE' },
};

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

describe('POST /v1/rental-units', () => {
  it('creates a unit and answers 201 with the full contract shape', async () => {
    const res = await request(app).post('/v1/rental-units').send(VALID_UNIT);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Seaside Flat',
      timezone: 'Europe/Stockholm',
      address: VALID_UNIT.address,
      status: 'active',
    });
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    // Instants, not calendar dates — these are the deliberate `timestamptz` exception of
    // §3.1 and must serialise as ISO 8601.
    expect(res.body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  /**
   * The address is stored as four flat columns and nested only on the way out. This checks
   * the mapping in both directions rather than trusting the round trip through one code
   * path: the API said `address.city`, so the column had better hold it.
   */
  it('flattens the nested address into columns and nests it back on read', async () => {
    const created = await request(app).post('/v1/rental-units').send(VALID_UNIT);

    const { rows } = await pool.query<{
      street: string | null;
      city: string | null;
      postcode: string | null;
      country: string | null;
    }>(`SELECT street, city, postcode, country FROM rental_units WHERE id = $1`, [
      created.body.id,
    ]);

    expect(rows[0]).toEqual({
      street: 'Storgatan 1',
      city: 'Malmö',
      postcode: '211 00',
      country: 'SE',
    });

    const read = await request(app).get(`/v1/rental-units/${created.body.id}`);
    expect(read.body.address).toEqual(VALID_UNIT.address);
  });

  it('accepts a partial address and reports only the fields that were given', async () => {
    const res = await request(app)
      .post('/v1/rental-units')
      .send({ name: 'Attic', timezone: 'Europe/Stockholm', address: { city: 'Lund' } });

    expect(res.status).toBe(201);
    expect(res.body.address).toEqual({ city: 'Lund' });
  });

  /**
   * An all-NULL address is reported as absent rather than as `{}`, so a unit created
   * without one reads back without one. `address` is optional in the contract precisely so
   * "not provided" is representable.
   */
  it('omits address entirely when none was supplied', async () => {
    const res = await request(app)
      .post('/v1/rental-units')
      .send({ name: 'Bare Unit', timezone: 'Europe/Stockholm' });

    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('address');
  });

  it.each([
    ['missing name', { timezone: 'Europe/Stockholm' }, 'name'],
    ['empty name', { name: '', timezone: 'Europe/Stockholm' }, 'name'],
    ['name over 120 chars', { name: 'x'.repeat(121), timezone: 'Europe/Stockholm' }, 'name'],
    ['missing timezone', { name: 'Seaside Flat' }, 'timezone'],
    ['unknown timezone', { name: 'Seaside Flat', timezone: 'Mars/Olympus' }, 'timezone'],
    // The one that matters: a fixed offset cannot express DST, so a unit stored as
    // `+01:00` reports the wrong local date for half the year. Rejected by name.
    ['fixed UTC offset', { name: 'Seaside Flat', timezone: '+01:00' }, 'timezone'],
    ['non-object address', { name: 'A', timezone: 'Europe/Stockholm', address: 'Storgatan 1' }, 'address'],
  ])('rejects %s with 400 VALIDATION_ERROR', async (_label, body, path) => {
    const res = await request(app).post('/v1/rental-units').send(body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path })]),
    );
  });

  /** `status` is not a writable field — the only route to `deleted` is DELETE (§3.6). */
  it('ignores an attempt to set status directly', async () => {
    const res = await request(app)
      .post('/v1/rental-units')
      .send({ ...VALID_UNIT, status: 'deleted' });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('active');
  });
});

describe('GET /v1/rental-units/:id', () => {
  it('returns 200 for an active unit', async () => {
    const id = await insertRentalUnit({ name: 'Seaside Flat' });

    const res = await request(app).get(`/v1/rental-units/${id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, name: 'Seaside Flat', status: 'active' });
  });

  it('returns 404 NOT_FOUND for an unknown id', async () => {
    const res = await request(app).get(`/v1/rental-units/${MISSING_ID}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  /**
   * Soft-deleted units are invisible to every read path (§3.6) — and invisible means
   * indistinguishable, not merely flagged. The response for a deleted unit must be byte
   * -identical to the response for an id that was never issued.
   */
  it('returns a deleted unit exactly as it returns an unknown id', async () => {
    const deletedId = await insertRentalUnit({ status: 'deleted' });

    const deleted = await request(app).get(`/v1/rental-units/${deletedId}`);
    const unknown = await request(app).get(`/v1/rental-units/${MISSING_ID}`);

    expect(deleted.status).toBe(404);
    expect(deleted.body).toEqual(unknown.body);
  });

  it('rejects a malformed id with 400 rather than guessing 404', async () => {
    const res = await request(app).get('/v1/rental-units/not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /v1/rental-units — pagination (§3.5)', () => {
  /** Names are zero-padded so `ORDER BY name` is also numeric order, making pages checkable. */
  async function seedUnits(count: number): Promise<void> {
    for (let i = 1; i <= count; i += 1) {
      await insertRentalUnit({ name: `Unit ${String(i).padStart(2, '0')}` });
    }
  }

  it('defaults to page 1, limit 20', async () => {
    await seedUnits(25);

    const res = await request(app).get('/v1/rental-units');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(20);
    expect(res.body.pagination).toEqual({ page: 1, limit: 20, total: 25, totalPages: 2 });
    expect(res.body.data[0].name).toBe('Unit 01');
  });

  it('returns the requested page with a stable, non-overlapping ordering', async () => {
    await seedUnits(25);

    const first = await request(app).get('/v1/rental-units?page=1&limit=10');
    const second = await request(app).get('/v1/rental-units?page=2&limit=10');
    const third = await request(app).get('/v1/rental-units?page=3&limit=10');

    expect(first.body.data.map((u: { name: string }) => u.name)).toEqual([
      'Unit 01', 'Unit 02', 'Unit 03', 'Unit 04', 'Unit 05',
      'Unit 06', 'Unit 07', 'Unit 08', 'Unit 09', 'Unit 10',
    ]);
    expect(second.body.data[0].name).toBe('Unit 11');
    expect(third.body.data).toHaveLength(5);
    expect(third.body.pagination).toEqual({ page: 3, limit: 10, total: 25, totalPages: 3 });

    // No id appears on two pages — the point of the `id` tie-break in ORDER BY.
    const ids = [...first.body.data, ...second.body.data, ...third.body.data].map(
      (u: { id: string }) => u.id,
    );
    expect(new Set(ids).size).toBe(25);
  });

  /**
   * An out-of-range page still reports the true total. This is why the count is a separate
   * statement rather than a `count(*) OVER ()` window, which returns no rows at all here
   * and would report `total: 0`.
   */
  it('reports the real total for a page past the end', async () => {
    await seedUnits(3);

    const res = await request(app).get('/v1/rental-units?page=9&limit=20');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({ page: 9, limit: 20, total: 3, totalPages: 1 });
  });

  it('reports 0 pages when there are no units', async () => {
    const res = await request(app).get('/v1/rental-units');

    expect(res.body).toEqual({
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });
  });

  /** Deleted units must not be counted either — otherwise pagination advertises rows it drops. */
  it('excludes soft-deleted units from both the page and the total', async () => {
    await insertRentalUnit({ name: 'Active One' });
    await insertRentalUnit({ name: 'Gone', status: 'deleted' });

    const res = await request(app).get('/v1/rental-units');

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Active One');
    expect(res.body.pagination.total).toBe(1);
  });

  it.each([
    ['page 0', 'page=0'],
    ['negative page', 'page=-1'],
    ['non-numeric limit', 'limit=abc'],
    // Rejected rather than clamped: a client asking for 1000 and silently receiving 100 is
    // a harder bug to notice than a 400.
    ['limit over the 100 maximum', 'limit=1000'],
  ])('rejects %s with 400', async (_label, query) => {
    const res = await request(app).get(`/v1/rental-units?${query}`);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });
});

describe('PATCH /v1/rental-units/:id', () => {
  it('updates the name and leaves everything else alone', async () => {
    const created = await request(app).post('/v1/rental-units').send(VALID_UNIT);

    const res = await request(app)
      .patch(`/v1/rental-units/${created.body.id}`)
      .send({ name: 'Renamed Flat' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed Flat');
    expect(res.body.timezone).toBe('Europe/Stockholm');
    expect(res.body.address).toEqual(VALID_UNIT.address);
  });

  /**
   * `timezone` is editable (§3.7). Because reservation dates are calendar dates, changing
   * it reinterprets no stored row — it only moves the dashboard's derived `localDate`.
   */
  it('updates the timezone', async () => {
    const created = await request(app).post('/v1/rental-units').send(VALID_UNIT);

    const res = await request(app)
      .patch(`/v1/rental-units/${created.body.id}`)
      .send({ timezone: 'Pacific/Auckland' });

    expect(res.status).toBe(200);
    expect(res.body.timezone).toBe('Pacific/Auckland');
  });

  it('rejects an invalid timezone on update, same as on create', async () => {
    const created = await request(app).post('/v1/rental-units').send(VALID_UNIT);

    const res = await request(app)
      .patch(`/v1/rental-units/${created.body.id}`)
      .send({ timezone: 'UTC+2' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  /**
   * Address is a value object and is replaced wholesale, not deep-merged. Deep-merging
   * would make clearing a single field impossible to express, since the schema admits no
   * `null`; under replace semantics both intents are sayable.
   */
  it('replaces the whole address rather than merging into it', async () => {
    const created = await request(app).post('/v1/rental-units').send(VALID_UNIT);

    const res = await request(app)
      .patch(`/v1/rental-units/${created.body.id}`)
      .send({ address: { city: 'Göteborg' } });

    expect(res.status).toBe(200);
    expect(res.body.address).toEqual({ city: 'Göteborg' });
  });

  it('clears the address when given an empty object', async () => {
    const created = await request(app).post('/v1/rental-units').send(VALID_UNIT);

    const res = await request(app)
      .patch(`/v1/rental-units/${created.body.id}`)
      .send({ address: {} });

    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('address');
  });

  it('leaves the address untouched when the key is omitted', async () => {
    const created = await request(app).post('/v1/rental-units').send(VALID_UNIT);

    const res = await request(app)
      .patch(`/v1/rental-units/${created.body.id}`)
      .send({ name: 'Renamed' });

    expect(res.body.address).toEqual(VALID_UNIT.address);
  });

  it('advances updatedAt', async () => {
    const created = await request(app).post('/v1/rental-units').send(VALID_UNIT);

    const res = await request(app)
      .patch(`/v1/rental-units/${created.body.id}`)
      .send({ name: 'Renamed' });

    expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(created.body.updatedAt).getTime(),
    );
    expect(res.body.createdAt).toBe(created.body.createdAt);
  });

  /** A Wave 1 decision: `PATCH {}` is far more likely a client bug than an intentional no-op. */
  it('rejects an empty patch body with 400', async () => {
    const created = await request(app).post('/v1/rental-units').send(VALID_UNIT);

    const res = await request(app).patch(`/v1/rental-units/${created.body.id}`).send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app)
      .patch(`/v1/rental-units/${MISSING_ID}`)
      .send({ name: 'Renamed' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  /** A deleted unit cannot be patched back into life; the write path filters it out too. */
  it('returns 404 for a soft-deleted unit', async () => {
    const id = await insertRentalUnit({ status: 'deleted' });

    const res = await request(app).patch(`/v1/rental-units/${id}`).send({ name: 'Renamed' });

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

describe('DELETE /v1/rental-units/:id — soft delete and its guard', () => {
  it('soft deletes an unused unit and answers 204 with no body', async () => {
    const id = await insertRentalUnit();

    const res = await request(app).delete(`/v1/rental-units/${id}`);

    expect(res.status).toBe(204);
    expect(res.body).toEqual({});
  });

  /**
   * The row survives — that is what "soft" means, and why it was chosen: cancelled
   * reservations may still reference the unit, and keeping the row keeps those historical
   * references resolvable (§3.6).
   */
  it('keeps the row and flips its status rather than deleting it', async () => {
    const id = await insertRentalUnit();

    await request(app).delete(`/v1/rental-units/${id}`);

    const { rows } = await pool.query<{ status: string }>(
      `SELECT status FROM rental_units WHERE id = $1`,
      [id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe('deleted');
  });

  it('makes the unit invisible to every read path afterwards', async () => {
    const id = await insertRentalUnit({ name: 'Doomed' });

    await request(app).delete(`/v1/rental-units/${id}`);

    const byId = await request(app).get(`/v1/rental-units/${id}`);
    const list = await request(app).get('/v1/rental-units');

    expect(byId.status).toBe(404);
    expect(list.body.data).toEqual([]);
    expect(list.body.pagination.total).toBe(0);
  });

  /**
   * Idempotency (§3.6). The second DELETE must be indistinguishable from deleting an id
   * that never existed — otherwise a client retrying a timed-out request can tell that its
   * first attempt landed, which is the state a retry is supposed to be blind to.
   */
  it('answers a repeat delete identically to deleting an unknown id', async () => {
    const id = await insertRentalUnit();

    const first = await request(app).delete(`/v1/rental-units/${id}`);
    const second = await request(app).delete(`/v1/rental-units/${id}`);
    const unknown = await request(app).delete(`/v1/rental-units/${MISSING_ID}`);

    expect(first.status).toBe(204);
    expect(second.status).toBe(404);
    expect(second.body.code).toBe('NOT_FOUND');
    expect(second.status).toBe(unknown.status);
    expect(second.body).toEqual(unknown.body);
  });

  it('refuses with 409 UNIT_HAS_RESERVATIONS when a confirmed reservation exists', async () => {
    const id = await insertRentalUnit();
    await insertReservationRaw({
      rentalUnitId: id,
      guestName: 'Jane Doe',
      startDate: '2026-03-10',
      endDate: '2026-03-15',
    });

    const res = await request(app).delete(`/v1/rental-units/${id}`);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('UNIT_HAS_RESERVATIONS');
    expect(res.body.error).toEqual(expect.any(String));
  });

  it('leaves the unit active and readable after a refused delete', async () => {
    const id = await insertRentalUnit();
    await insertReservationRaw({
      rentalUnitId: id,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
    });

    await request(app).delete(`/v1/rental-units/${id}`);
    const read = await request(app).get(`/v1/rental-units/${id}`);

    expect(read.status).toBe(200);
    expect(read.body.status).toBe('active');
  });

  /**
   * Cancelled reservations do not block. They are the reason soft delete exists — the row
   * stays so the cancelled booking's `rentalUnitId` still resolves — so they must not also
   * be the reason it is refused.
   */
  it('allows the delete when every reservation is cancelled', async () => {
    const id = await insertRentalUnit();
    await insertReservationRaw({
      rentalUnitId: id,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
      status: 'cancelled',
    });

    const res = await request(app).delete(`/v1/rental-units/${id}`);

    expect(res.status).toBe(204);
  });

  it('refuses when confirmed and cancelled reservations are mixed', async () => {
    const id = await insertRentalUnit();
    await insertReservationRaw({
      rentalUnitId: id,
      startDate: '2026-03-01',
      endDate: '2026-03-05',
      status: 'cancelled',
    });
    await insertReservationRaw({
      rentalUnitId: id,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
      status: 'confirmed',
    });

    const res = await request(app).delete(`/v1/rental-units/${id}`);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('UNIT_HAS_RESERVATIONS');
  });

  /** The guard is scoped to the unit, not to the table. */
  it("is not blocked by another unit's reservations", async () => {
    const busy = await insertRentalUnit({ name: 'Busy' });
    const idle = await insertRentalUnit({ name: 'Idle' });
    await insertReservationRaw({
      rentalUnitId: busy,
      startDate: '2026-03-10',
      endDate: '2026-03-15',
    });

    const res = await request(app).delete(`/v1/rental-units/${idle}`);

    expect(res.status).toBe(204);
  });

  it('rejects a malformed id with 400', async () => {
    const res = await request(app).delete('/v1/rental-units/not-a-uuid');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  /**
   * Concurrent deletes of the same unit: the `FOR UPDATE` lock serialises them, so exactly
   * one observes an active row and the rest see it already deleted. Without the lock both
   * could pass the guard — benign for this operation, but the same lock is what a future
   * write path would need to take to make the reservation check meaningful.
   */
  it('yields exactly one 204 when several deletes race', async () => {
    const id = await insertRentalUnit();

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => request(app).delete(`/v1/rental-units/${id}`)),
    );
    const statuses = responses.map((res) => res.status).sort();

    expect(statuses.filter((status) => status === 204)).toHaveLength(1);
    expect(statuses.filter((status) => status === 404)).toHaveLength(4);
  });
});
