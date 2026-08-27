import { describe, expect, it } from 'vitest';
import type { ConflictingReservation } from '@/lib/apiClient';
import { conflictMessage, conflictTitle, describeConflict } from './conflict';

const jane: ConflictingReservation = {
  id: '33333333-3333-4333-8333-333333333333',
  guestName: 'Jane Doe',
  startDate: '2026-03-12',
  endDate: '2026-03-15',
};

describe('conflict messages', () => {
  it('names the guest and the dates', () => {
    expect(conflictMessage(jane)).toBe('Conflicts with Jane Doe (12–15 March 2026)');
  });

  it('collapses a range that shares a month, and keeps one that does not', () => {
    expect(describeConflict(jane)).toBe('Jane Doe (12–15 March 2026)');
    expect(
      describeConflict({ ...jane, startDate: '2026-03-28', endDate: '2026-04-03' }),
    ).toBe('Jane Doe (28 Mar – 3 Apr 2026)');
  });

  it('renders dates exactly as stored, with no Date parsing in the path', () => {
    // The regression this guards: `new Date('2026-03-12')` is UTC midnight, which renders
    // as the 11th for every viewer west of Greenwich — a conflict message naming the wrong
    // day is worse than none. The assertion holds under any TZ because no Date is built.
    expect(conflictMessage({ ...jane, startDate: '2026-01-01', endDate: '2026-01-02' })).toBe(
      'Conflicts with Jane Doe (1–2 January 2026)',
    );
  });

  it('states the count once instead of reading as a list of one', () => {
    expect(conflictTitle([jane])).toBe('These dates are already booked');
    expect(conflictTitle([jane, { ...jane, id: 'other' }])).toBe(
      'These dates overlap 2 existing bookings',
    );
  });
});
