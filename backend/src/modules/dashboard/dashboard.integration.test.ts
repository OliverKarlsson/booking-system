import type { DashboardEntry, DashboardResponse } from '@booking/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../../app';
import { pool } from '../../db/pool';
import { insertRentalUnit, insertReservationRaw } from '../../test/db';

/**
 * `GET /v1/dashboard` against a real Postgres (§3.6, §3.7).
 *
 * Every case here is driven through `?now=` — the test-only override. That is what turns
 * "occupancy is computed correctly at a boundary" from something you could only observe by
 * running the suite at the right minute into an assertion. Fixture dates are absolute
 * rather than relative to the real clock for the same reason: a test that computes its own
 * expectations from `new Date()` reimplements the logic it is checking and agrees with a
 * bug.
 */
const app = createApp();

/** The instant every fixed-date case is evaluated at. Midday UTC, well clear of any DST
 *  transition, so the local date derived for each zone is unambiguous. */
const NOW = '2026-03-26T12:00:00Z';
/** The local date at `Europe/Stockholm` (UTC+1 in March) for `NOW`. */
const TODAY = '2026-03-26';

async function fetchDashboard(now: string = NOW): Promise<DashboardEntry[]> {
  const response = await request(app).get('/v1/dashboard').query({ now }).expect(200);
  return (response.body as DashboardResponse).data;
}

async function fetchOne(now: string = NOW): Promise<DashboardEntry> {
  const entries = await fetchDashboard(now);
  expect(entries).toHaveLength(1);
  return entries[0] as DashboardEntry;
}

