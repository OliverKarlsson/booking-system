import { afterEach, describe, expect, it, vi } from 'vitest';

import { addDays, compareDates, datesOverlap, isValidDateString, todayLocal, todayUtc } from './dates';

describe('isValidDateString', () => {
  it.each(['2026-03-26', '2026-01-01', '2026-12-31', '2024-02-29', '2000-02-29', '1999-12-31'])(
    'accepts %s',
    (value) => {
      expect(isValidDateString(value)).toBe(true);
    },
  );

  it.each([
    ['single-digit month', '2026-3-26'],
    ['single-digit day', '2026-03-6'],
    ['two-digit year', '26-03-26'],
    ['slashes', '2026/03/26'],
    ['a timestamp', '2026-03-26T00:00:00Z'],
    ['a timestamp with offset', '2026-03-26T00:00:00+01:00'],
    ['trailing whitespace', '2026-03-26 '],
    ['leading whitespace', ' 2026-03-26'],
    ['empty string', ''],
    ['a word', 'today'],
    ['extra digits', '20260-03-26'],
  ])('rejects %s', (_label, value) => {
    expect(isValidDateString(value)).toBe(false);
  });

  it.each([
    ['31 February', '2026-02-31'],
    ['30 February', '2026-02-30'],
    ['29 February in a common year', '2026-02-29'],
    ['month 13', '2026-13-01'],
    ['month 00', '2026-00-10'],
    ['day 00', '2026-03-00'],
    ['day 32', '2026-01-32'],
    ['31 April', '2026-04-31'],
    ['31 June', '2026-06-31'],
    ['31 September', '2026-09-31'],
    ['31 November', '2026-11-31'],
  ])('rejects %s — a regex alone would accept it', (_label, value) => {
    expect(isValidDateString(value)).toBe(false);
  });

  describe('leap years', () => {
    it('accepts 29 February in a year divisible by 4', () => {
      expect(isValidDateString('2024-02-29')).toBe(true);
    });

    it('accepts 29 February in a year divisible by 400', () => {
      expect(isValidDateString('2000-02-29')).toBe(true);
    });

    it('rejects 29 February in a century that is not divisible by 400', () => {
      expect(isValidDateString('1900-02-29')).toBe(false);
      expect(isValidDateString('2100-02-29')).toBe(false);
    });
  });

  it.each([undefined, null, 20260326, new Date(), {}, ['2026-03-26']])('rejects the non-string %s', (value) => {
    expect(isValidDateString(value)).toBe(false);
  });
});

describe('compareDates', () => {
  it('orders chronologically', () => {
    expect(compareDates('2026-03-10', '2026-03-11')).toBe(-1);
    expect(compareDates('2026-03-11', '2026-03-10')).toBe(1);
    expect(compareDates('2026-03-10', '2026-03-10')).toBe(0);
  });

  it('orders across month and year boundaries', () => {
    expect(compareDates('2026-01-31', '2026-02-01')).toBe(-1);
    expect(compareDates('2025-12-31', '2026-01-01')).toBe(-1);
  });

  it('sorts an array without any date parsing', () => {
    const dates = ['2026-03-10', '2025-12-31', '2026-01-05', '2026-03-09'];

    expect([...dates].sort(compareDates)).toEqual(['2025-12-31', '2026-01-05', '2026-03-09', '2026-03-10']);
  });
});

describe('addDays', () => {
  it('adds within a month', () => {
    expect(addDays('2026-03-10', 1)).toBe('2026-03-11');
    expect(addDays('2026-03-10', 5)).toBe('2026-03-15');
  });

  it('returns the same date for a zero shift', () => {
    expect(addDays('2026-03-10', 0)).toBe('2026-03-10');
  });

  it('rolls over month ends', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-04-30', 1)).toBe('2026-05-01');
  });

  it('rolls over year ends', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles leap years', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2024-01-01', 366)).toBe('2025-01-01');
    expect(addDays('2026-01-01', 365)).toBe('2027-01-01');
  });

  it('moves backwards for negative values', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
    expect(addDays('2026-03-10', -40)).toBe('2026-01-29');
  });

  it('round-trips', () => {
    expect(addDays(addDays('2026-03-26', 97), -97)).toBe('2026-03-26');
  });

  it('does not shift a date across a DST transition (there are no hours to lose)', () => {
    // Europe/Stockholm springs forward on 2026-03-29; a 24h-arithmetic implementation
    // built on timestamps would land on the 29th twice or skip it.
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
  });

  it('throws on a malformed or impossible date', () => {
    expect(() => addDays('2026-02-31', 1)).toThrow(RangeError);
    expect(() => addDays('26-03-10', 1)).toThrow(RangeError);
  });

  it('throws on a fractional day count', () => {
    expect(() => addDays('2026-03-10', 1.5)).toThrow(RangeError);
  });
});

