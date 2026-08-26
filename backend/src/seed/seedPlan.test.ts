import { datesOverlap, isValidDateString, timezoneSchema } from '@booking/shared';
import { describe, expect, it } from 'vitest';

import {
  buildSeedPlan,
  deriveDashboardState,
  type LocalDateResolver,
  type SeedRentalUnit,
} from './seedPlan';

/**
 * The seed's dates are computed from "today", so the only way to assert anything about
 * them is to supply a fixed today. This resolver answers the same question `todayLocal`
 * does — what is the calendar date in `timeZone` at this instant — for an instant of the
 * test's choosing.
 *
 * `en-CA` because its short date format is already `YYYY-MM-DD`, which keeps the fake from
 * needing its own formatting code that could disagree with the real helper's.
 */
function resolverAt(instant: string): LocalDateResolver {
  const date = new Date(instant);
  return (timeZone) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
}

/**
 * 20:00 UTC is inside the ~20 hours a day when Auckland and Los Angeles are on different
 * calendar dates (Auckland 09:00 the next day, LA 13:00 the previous one). That divergence
 * is the point of the pair, so the default fixture instant sits where it holds.
 */
const DIVERGENT_INSTANT = '2026-03-26T20:00:00Z';

/** LA 02:00, Auckland 22:00 — the ~4 hours a day when the two agree on the date. */
const COINCIDENT_INSTANT = '2026-03-26T09:00:00Z';

const planAt = (instant: string): SeedRentalUnit[] => buildSeedPlan(resolverAt(instant));

const byRole = (plan: SeedRentalUnit[], role: SeedRentalUnit['role']): SeedRentalUnit[] =>
  plan.filter((unit) => unit.role === role);

const one = (plan: SeedRentalUnit[], role: SeedRentalUnit['role']): SeedRentalUnit => {
  const [unit] = byRole(plan, role);
  if (!unit) throw new Error(`No seeded unit with role ${role}`);
  return unit;
};

describe('buildSeedPlan', () => {
  const plan = planAt(DIVERGENT_INSTANT);

  it('produces at least the four units §7 requires', () => {
    expect(plan.length).toBeGreaterThanOrEqual(4);
  });

  it('emits only valid YYYY-MM-DD dates, each at least one night long', () => {
    for (const unit of plan) {
      expect(isValidDateString(unit.localDate)).toBe(true);

      for (const reservation of unit.reservations) {
        expect(isValidDateString(reservation.startDate)).toBe(true);
        expect(isValidDateString(reservation.endDate)).toBe(true);
        // The `reservation_valid_range` CHECK constraint, restated: a seed that violated
        // it would fail at insert time, and finding that out here is cheaper.
        expect(reservation.endDate > reservation.startDate).toBe(true);
      }
    }
  });

  it('uses timezones the shared schema accepts', () => {
    // The seed goes in through `createRentalUnitSchema`, so an unsupported identifier —
    // `UTC` and `Etc/*` are absent from Node's ICU list — would abort the seed at boot.
    for (const unit of plan) {
      expect(() => timezoneSchema.parse(unit.timezone)).not.toThrow();
    }
  });

  it('never plans two overlapping confirmed stays for one unit', () => {
    // This is the exclusion constraint's rule, checked against the fixture before Postgres
    // ever sees it. Seeding through the repositories means a violation *would* be caught
    // at boot — this test just makes the failure arrive during `npm run test:unit`
    // instead of during a demo.
    for (const unit of plan) {
      const confirmed = unit.reservations.filter((r) => r.status === 'confirmed');

      for (let i = 0; i < confirmed.length; i += 1) {
        for (let j = i + 1; j < confirmed.length; j += 1) {
          const a = confirmed[i]!;
          const b = confirmed[j]!;
          expect(datesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)).toBe(false);
        }
      }
    }
  });

  it('computes dates relative to today rather than hardcoding them', () => {
    const later = planAt('2027-07-14T20:00:00Z');
    const now = one(plan, 'occupied-today').reservations[1]!;
    const then = one(later, 'occupied-today').reservations[1]!;

    expect(then.startDate).not.toEqual(now.startDate);
  });

  it('includes past reservations and exactly one cancelled reservation', () => {
    const all = plan.flatMap((unit) => unit.reservations);

    expect(all.filter((r) => r.status === 'cancelled')).toHaveLength(1);
    expect(
      plan.some((unit) => unit.reservations.some((r) => r.endDate < unit.localDate)),
    ).toBe(true);
  });
});

