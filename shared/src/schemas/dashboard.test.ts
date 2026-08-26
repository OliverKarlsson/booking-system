import { describe, expect, it } from 'vitest';

import { dashboardEntrySchema, dashboardQuerySchema, dashboardResponseSchema } from './dashboard';

const rentalUnit = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  name: 'Sunny flat',
  timezone: 'Europe/Stockholm',
  address: { city: 'Stockholm' },
};

const currentReservation = {
  id: '9c858901-8a57-4791-81fe-4c455b099bc9',
  guestName: 'Jane Doe',
  startDate: '2026-03-24',
  endDate: '2026-03-28',
};

const nextCheckIn = {
  id: 'b1b2c3d4-1111-4222-8333-444455556666',
  guestName: 'John Roe',
  startDate: '2026-03-30',
  endDate: '2026-04-02',
};

const occupiedEntry = {
  rentalUnit,
  localDate: '2026-03-26',
  occupancy: 'occupied' as const,
  currentReservation,
  nextCheckIn,
};

describe('dashboardEntrySchema', () => {
  it('accepts an occupied unit with an upcoming check-in', () => {
    expect(dashboardEntrySchema.parse(occupiedEntry)).toEqual(occupiedEntry);
  });

  it('accepts a vacant unit with nothing booked', () => {
    const vacant = {
      rentalUnit,
      localDate: '2026-03-26',
      occupancy: 'vacant',
      currentReservation: null,
      nextCheckIn: null,
    };

    expect(dashboardEntrySchema.parse(vacant)).toEqual(vacant);
  });

  it('accepts a vacant unit with an upcoming check-in', () => {
    expect(
      dashboardEntrySchema.safeParse({ ...occupiedEntry, occupancy: 'vacant', currentReservation: null }).success,
    ).toBe(true);
  });

  it('requires the nullable fields to be present rather than absent', () => {
    const { currentReservation: _omitted, ...withoutCurrent } = occupiedEntry;

    expect(dashboardEntrySchema.safeParse(withoutCurrent).success).toBe(false);
  });

  it('requires localDate to be a calendar date, not an instant', () => {
    expect(dashboardEntrySchema.safeParse({ ...occupiedEntry, localDate: '2026-03-26T00:00:00Z' }).success).toBe(
      false,
    );
    expect(dashboardEntrySchema.safeParse({ ...occupiedEntry, localDate: '2026-02-31' }).success).toBe(false);
  });

  it('rejects an unknown occupancy value', () => {
    expect(dashboardEntrySchema.safeParse({ ...occupiedEntry, occupancy: 'maybe' }).success).toBe(false);
  });

  it('carries the unit timezone, since the dashboard is the only place it is used', () => {
    expect(dashboardEntrySchema.parse(occupiedEntry).rentalUnit.timezone).toBe('Europe/Stockholm');
    expect(
      dashboardEntrySchema.safeParse({
        ...occupiedEntry,
        rentalUnit: { ...rentalUnit, timezone: '+01:00' },
      }).success,
    ).toBe(false);
  });

  it('omits the unit fields the dashboard has no use for', () => {
    const parsed = dashboardEntrySchema.parse({
      ...occupiedEntry,
      rentalUnit: { ...rentalUnit, status: 'active', createdAt: '2026-01-01T00:00:00Z' },
    });

    expect(parsed.rentalUnit).not.toHaveProperty('status');
    expect(parsed.rentalUnit).not.toHaveProperty('createdAt');
  });
});

describe('dashboardResponseSchema', () => {
  it('wraps entries in a data array', () => {
    expect(dashboardResponseSchema.parse({ data: [occupiedEntry] }).data).toHaveLength(1);
  });

  it('accepts a system with no units yet', () => {
    expect(dashboardResponseSchema.parse({ data: [] })).toEqual({ data: [] });
  });
});

describe('dashboardQuerySchema', () => {
  it('accepts an empty query — the client never sends a date', () => {
    expect(dashboardQuerySchema.parse({})).toEqual({});
  });

  it('accepts the test-only now override as an instant', () => {
    expect(dashboardQuerySchema.parse({ now: '2026-03-26T20:00:00Z' })).toEqual({ now: '2026-03-26T20:00:00Z' });
  });

  it('rejects a calendar date for now — resolving it to a day is the server’s job', () => {
    expect(dashboardQuerySchema.safeParse({ now: '2026-03-26' }).success).toBe(false);
  });
});
