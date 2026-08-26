import { describe, expect, it, vi } from 'vitest';

import type { Queryable } from '../../db/pool';
import {
  findDashboardEntries,
  toDashboardEntry,
  type DashboardRow,
} from './dashboard.repository';

/** `pg`'s `query` is heavily overloaded; a plain spy satisfies the call site, not the type. */
const asQueryable = (query: unknown): Queryable => ({ query } as unknown as Queryable);

/**
 * Unit coverage of the pure half of the read path.
 *
 * The interesting *semantics* (which reservation counts as current, what day it is at the
 * property) live in SQL and are asserted against a real Postgres in
 * dashboard.integration.test.ts — mocking a database to assert a claim about how Postgres
 * evaluates `AT TIME ZONE` would prove nothing. What is worth testing without a database
 * is the mapping: a nullable column quietly becoming `undefined`, an occupancy flag
 * inverting, or an address appearing as `{}` for a unit that has none.
 */
function row(overrides: Partial<DashboardRow> = {}): DashboardRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Test Unit',
    timezone: 'Europe/Stockholm',
    street: null,
    city: null,
    postcode: null,
    country: null,
    local_date: '2026-03-26',
    current_id: null,
    current_guest_name: null,
    current_start_date: null,
    current_end_date: null,
    next_id: null,
    next_guest_name: null,
    next_start_date: null,
    next_end_date: null,
    ...overrides,
  };
}

describe('toDashboardEntry', () => {
  it('reports vacant when the current-reservation subquery matched nothing', () => {
    const entry = toDashboardEntry(row());

    expect(entry.occupancy).toBe('vacant');
    expect(entry.currentReservation).toBeNull();
    expect(entry.nextCheckIn).toBeNull();
    expect(entry.localDate).toBe('2026-03-26');
  });

  it('reports occupied and maps the current reservation to the summary shape', () => {
    const entry = toDashboardEntry(
      row({
        current_id: '22222222-2222-4222-8222-222222222222',
        current_guest_name: 'Jane Doe',
        current_start_date: '2026-03-24',
        current_end_date: '2026-03-28',
      }),
    );

    expect(entry.occupancy).toBe('occupied');
    expect(entry.currentReservation).toEqual({
      id: '22222222-2222-4222-8222-222222222222',
      guestName: 'Jane Doe',
      startDate: '2026-03-24',
      endDate: '2026-03-28',
    });
  });

  it('maps the next check-in independently of occupancy', () => {
    const entry = toDashboardEntry(
      row({
        next_id: '33333333-3333-4333-8333-333333333333',
        next_guest_name: 'John Smith',
        next_start_date: '2026-04-01',
        next_end_date: '2026-04-05',
      }),
    );

    expect(entry.occupancy).toBe('vacant');
    expect(entry.nextCheckIn).toEqual({
      id: '33333333-3333-4333-8333-333333333333',
      guestName: 'John Smith',
      startDate: '2026-04-01',
      endDate: '2026-04-05',
    });
  });

  it('nests the flat address columns, omitting the ones that are null', () => {
    const entry = toDashboardEntry(row({ street: 'Kungsgatan 1', city: 'Stockholm' }));

    expect(entry.rentalUnit.address).toEqual({ street: 'Kungsgatan 1', city: 'Stockholm' });
  });

  /**
   * `{}` would be true-ish, so a client's `if (unit.address)` would render an empty
   * address block for every unit that has none.
   */
  it('omits address entirely when every column is null', () => {
    const entry = toDashboardEntry(row());

    expect(entry.rentalUnit.address).toBeUndefined();
    expect(entry.rentalUnit).not.toHaveProperty('address');
  });

  it('carries dates through as strings, never as Date objects', () => {
    const entry = toDashboardEntry(
      row({
        current_id: '22222222-2222-4222-8222-222222222222',
        current_guest_name: 'Jane Doe',
        current_start_date: '2026-03-24',
        current_end_date: '2026-03-28',
      }),
    );

    expect(entry.localDate).toBe('2026-03-26');
    expect(entry.currentReservation?.startDate).toBe('2026-03-24');
    expect(entry.currentReservation?.startDate).not.toBeInstanceOf(Date);
  });
});

describe('findDashboardEntries', () => {
  it('passes the ?now= override through as a bound parameter, never interpolated', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await findDashboardEntries(asQueryable(query), { now: '2026-03-26T12:00:00Z' });

    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual(['2026-03-26T12:00:00Z']);
    expect(sql).not.toContain('2026-03-26T12:00:00Z');
  });

  /**
   * `null` rather than an omitted parameter, so `COALESCE($1::timestamptz, now())` falls
   * through to the server clock. Sending nothing at all would be a bind-parameter error.
   */
  it('binds null when no override is given, so the query falls back to now()', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await findDashboardEntries(asQueryable(query));

    expect(query.mock.calls[0]?.[1]).toEqual([null]);
  });
});