describe('GET /v1/dashboard — occupancy boundaries', () => {
  /**
   * The half-open interval at its most consequential: `end_date` is exclusive, so the
   * guest whose stay ends today left this morning and the flat is free tonight. An
   * implementation using `end_date >= D` passes every other test in this file and fails
   * only this one.
   */
  it('reports vacant when the guest checks out today', async () => {
    const unitId = await insertRentalUnit();
    await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Departing Guest',
      startDate: '2026-03-20',
      endDate: TODAY,
    });

    const entry = await fetchOne();

    expect(entry.localDate).toBe(TODAY);
    expect(entry.occupancy).toBe('vacant');
    expect(entry.currentReservation).toBeNull();
    expect(entry.nextCheckIn).toBeNull();
  });

  it('reports occupied when the guest checks in today', async () => {
    const unitId = await insertRentalUnit();
    await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Arriving Guest',
      startDate: TODAY,
      endDate: '2026-03-30',
    });

    const entry = await fetchOne();

    expect(entry.occupancy).toBe('occupied');
    expect(entry.currentReservation).toMatchObject({
      guestName: 'Arriving Guest',
      startDate: TODAY,
      endDate: '2026-03-30',
    });
    // The arriving guest is *current*, not next: `nextCheckIn` is strictly `start > D`.
    expect(entry.nextCheckIn).toBeNull();
  });

  it('reports occupied mid-stay', async () => {
    const unitId = await insertRentalUnit();
    await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Staying Guest',
      startDate: '2026-03-24',
      endDate: '2026-03-28',
    });

    const entry = await fetchOne();

    expect(entry.occupancy).toBe('occupied');
    expect(entry.currentReservation).toMatchObject({ guestName: 'Staying Guest' });
  });

  /**
   * Back-to-back changeover. Both reservations are legal — same-day turnover is not an
   * overlap — and on the changeover day the departing guest is *gone*: the unit is
   * occupied by the arriving guest, and `nextCheckIn` has already moved past both.
   */
  it('handles a back-to-back changeover: the arriving guest is the current one', async () => {
    const unitId = await insertRentalUnit();
    await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Checking Out',
      startDate: '2026-03-22',
      endDate: TODAY,
    });
    await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Checking In',
      startDate: TODAY,
      endDate: '2026-03-29',
    });
    await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Later Guest',
      startDate: '2026-04-02',
      endDate: '2026-04-06',
    });

    const entry = await fetchOne();

    expect(entry.occupancy).toBe('occupied');
    expect(entry.currentReservation).toMatchObject({
      guestName: 'Checking In',
      startDate: TODAY,
    });
    expect(entry.nextCheckIn).toMatchObject({ guestName: 'Later Guest' });
  });

  it('reports vacant with nothing upcoming for a unit that has no reservations', async () => {
    await insertRentalUnit({ name: 'Empty Unit' });

    const entry = await fetchOne();

    expect(entry.rentalUnit.name).toBe('Empty Unit');
    expect(entry.occupancy).toBe('vacant');
    expect(entry.currentReservation).toBeNull();
    expect(entry.nextCheckIn).toBeNull();
  });

  it('reports vacant with nothing upcoming when every reservation is in the past', async () => {
    const unitId = await insertRentalUnit();
    await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-01',
      endDate: '2026-03-05',
    });
    // Ends the day before D — the closest a past stay can get without touching it.
    await insertReservationRaw({
      rentalUnitId: unitId,
      startDate: '2026-03-20',
      endDate: '2026-03-25',
    });

    const entry = await fetchOne();

    expect(entry.occupancy).toBe('vacant');
    expect(entry.currentReservation).toBeNull();
    expect(entry.nextCheckIn).toBeNull();
  });

  /**
   * Cancelled rows are exempt from the exclusion constraint, and they have to be exempt
   * here too — for *both* roles. A cancelled stay covering today must not occupy the unit,
   * and a cancelled future stay must not be announced as the next arrival.
   */
  it('ignores cancelled reservations for both occupancy and next check-in', async () => {
    const unitId = await insertRentalUnit();
    await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Cancelled Current',
      startDate: '2026-03-24',
      endDate: '2026-03-28',
      status: 'cancelled',
    });
    await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Cancelled Future',
      startDate: '2026-04-01',
      endDate: '2026-04-04',
      status: 'cancelled',
    });

    const entry = await fetchOne();

    expect(entry.occupancy).toBe('vacant');
    expect(entry.currentReservation).toBeNull();
    expect(entry.nextCheckIn).toBeNull();
  });

  it('picks the earliest future reservation as the next check-in', async () => {
    const unitId = await insertRentalUnit();
    // Inserted out of order, so a result that happens to be right by insertion order
    // would not be right here.
    await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Far Future',
      startDate: '2026-05-10',
      endDate: '2026-05-15',
    });
    await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Soonest',
      startDate: '2026-03-28',
      endDate: '2026-03-31',
    });
    await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Middle',
      startDate: '2026-04-10',
      endDate: '2026-04-14',
    });

    const entry = await fetchOne();

    expect(entry.occupancy).toBe('vacant');
    expect(entry.nextCheckIn).toMatchObject({
      guestName: 'Soonest',
      startDate: '2026-03-28',
      endDate: '2026-03-31',
    });
  });

  it('reports the current stay and the next arrival together', async () => {
    const unitId = await insertRentalUnit();
    await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Here Now',
      startDate: '2026-03-24',
      endDate: '2026-03-28',
    });
    await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Coming Soon',
      startDate: '2026-03-28',
      endDate: '2026-04-02',
    });

    const entry = await fetchOne();

    expect(entry.occupancy).toBe('occupied');
    expect(entry.currentReservation).toMatchObject({ guestName: 'Here Now' });
    expect(entry.nextCheckIn).toMatchObject({ guestName: 'Coming Soon' });
  });
});

/**
 * ★ The tests that justify the design.
 *
 * Two units with byte-identical reservations differ only in their timezone. At the
 * instant below their local dates are a day apart, so the same booking means "occupied"
 * at one address and "vacant" at the other — simultaneously, for the same viewer.
 *
 * Any implementation that resolves "today" once — from the server's clock, from the
 * browser's, or from a date the client sent — must give these two units the same answer,
 * and is therefore wrong for at least one of them. That is not a rare edge: Auckland and
 * Los Angeles are ~20 hours apart, so their calendar dates disagree for most of every
 * day.
 */
