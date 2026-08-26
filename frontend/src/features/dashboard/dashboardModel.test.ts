import { describe, expect, it } from 'vitest';
import {
  formatLocality,
  occupancyBadge,
  relativeDayLabel,
  summarizeDashboard,
} from './dashboardModel';
import { occupiedEntry, unbookedEntry, vacantWithArrivalEntry } from './dashboardFixtures';

describe('occupancyBadge', () => {
  it('always spells the state out, so colour is never the only signal', () => {
    expect(occupancyBadge('occupied')).toEqual({ label: 'Occupied', tone: 'success' });
    expect(occupancyBadge('vacant')).toEqual({ label: 'Vacant', tone: 'neutral' });
  });
});

describe('summarizeDashboard', () => {
  it('counts occupancy and booked arrivals across the portfolio', () => {
    expect(
      summarizeDashboard([occupiedEntry, vacantWithArrivalEntry, unbookedEntry]),
    ).toEqual({ units: 3, occupied: 1, vacant: 2, arrivalsBooked: 2 });
  });

  it('counts a future booking on an occupied unit as an upcoming arrival', () => {
    // `arrivalsBooked` answers "how many units have someone arriving", which is a
    // different question from "how many are free" — an occupied unit with a stay booked
    // after the current one counts.
    expect(summarizeDashboard([occupiedEntry]).arrivalsBooked).toBe(1);
  });

  it('reports zeroes rather than throwing when nothing is returned', () => {
    expect(summarizeDashboard([])).toEqual({
      units: 0,
      occupied: 0,
      vacant: 0,
      arrivalsBooked: 0,
    });
  });
});

describe('formatLocality', () => {
  it('prefers city and country for the card subtitle', () => {
    expect(formatLocality({ street: 'Rua do Mar 4', city: 'Lisbon', country: 'Portugal' })).toBe(
      'Lisbon, Portugal',
    );
  });

  it('falls back to the street when there is no city', () => {
    expect(formatLocality({ street: 'Rua do Mar 4', country: 'Portugal' })).toBe(
      'Rua do Mar 4, Portugal',
    );
  });

  it('returns undefined for an absent or blank address so the line can be omitted', () => {
    expect(formatLocality(undefined)).toBeUndefined();
    expect(formatLocality({})).toBeUndefined();
    expect(formatLocality({ city: '   ' })).toBeUndefined();
  });
});

describe('relativeDayLabel', () => {
  it('names the near days and counts the rest', () => {
    expect(relativeDayLabel('2026-03-13', '2026-03-13')).toBe('today');
    expect(relativeDayLabel('2026-03-13', '2026-03-14')).toBe('tomorrow');
    expect(relativeDayLabel('2026-03-13', '2026-03-17')).toBe('in 4 days');
  });

  it('counts across a month boundary', () => {
    expect(relativeDayLabel('2026-03-30', '2026-04-02')).toBe('in 3 days');
  });

  it('is unaffected by the viewer clock, including across a DST transition', () => {
    // 29 March 2026 is the European DST switch — a 23-hour day. The count is calendar
    // arithmetic on the date strings, so the short day does not round it down to 2.
    expect(relativeDayLabel('2026-03-28', '2026-03-31')).toBe('in 3 days');
  });

  it('returns null for a past or unparseable date so the caller omits the phrase', () => {
    expect(relativeDayLabel('2026-03-13', '2026-03-12')).toBeNull();
    expect(relativeDayLabel('2026-03-13', 'not-a-date')).toBeNull();
  });
});