describe('dashboard states the plan is meant to produce', () => {
  const plan = planAt(DIVERGENT_INSTANT);

  it('has a unit occupied today, with a next arrival', () => {
    const state = deriveDashboardState(one(plan, 'occupied-today'));

    expect(state.occupancy).toBe('occupied');
    expect(state.currentGuest).not.toBeNull();
    expect(state.nextCheckInGuest).not.toBeNull();
  });

  it('has a vacant unit whose next check-in skips the cancelled booking', () => {
    const unit = one(plan, 'vacant-with-upcoming');
    const state = deriveDashboardState(unit);
    const cancelled = unit.reservations.find((r) => r.status === 'cancelled');

    expect(state.occupancy).toBe('vacant');
    expect(state.currentGuest).toBeNull();
    expect(state.nextCheckInGuest).not.toBeNull();

    // The cancelled stay starts sooner than the confirmed one, so reporting it here would
    // mean the cancellation exemption had been lost somewhere.
    expect(cancelled).toBeDefined();
    expect(cancelled!.startDate < unit.reservations.at(-1)!.startDate).toBe(true);
    expect(state.nextCheckInGuest).not.toEqual(cancelled!.guestName);
  });

  it('has a vacant unit with nothing booked at all', () => {
    const unit = one(plan, 'vacant-unbooked');
    const state = deriveDashboardState(unit);

    expect(unit.reservations).toHaveLength(0);
    expect(state.occupancy).toBe('vacant');
    expect(state.currentGuest).toBeNull();
    expect(state.nextCheckInGuest).toBeNull();
  });

  it('has a back-to-back changeover where the arriving guest is the current one', () => {
    const unit = one(plan, 'changeover-today');
    const state = deriveDashboardState(unit);
    const [departing, arriving] = unit.reservations;

    // Touching, not overlapping: same-day turnover (§3.3).
    expect(departing!.endDate).toEqual(unit.localDate);
    expect(arriving!.startDate).toEqual(unit.localDate);

    // The guest who checks out today has gone; the one who checks in today is `current`,
    // not `nextCheckIn`, because that is strictly `startDate > D` (§3.6).
    expect(state.occupancy).toBe('occupied');
    expect(state.currentGuest).toEqual(arriving!.guestName);
    expect(state.nextCheckInGuest).toBeNull();
  });
});

describe('the far-apart timezone pair', () => {
  it('gives both units identical dates but different zones', () => {
    const pair = byRole(planAt(DIVERGENT_INSTANT), 'timezone-pair');
    expect(pair).toHaveLength(2);

    const [ahead, behind] = pair as [SeedRentalUnit, SeedRentalUnit];

    expect(ahead.timezone).not.toEqual(behind.timezone);
    expect(ahead.reservations.map((r) => [r.startDate, r.endDate])).toEqual(
      behind.reservations.map((r) => [r.startDate, r.endDate]),
    );
  });

  it('reports different occupancy for identical dates when the local dates diverge', () => {
    const [ahead, behind] = byRole(planAt(DIVERGENT_INSTANT), 'timezone-pair') as [
      SeedRentalUnit,
      SeedRentalUnit,
    ];

    // This is the case a viewer-local — or server-local — implementation gets wrong: same
    // reservation dates, same instant, different answer, because occupancy is a fact about
    // the flat and the two flats are not on the same day.
    expect(ahead.localDate).not.toEqual(behind.localDate);
    expect(deriveDashboardState(ahead).occupancy).toBe('occupied');
    expect(deriveDashboardState(behind).occupancy).toBe('vacant');
    expect(deriveDashboardState(behind).nextCheckInGuest).not.toBeNull();
  });

  it('stays coherent during the hours when the two zones share a date', () => {
    const [ahead, behind] = byRole(planAt(COINCIDENT_INSTANT), 'timezone-pair') as [
      SeedRentalUnit,
      SeedRentalUnit,
    ];

    // Two calendars twenty hours apart necessarily agree for part of the day, so the pair
    // cannot diverge around the clock. What must hold always is that each unit is judged
    // against its *own* date — here that means both read occupied, and nothing throws.
    expect(ahead.localDate).toEqual(behind.localDate);
    expect(deriveDashboardState(ahead).occupancy).toEqual(
      deriveDashboardState(behind).occupancy,
    );
  });
});