describe('GET /v1/dashboard — "today" is per property, not per viewer (§3.7)', () => {
  /**
   * 2026-03-26T12:00Z is:
   *   Pacific/Auckland   (NZDT, UTC+13) → 2026-03-27 01:00 → local date 2026-03-27
   *   America/Los_Angeles (PDT, UTC-7)  → 2026-03-26 05:00 → local date 2026-03-26
   *
   * Chosen mid-afternoon-UTC and away from either zone's DST transition, so a ±1h
   * difference in tz data could not change either date and make the test flap.
   */
  const DIVERGENT_NOW = '2026-03-26T12:00:00Z';

  async function twoZoneUnits(): Promise<{ auckland: string; losAngeles: string }> {
    const auckland = await insertRentalUnit({
      name: 'A — Auckland Apartment',
      timezone: 'Pacific/Auckland',
    });
    const losAngeles = await insertRentalUnit({
      name: 'B — Los Angeles Loft',
      timezone: 'America/Los_Angeles',
    });
    return { auckland, losAngeles };
  }

  it('resolves a different local date for each unit at the same instant', async () => {
    await twoZoneUnits();

    const [auckland, losAngeles] = await fetchDashboard(DIVERGENT_NOW);

    expect(auckland?.rentalUnit.timezone).toBe('Pacific/Auckland');
    expect(auckland?.localDate).toBe('2026-03-27');
    expect(losAngeles?.rentalUnit.timezone).toBe('America/Los_Angeles');
    expect(losAngeles?.localDate).toBe('2026-03-26');
    expect(auckland?.localDate).not.toBe(losAngeles?.localDate);
  });

  it('reports different occupancy for identical reservations in different timezones', async () => {
    const { auckland, losAngeles } = await twoZoneUnits();

    // The same stay, to the day, at both properties: it ends on 2026-03-27.
    for (const rentalUnitId of [auckland, losAngeles]) {
      await insertReservationRaw({
        rentalUnitId,
        guestName: 'Same Guest, Same Dates',
        startDate: '2026-03-20',
        endDate: '2026-03-27',
      });
    }

    const [aucklandEntry, laEntry] = await fetchDashboard(DIVERGENT_NOW);

    // In Auckland it is already the 27th: the guest checked out this morning.
    expect(aucklandEntry?.localDate).toBe('2026-03-27');
    expect(aucklandEntry?.occupancy).toBe('vacant');
    expect(aucklandEntry?.currentReservation).toBeNull();

    // In Los Angeles it is still the 26th: the guest has one more night.
    expect(laEntry?.localDate).toBe('2026-03-26');
    expect(laEntry?.occupancy).toBe('occupied');
    expect(laEntry?.currentReservation).toMatchObject({ endDate: '2026-03-27' });

    // Stated once more as the thing that actually matters: identical data, opposite answer.
    expect(aucklandEntry?.occupancy).not.toBe(laEntry?.occupancy);
  });

  it('reports a different current guest and next check-in across the same date boundary', async () => {
    const { auckland, losAngeles } = await twoZoneUnits();

    for (const rentalUnitId of [auckland, losAngeles]) {
      await insertReservationRaw({
        rentalUnitId,
        guestName: 'Alice',
        startDate: '2026-03-20',
        endDate: '2026-03-27',
      });
      await insertReservationRaw({
        rentalUnitId,
        guestName: 'Bob',
        startDate: '2026-03-27',
        endDate: '2026-03-30',
      });
    }

    const [aucklandEntry, laEntry] = await fetchDashboard(DIVERGENT_NOW);

    // Auckland has already reached the changeover day: Bob is in, and nobody is next.
    expect(aucklandEntry?.currentReservation).toMatchObject({ guestName: 'Bob' });
    expect(aucklandEntry?.nextCheckIn).toBeNull();

    // Los Angeles has not: Alice is still in, and Bob is tomorrow's arrival.
    expect(laEntry?.currentReservation).toMatchObject({ guestName: 'Alice' });
    expect(laEntry?.nextCheckIn).toMatchObject({ guestName: 'Bob', startDate: '2026-03-27' });
  });

  /**
   * The failure §3.7 names outright: a Los Angeles flat reading vacant while the guest is
   * still in it, because the *server's* date rolled over. 05:00Z is 06:00 in Stockholm on
   * the 26th and 22:00 in Los Angeles on the 25th — the guest's last evening. A dashboard
   * computing one date from the server's clock calls this unit vacant; the guest is
   * sitting in it.
   */
  it('does not let the server\'s date roll over for a unit whose day has not', async () => {
    const unitId = await insertRentalUnit({
      name: 'LA Flat',
      timezone: 'America/Los_Angeles',
    });
    await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Still Asleep',
      startDate: '2026-03-22',
      endDate: '2026-03-26',
    });

    // 2026-03-26T05:00Z: Stockholm says the 26th, Los Angeles still says the 25th.
    const entry = await fetchOne('2026-03-26T05:00:00Z');

    expect(entry.localDate).toBe('2026-03-25');
    expect(entry.occupancy).toBe('occupied');
    expect(entry.currentReservation).toMatchObject({ guestName: 'Still Asleep' });
  });

  /**
   * The timezone is editable (§3.7), and this is the only thing editing it changes:
   * no stored reservation is reinterpreted, one derived date moves.
   */
  it('follows a unit whose timezone is changed', async () => {
    const unitId = await insertRentalUnit({ timezone: 'America/Los_Angeles' });
    await insertReservationRaw({
      rentalUnitId: unitId,
      guestName: 'Guest',
      startDate: '2026-03-20',
      endDate: '2026-03-27',
    });

    expect((await fetchOne(DIVERGENT_NOW)).occupancy).toBe('occupied');

    await pool.query(`UPDATE rental_units SET timezone = 'Pacific/Auckland' WHERE id = $1`, [
      unitId,
    ]);

    const moved = await fetchOne(DIVERGENT_NOW);
    expect(moved.localDate).toBe('2026-03-27');
    expect(moved.occupancy).toBe('vacant');
  });
});