describe('datesOverlap', () => {
  // A: 2026-03-10 → 2026-03-15 in every case below.
  const aStart = '2026-03-10';
  const aEnd = '2026-03-15';

  const overlaps = (bStart: string, bEnd: string) => datesOverlap(aStart, aEnd, bStart, bEnd);

  it('is false when B starts exactly when A ends (same-day turnover)', () => {
    expect(overlaps('2026-03-15', '2026-03-20')).toBe(false);
  });

  it('is false when B ends exactly when A starts (same-day turnover, other direction)', () => {
    expect(overlaps('2026-03-05', '2026-03-10')).toBe(false);
  });

  it('is false for ranges separated by a gap', () => {
    expect(overlaps('2026-03-16', '2026-03-20')).toBe(false);
    expect(overlaps('2026-03-01', '2026-03-05')).toBe(false);
  });

  it('is true for identical ranges', () => {
    expect(overlaps(aStart, aEnd)).toBe(true);
  });

  it('is true when B is fully contained in A', () => {
    expect(overlaps('2026-03-11', '2026-03-14')).toBe(true);
  });

  it('is true when B fully contains A', () => {
    expect(overlaps('2026-03-01', '2026-03-31')).toBe(true);
  });

  it('is true for a partial overlap at the start of A', () => {
    expect(overlaps('2026-03-05', '2026-03-11')).toBe(true);
  });

  it('is true for a partial overlap at the end of A', () => {
    expect(overlaps('2026-03-14', '2026-03-20')).toBe(true);
  });

  it('is true when the ranges share exactly one night', () => {
    expect(overlaps('2026-03-14', '2026-03-15')).toBe(true);
    expect(overlaps('2026-03-09', '2026-03-11')).toBe(true);
  });

  it('handles single-night stays', () => {
    expect(datesOverlap('2026-03-10', '2026-03-11', '2026-03-10', '2026-03-11')).toBe(true);
    expect(datesOverlap('2026-03-10', '2026-03-11', '2026-03-11', '2026-03-12')).toBe(false);
    expect(datesOverlap('2026-03-11', '2026-03-12', '2026-03-10', '2026-03-11')).toBe(false);
  });

  it('is symmetric', () => {
    const cases: Array<[string, string, string, string]> = [
      ['2026-03-10', '2026-03-15', '2026-03-14', '2026-03-20'],
      ['2026-03-10', '2026-03-15', '2026-03-15', '2026-03-20'],
      ['2026-03-10', '2026-03-15', '2026-03-01', '2026-03-31'],
      ['2026-03-10', '2026-03-15', '2026-04-01', '2026-04-02'],
    ];

    for (const [s1, e1, s2, e2] of cases) {
      expect(datesOverlap(s1, e1, s2, e2)).toBe(datesOverlap(s2, e2, s1, e1));
    }
  });

  it('compares across month and year boundaries', () => {
    expect(datesOverlap('2025-12-28', '2026-01-03', '2026-01-02', '2026-01-10')).toBe(true);
    expect(datesOverlap('2025-12-28', '2026-01-01', '2026-01-01', '2026-01-10')).toBe(false);
  });
});

describe('todayUtc / todayLocal', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a valid date string', () => {
    expect(isValidDateString(todayUtc())).toBe(true);
    expect(isValidDateString(todayLocal())).toBe(true);
    expect(isValidDateString(todayLocal('Europe/Stockholm'))).toBe(true);
  });

  it('resolves the same instant to different calendar days in different zones', () => {
    // 20:00 UTC: already the 27th in Auckland (UTC+13), still the 26th in Los Angeles
    // (UTC-7). This is the split the dashboard's per-unit `localDate` exists for.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-26T20:00:00Z'));

    expect(todayUtc()).toBe('2026-03-26');
    expect(todayLocal('Pacific/Auckland')).toBe('2026-03-27');
    expect(todayLocal('America/Los_Angeles')).toBe('2026-03-26');
  });

  it('zero-pads single-digit months and days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-05T12:00:00Z'));

    expect(todayUtc()).toBe('2026-01-05');
    expect(todayLocal('UTC')).toBe('2026-01-05');
  });
});
