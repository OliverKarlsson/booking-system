import { datesOverlap, type ReservationStatus } from '@booking/shared';
import { describe, expect, it } from 'vitest';

/**
 * The booking rule, stated as boundary cases.
 *
 * These test `datesOverlap` from @booking/shared — which the **backend never uses to
 * enforce anything**. Enforcement is `reservation_no_overlap` in db/schema.sql, and the
 * only overlap predicate the server ever evaluates is the `daterange(...) && daterange(...)`
 * one in reservations.repository.ts, deliberately written from the same expression as the
 * constraint so the two cannot disagree.
 *
 * So what is this file worth? It is the rule written down in a form a human can read in
 * one sitting: `A.start < B.end AND B.start < A.end`, with every edge enumerated. The
 * integration suite asserts the identical cases against real Postgres
 * (reservations.integration.test.ts, schema.integration.test.ts); if the two ever
 * disagree, the database is right and this file is the bug. That redundancy is the point
 * — a discrepancy between the readable statement of the rule and the enforced one is
 * exactly what a test suite should be able to catch.
 *
 * Dates are compared as strings throughout. For zero-padded ISO dates lexicographic order
 * is chronological order (§3.1), so nothing is parsed and no timezone can be applied.
 */

/** The reference stay every case is compared against: 10 March, checking out the 15th. */
const STAY = { start: '2026-03-10', end: '2026-03-15' } as const;

const overlapsStay = (start: string, end: string): boolean =>
  datesOverlap(STAY.start, STAY.end, start, end);

describe('overlap rule: conflicting ranges', () => {
  it.each([
    ['identical range', '2026-03-10', '2026-03-15'],
    ['fully contained', '2026-03-11', '2026-03-14'],
    ['fully containing', '2026-03-01', '2026-03-31'],
    ['partial overlap at the start', '2026-03-08', '2026-03-11'],
    ['partial overlap at the end', '2026-03-14', '2026-03-20'],
    ['single night inside', '2026-03-12', '2026-03-13'],
    ['single night on the first day', '2026-03-10', '2026-03-11'],
    ['single night on the last occupied day', '2026-03-14', '2026-03-15'],
    ['one day of overlap at the start edge', '2026-03-09', '2026-03-11'],
    ['one day of overlap at the end edge', '2026-03-14', '2026-03-16'],
  ])('conflicts: %s', (_label, start, end) => {
    expect(overlapsStay(start, end)).toBe(true);
  });
});

describe('overlap rule: same-day turnover', () => {
  /**
   * The half-open interval `[start, end)` in two assertions.
   *
   * This is the case most implementations get wrong, and getting it wrong is expensive in
   * the direction nobody notices: it refuses real, bookable nights rather than accepting
   * bad ones, so it looks like the system is working conservatively while it quietly
   * loses half the changeovers a busy property has.
   */
  it('accepts a check-in on the day of an existing checkout', () => {
    expect(overlapsStay('2026-03-15', '2026-03-20')).toBe(false);
  });

  it('accepts a checkout on the day of an existing check-in', () => {
    expect(overlapsStay('2026-03-05', '2026-03-10')).toBe(false);
  });

  it('accepts back-to-back single nights on both sides', () => {
    expect(overlapsStay('2026-03-09', '2026-03-10')).toBe(false);
    expect(overlapsStay('2026-03-15', '2026-03-16')).toBe(false);
  });
});

describe('overlap rule: disjoint ranges', () => {
  it.each([
    ['entirely before', '2026-03-01', '2026-03-05'],
    ['entirely after', '2026-03-20', '2026-03-25'],
    ['a day short of the start', '2026-03-07', '2026-03-09'],
    ['a day past the end', '2026-03-16', '2026-03-18'],
  ])('does not conflict: %s', (_label, start, end) => {
    expect(overlapsStay(start, end)).toBe(false);
  });
});

describe('overlap rule: symmetry', () => {
  /**
   * Overlap is a symmetric relation, and an implementation that gets one direction right
   * and the other wrong passes any test suite that only ever asks in one order. The
   * exclusion constraint is symmetric for free — `&&` is a commutative operator — which
   * is one fewer property to maintain by hand.
   */
  it.each([
    ['2026-03-08', '2026-03-11'],
    ['2026-03-14', '2026-03-20'],
    ['2026-03-15', '2026-03-20'],
    ['2026-03-05', '2026-03-10'],
    ['2026-03-01', '2026-03-31'],
  ])('gives the same answer with the arguments swapped: %s → %s', (start, end) => {
    expect(datesOverlap(STAY.start, STAY.end, start, end)).toBe(
      datesOverlap(start, end, STAY.start, STAY.end),
    );
  });
});

/**
 * The cancellation exemption.
 *
 * `datesOverlap` knows nothing about status — it compares four dates — so the exemption
 * lives one level up: in SQL it is `WHERE status = 'confirmed'`, on the constraint it is
 * `WHERE (status = 'confirmed')`, and it is written out here so the two halves of the
 * rule can be read together.
 *
 * `blockedBy` is a local restatement for readability, **not** production code and not
 * imported by anything: the server never filters candidate conflicts in TypeScript. The
 * authoritative versions of these same cases run against Postgres in
 * reservations.integration.test.ts.
 */
interface ExistingReservation {
  id: string;
  status: ReservationStatus;
  startDate: string;
  endDate: string;
}

const blockedBy = (
  existing: ExistingReservation[],
  candidate: { startDate: string; endDate: string },
): ExistingReservation[] =>
  existing.filter(
    (reservation) =>
      reservation.status === 'confirmed' &&
      datesOverlap(
        reservation.startDate,
        reservation.endDate,
        candidate.startDate,
        candidate.endDate,
      ),
  );

describe('overlap rule: cancelled reservations are ignored', () => {
  const confirmed: ExistingReservation = {
    id: 'confirmed-1',
    status: 'confirmed',
    startDate: '2026-03-10',
    endDate: '2026-03-15',
  };
  const cancelled: ExistingReservation = {
    id: 'cancelled-1',
    status: 'cancelled',
    startDate: '2026-03-10',
    endDate: '2026-03-15',
  };

  it('does not block on a cancelled reservation covering the same dates', () => {
    expect(blockedBy([cancelled], { startDate: '2026-03-10', endDate: '2026-03-15' })).toEqual([]);
  });

  it('still blocks on a confirmed reservation when a cancelled one also overlaps', () => {
    expect(
      blockedBy([cancelled, confirmed], { startDate: '2026-03-12', endDate: '2026-03-13' }),
    ).toEqual([confirmed]);
  });

  it('reports every confirmed reservation the candidate spans, not just the first', () => {
    const second: ExistingReservation = {
      id: 'confirmed-2',
      status: 'confirmed',
      startDate: '2026-03-15',
      endDate: '2026-03-20',
    };

    // A long stay laid across a back-to-back changeover conflicts with both halves, and
    // the 409 payload has to name both — "conflicts with Jane Doe" is misleading when
    // there are two guests in the way.
    expect(
      blockedBy([confirmed, second], { startDate: '2026-03-01', endDate: '2026-03-31' }),
    ).toEqual([confirmed, second]);
  });

  it('ignores a cancelled reservation regardless of how it overlaps', () => {
    expect(blockedBy([cancelled], { startDate: '2026-03-01', endDate: '2026-03-31' })).toEqual([]);
    expect(blockedBy([cancelled], { startDate: '2026-03-12', endDate: '2026-03-13' })).toEqual([]);
  });
});