describe('GET /v1/dashboard — unit selection and shape', () => {
  it('excludes soft-deleted units entirely', async () => {
    const deletedId = await insertRentalUnit({ name: 'Deleted Unit', status: 'deleted' });
    await insertRentalUnit({ name: 'Active Unit' });
    // A deleted unit's reservations must not leak in either.
    await insertReservationRaw({
      rentalUnitId: deletedId,
      startDate: '2026-03-24',
      endDate: '2026-03-28',
    });

    const entries = await fetchDashboard();

    expect(entries).toHaveLength(1);
    expect(entries[0]?.rentalUnit.name).toBe('Active Unit');
  });

  it('returns an empty data array when there are no units', async () => {
    const response = await request(app).get('/v1/dashboard').expect(200);

    expect(response.body).toEqual({ data: [] });
  });

  it('orders units by name', async () => {
    await insertRentalUnit({ name: 'Charlie Cottage' });
    await insertRentalUnit({ name: 'Alpha Apartment' });
    await insertRentalUnit({ name: 'Bravo Bungalow' });

    const entries = await fetchDashboard();

    expect(entries.map((entry) => entry.rentalUnit.name)).toEqual([
      'Alpha Apartment',
      'Bravo Bungalow',
      'Charlie Cottage',
    ]);
  });

  it('nests the address and omits it when the unit has none', async () => {
    const withAddress = await insertRentalUnit({ name: 'A With Address' });
    await pool.query(
      `UPDATE rental_units SET street = $2, city = $3, country = $4 WHERE id = $1`,
      [withAddress, 'Kungsgatan 1', 'Stockholm', 'Sweden'],
    );
    await insertRentalUnit({ name: 'B Without Address' });

    const [addressed, bare] = await fetchDashboard();

    expect(addressed?.rentalUnit.address).toEqual({
      street: 'Kungsgatan 1',
      city: 'Stockholm',
      country: 'Sweden',
    });
    expect(bare?.rentalUnit).not.toHaveProperty('address');
  });

  /** `status`, `createdAt` and `updatedAt` are not part of the dashboard's unit shape. */
  it('exposes only the fields §3.6 lists for the unit', async () => {
    await insertRentalUnit();

    const entry = await fetchOne();

    expect(Object.keys(entry).sort()).toEqual([
      'currentReservation',
      'localDate',
      'nextCheckIn',
      'occupancy',
      'rentalUnit',
    ]);
    expect(Object.keys(entry.rentalUnit).sort()).toEqual(['id', 'name', 'timezone']);
  });

  /** No `?now=` at all is the real client's request; it must work and echo a real date. */
  it('falls back to the server clock when no override is supplied', async () => {
    await insertRentalUnit({ timezone: 'Europe/Stockholm' });

    const response = await request(app).get('/v1/dashboard').expect(200);
    const [entry] = (response.body as DashboardResponse).data;

    expect(entry?.localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('rejects a malformed ?now= with VALIDATION_ERROR', async () => {
    const response = await request(app)
      .get('/v1/dashboard')
      .query({ now: 'not-an-instant' })
      .expect(400);

    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  /**
   * `?now=` takes an instant, not a calendar date — a date alone has no timezone, which is
   * exactly the ambiguity this endpoint refuses to accept from a caller.
   */
  it('rejects a bare date as ?now=', async () => {
    await request(app).get('/v1/dashboard').query({ now: '2026-03-26' }).expect(400);
  });
});

/**
 * The query is one statement regardless of how many units exist. A per-unit loop would be
 * 2N+1 round trips for a page that is conceptually a single read, and it would degrade
 * exactly as a portfolio grows — the moment the endpoint matters most.
 */
describe('GET /v1/dashboard — one query, not N+1', () => {
  it('issues a single database query for many units', async () => {
    let queryCount = 0;

    for (let index = 0; index < 10; index += 1) {
      const unitId = await insertRentalUnit({ name: `Unit ${String(index).padStart(2, '0')}` });
      await insertReservationRaw({
        rentalUnitId: unitId,
        startDate: '2026-03-24',
        endDate: '2026-03-28',
      });
      await insertReservationRaw({
        rentalUnitId: unitId,
        startDate: '2026-04-01',
        endDate: '2026-04-05',
      });
    }

    // Counting at the pool rather than on a repository mock: this measures what the
    // endpoint actually does to the database, which is the claim being made. Restored by
    // deleting the own property, so `pool.query` goes back to the prototype method.
    const originalQuery = pool.query.bind(pool);
    Object.defineProperty(pool, 'query', {
      configurable: true,
      writable: true,
      value: (...args: unknown[]): unknown => {
        queryCount += 1;
        return (originalQuery as (...a: unknown[]) => unknown)(...args);
      },
    });

    try {
      const entries = await fetchDashboard();
      expect(entries).toHaveLength(10);
      expect(entries.every((entry) => entry.occupancy === 'occupied')).toBe(true);
      expect(entries.every((entry) => entry.nextCheckIn !== null)).toBe(true);
    } finally {
      delete (pool as Partial<Pick<typeof pool, 'query'>>).query;
    }

    expect(queryCount).toBe(1);
  });

  /**
   * The partial index from §4 is what makes the two LATERAL subqueries cheap, and it only
   * helps if its predicate still matches theirs. Asserting its definition turns "these
   * joins are fast" from a comment into something that fails loudly if the index is
   * dropped, reordered, or has its `WHERE` changed out from under this query.
   *
   * The index definition, not an `EXPLAIN` plan: at test-fixture row counts the planner
   * correctly prefers a sequential scan whatever indexes exist, so asserting on a plan
   * would either be forced with `enable_seqscan = off` (proving only that the index is
   * *usable*) or be flaky.
   */
  it('keeps the partial index aligned with the lateral subqueries', async () => {
    const { rows } = await pool.query<{ indexdef: string }>(
      `SELECT indexdef FROM pg_indexes
       WHERE tablename = 'reservations' AND indexname = 'reservations_unit_dates_idx'`,
    );

    const indexdef = rows[0]?.indexdef;
    expect(indexdef).toBeDefined();
    // Leading column is the correlation key both subqueries filter on...
    expect(indexdef).toMatch(/\(rental_unit_id, start_date, end_date\)/);
    // ...`start_date` is second, so `ORDER BY start_date LIMIT 1` stops at the first row
    // instead of sorting the unit's whole history...
    // ...and the predicate is exactly the one both subqueries carry.
    expect(indexdef).toContain(`status = 'confirmed'`);
  });
});
