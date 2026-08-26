import { afterEach, describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateLong,
  formatDateRange,
  formatDayMonth,
  formatNights,
  formatTimestamp,
  nightsBetween,
  parseDateParts,
} from './formatDate';

describe('parseDateParts', () => {
  it('splits a YYYY-MM-DD string', () => {
    expect(parseDateParts('2026-03-26')).toEqual({ year: 2026, month: 3, day: 26 });
  });

  it('rejects anything that is not the exact wire format', () => {
    expect(parseDateParts('2026-3-26')).toBeNull();
    expect(parseDateParts('26/03/2026')).toBeNull();
    expect(parseDateParts('2026-03-26T00:00:00Z')).toBeNull();
    expect(parseDateParts('2026-13-01')).toBeNull();
    expect(parseDateParts('')).toBeNull();
  });
});

describe('formatDate', () => {
  it('formats a calendar date for display', () => {
    expect(formatDate('2026-03-26')).toBe('26 Mar 2026');
    expect(formatDateLong('2026-03-26')).toBe('26 March 2026');
    expect(formatDayMonth('2026-03-26')).toBe('26 Mar');
  });

  it('drops the leading zero on single-digit days', () => {
    expect(formatDate('2026-01-05')).toBe('5 Jan 2026');
  });

  it('renders the first and last day of the year correctly', () => {
    expect(formatDate('2026-01-01')).toBe('1 Jan 2026');
    expect(formatDate('2026-12-31')).toBe('31 Dec 2026');
  });

  it('shows a placeholder for a missing date and echoes an unrecognised one', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});

describe('formatDate is timezone-proof', () => {
  const original = globalThis.Date;

  afterEach(() => {
    globalThis.Date = original;
  });

  /**
   * The regression this whole module exists to prevent.
   *
   * `new Date('2026-03-26')` parses as UTC midnight, so any local-time formatter
   * renders it as the 25th west of Greenwich. Rather than asserting output under a
   * couple of sampled timezones — which only catches the offsets we happened to pick —
   * this makes constructing a `Date` at all a hard failure, which holds for every
   * offset there is.
   */
  it('never constructs a Date while formatting a calendar date', () => {
    globalThis.Date = new Proxy(original, {
      construct() {
        throw new Error('formatDate must not construct a Date from a YYYY-MM-DD string');
      },
      apply() {
        throw new Error('formatDate must not call Date()');
      },
    }) as DateConstructor;

    expect(formatDate('2026-03-26')).toBe('26 Mar 2026');
    expect(formatDateLong('2026-03-26')).toBe('26 March 2026');
    expect(formatDateRange('2026-03-26', '2026-03-29')).toBe('26–29 March 2026');
  });

  it('renders the stored day, not a shifted one, at both ends of a day', () => {
    // Midnight-adjacent dates are where the off-by-one shows up first.
    expect(formatDate('2026-03-01')).toBe('1 Mar 2026');
    expect(formatDate('2026-02-28')).toBe('28 Feb 2026');
    expect(formatDate('2024-02-29')).toBe('29 Feb 2024');
  });
});

describe('formatDateRange', () => {
  it('collapses the month and year when the stay stays inside one month', () => {
    expect(formatDateRange('2026-03-12', '2026-03-15')).toBe('12–15 March 2026');
  });

  it('keeps both months but states the year once when the stay crosses a month', () => {
    expect(formatDateRange('2026-03-28', '2026-04-03')).toBe('28 Mar – 3 Apr 2026');
  });

  it('spells out both ends when the stay crosses a year', () => {
    expect(formatDateRange('2025-12-28', '2026-01-03')).toBe('28 Dec 2025 – 3 Jan 2026');
  });

  it('falls back gracefully on malformed input', () => {
    expect(formatDateRange('nope', '2026-01-03')).toBe('nope – 3 Jan 2026');
  });
});

describe('nightsBetween', () => {
  it('counts the nights of a half-open [start, end) stay', () => {
    expect(nightsBetween('2026-03-12', '2026-03-15')).toBe(3);
    expect(nightsBetween('2026-03-12', '2026-03-13')).toBe(1);
  });

  it('is unaffected by DST transitions, because every UTC day is 24 hours', () => {
    // 29 March 2026 is the European spring-forward date; a local-time subtraction
    // would come back as 0.958… days and round wrong.
    expect(nightsBetween('2026-03-28', '2026-03-30')).toBe(2);
    // 1 November 2026 is the US fall-back date.
    expect(nightsBetween('2026-10-31', '2026-11-02')).toBe(2);
  });

  it('counts across a month and a leap day', () => {
    expect(nightsBetween('2026-01-30', '2026-02-02')).toBe(3);
    expect(nightsBetween('2024-02-28', '2024-03-01')).toBe(2);
  });

  it('returns null for malformed input', () => {
    expect(nightsBetween('nope', '2026-03-15')).toBeNull();
  });

  it('pluralises', () => {
    expect(formatNights('2026-03-12', '2026-03-13')).toBe('1 night');
    expect(formatNights('2026-03-12', '2026-03-15')).toBe('3 nights');
  });
});

describe('formatTimestamp', () => {
  it('formats an ISO instant — the one place a Date is correct', () => {
    // createdAt/updatedAt are genuine instants (§3.1), so viewer-local rendering is
    // the intended behaviour. Only assert it produced something, since the exact
    // string is locale- and zone-dependent by design.
    const rendered = formatTimestamp('2026-03-26T09:30:00.000Z');
    expect(rendered).not.toBe('—');
    expect(rendered).toContain('2026');
  });

  it('handles missing and malformed values', () => {
    expect(formatTimestamp(null)).toBe('—');
    expect(formatTimestamp('garbage')).toBe('garbage');
  });
});
