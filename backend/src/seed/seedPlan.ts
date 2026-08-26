import { addDays, compareDates, datesOverlap, todayLocal, type Address } from '@booking/shared';

/**
 * The seed *plan* — what to create — with no database in sight.
 *
 * Split from `seed.ts` on purpose. The interesting part of a seed is not the INSERTs, it
 * is whether the chosen dates actually produce the dashboard states they claim to; that
 * question is pure, so it lives in a pure module with a unit test that needs no Postgres.
 * `seed.ts` is then a thin "walk this plan through the repositories" loop.
 *
 * Two rules govern every date below:
 *
 *  1. **Everything is relative to today**, via `addDays` on a `YYYY-MM-DD` string. A seed
 *     with literal dates is meaningful for about a week and then shows a dashboard full
 *     of history, which is worse than an empty one because it looks deliberate.
 *  2. **"Today" is resolved per unit, in that unit's own zone** (§3.7), because that is
 *     what the dashboard compares against. Anchoring the whole plan to one server-side
 *     date would put the Auckland unit's "current" stay a day out for most of the day —
 *     the exact bug the per-unit `timezone` column exists to prevent, reintroduced by the
 *     fixture that is supposed to demonstrate it.
 */

export type SeedReservationStatus = 'confirmed' | 'cancelled';

export interface SeedReservation {
  guestName: string;
  /** Inclusive check-in. */
  startDate: string;
  /** Exclusive check-out — `[startDate, endDate)`, per §3.3. */
  endDate: string;
  status: SeedReservationStatus;
}

/**
 * Which dashboard state this unit exists to demonstrate. Carried on the data rather than
 * written only in a comment so `seedPlan.test.ts` can assert the dates really produce it —
 * a comment claiming "this one is occupied" cannot fail when someone edits the offsets.
 */
export type SeedRole =
  | 'occupied-today'
  | 'vacant-with-upcoming'
  | 'vacant-unbooked'
  | 'changeover-today'
  | 'timezone-pair';

export interface SeedRentalUnit {
  role: SeedRole;
  name: string;
  timezone: string;
  address?: Address;
  /** That unit's own calendar date when the plan was built. Not stored — used to derive the dates below. */
  localDate: string;
  reservations: SeedReservation[];
}

/** Injectable so the unit test can drive the plan from a fixed date instead of the clock. */
export type LocalDateResolver = (timeZone: string) => string;

/**
 * The far-apart pair (§7 T3.4). Auckland is UTC+12/+13 and Los Angeles UTC-8/-7, so their
 * local dates differ by one for roughly twenty hours out of every twenty-four. Given
 * *identical* reservation dates the dashboard therefore reports different occupancy for
 * the two — which is the whole point of resolving "today" per unit, and is otherwise an
 * untested code path that only misbehaves in production.
 *
 * They coincide for the remaining ~4 hours a day (LA 00:00–04:00), when both read the same
 * way. That is not a flaw in the fixture: two calendars 20 hours apart necessarily agree
 * for part of the day, and no choice of dates can make them disagree around the clock.
 */
const PAIR_TIMEZONES = {
  ahead: 'Pacific/Auckland',
  behind: 'America/Los_Angeles',
} as const;

export function buildSeedPlan(resolveLocalDate: LocalDateResolver = todayLocal): SeedRentalUnit[] {
  /**
   * The pair share one set of dates, anchored on the *ahead* unit's today. Anchoring on
   * either zone works; picking one and reusing it is what makes "identical reservations,
   * different answer" true rather than approximately true.
   */
  const pairAnchor = resolveLocalDate(PAIR_TIMEZONES.ahead);
  const pairReservations = (pastGuest: string, currentGuest: string): SeedReservation[] => [
    {
      guestName: pastGuest,
      startDate: addDays(pairAnchor, -11),
      endDate: addDays(pairAnchor, -6),
      status: 'confirmed',
    },
    // Starts on the *ahead* unit's today. That unit is therefore mid-stay; the unit 20
    // hours behind has not reached this date yet and reads vacant, with this same stay as
    // its next check-in.
    {
      guestName: currentGuest,
      startDate: pairAnchor,
      endDate: addDays(pairAnchor, 3),
      status: 'confirmed',
    },
  ];

  const stockholm = resolveLocalDate('Europe/Stockholm');
  const newYork = resolveLocalDate('America/New_York');
  const tokyo = resolveLocalDate('Asia/Tokyo');
  const lisbon = resolveLocalDate('Europe/Lisbon');

  return [
    {
      role: 'occupied-today',
      name: 'Gamla Stan Studio',
      timezone: 'Europe/Stockholm',
      address: {
        street: 'Österlånggatan 12',
        city: 'Stockholm',
        postcode: '111 31',
        country: 'Sweden',
      },
      localDate: stockholm,
      reservations: [
        // A completed stay, so the unit has history and `GET /v1/reservations?to=…` has
        // something to return for a past window.
        {
          guestName: 'Petra Lindqvist',
          startDate: addDays(stockholm, -24),
          endDate: addDays(stockholm, -19),
          status: 'confirmed',
        },
        // Spans today in both directions, so this unit reads occupied for the whole day
        // rather than flipping at some hour.
        {
          guestName: 'Johan Ek',
          startDate: addDays(stockholm, -2),
          endDate: addDays(stockholm, 3),
          status: 'confirmed',
        },
        // Occupied *and* with a known next arrival — the dashboard card that has every
        // field populated at once.
        {
          guestName: 'Marta Silva',
          startDate: addDays(stockholm, 9),
          endDate: addDays(stockholm, 14),
          status: 'confirmed',
        },
      ],
    },

    {
      role: 'vacant-with-upcoming',
      name: 'Brooklyn Garden Apartment',
      timezone: 'America/New_York',
      address: {
        street: '244 Bergen Street',
        city: 'Brooklyn, NY',
        postcode: '11217',
        country: 'United States',
      },
      localDate: newYork,
      reservations: [
        {
          guestName: 'Danielle Cruz',
          startDate: addDays(newYork, -16),
          endDate: addDays(newYork, -11),
          status: 'confirmed',
        },
        // The cancelled row required by §7, deliberately placed *earlier* than the
        // confirmed arrival below. It is the nearest future stay by date, so a dashboard
        // that forgot `status = 'confirmed'` in the `nextCheckIn` lateral would report
        // Owen Hale here — a wrong answer this fixture makes visible instead of leaving to
        // a test nobody reruns.
        {
          guestName: 'Owen Hale',
          startDate: addDays(newYork, 1),
          endDate: addDays(newYork, 3),
          status: 'cancelled',
        },
        {
          guestName: 'Aisha Rahman',
          startDate: addDays(newYork, 5),
          endDate: addDays(newYork, 11),
          status: 'confirmed',
        },
      ],
    },

    {
      role: 'vacant-unbooked',
      name: 'Setagaya Machiya',
      timezone: 'Asia/Tokyo',
      address: { city: 'Tokyo', country: 'Japan' },
      localDate: tokyo,
      // Deliberately empty: the "nothing booked at all" card is the one whose empty state
      // the UI has to render explicitly, and a seed where every unit has data leaves that
      // branch unexercised on first run.
      reservations: [],
    },

    {
      role: 'changeover-today',
      name: 'Alfama Terrace',
      timezone: 'Europe/Lisbon',
      address: { street: 'Rua dos Remédios 88', city: 'Lisbon', country: 'Portugal' },
      localDate: lisbon,
      reservations: [
        // Checks out this morning and the next guest checks in this afternoon. The two
        // touch at `lisbon` and do not overlap (`[)`), so the exclusion constraint accepts
        // both — if same-day turnover were ever broken, seeding itself would fail loudly
        // rather than the bug surfacing later as a mysterious 409.
        {
          guestName: 'Nuno Barreto',
          startDate: addDays(lisbon, -4),
          endDate: lisbon,
          status: 'confirmed',
        },
        // Today's arrival is the *current* reservation, not the next check-in: they check
        // in on D itself, and `nextCheckIn` is strictly `startDate > D` (§3.6).
        {
          guestName: 'Grace Miller',
          startDate: lisbon,
          endDate: addDays(lisbon, 5),
          status: 'confirmed',
        },
      ],
    },

    {
      role: 'timezone-pair',
      name: 'Waiheke Vineyard Cabin',
      timezone: PAIR_TIMEZONES.ahead,
      address: { street: '30 Church Bay Road', city: 'Waiheke Island', country: 'New Zealand' },
      localDate: resolveLocalDate(PAIR_TIMEZONES.ahead),
      reservations: pairReservations('Tama Ngata', 'Sophie Bergman'),
    },

    {
      role: 'timezone-pair',
      name: 'Venice Beach Bungalow',
      timezone: PAIR_TIMEZONES.behind,
      address: { street: '1420 Ocean Front Walk', city: 'Los Angeles, CA', country: 'United States' },
      localDate: resolveLocalDate(PAIR_TIMEZONES.behind),
      // Identical dates to the Auckland unit above, different guests so the two rows are
      // still distinguishable on the dashboard.
      reservations: pairReservations('Marcus Reed', 'Elena Duarte'),
    },
  ];
}

export interface ExpectedDashboardState {
  occupancy: 'occupied' | 'vacant';
  currentGuest: string | null;
  nextCheckInGuest: string | null;
}

/**
 * What `GET /v1/dashboard` should report for a planned unit, derived from its dates by the
 * §3.6 rules.
 *
 * This is a *restatement* of the dashboard's SQL in TypeScript, which is normally the
 * thing to avoid — two definitions of one rule, free to drift. It is justified here
 * because it exists only to check the fixture: the test asserts that the offsets chosen
 * above really do produce an occupied unit, a vacant one, an unbooked one and a
 * changeover, without needing a database. If this and the SQL ever disagree, the
 * integration test against the real query is the one that decides.
 */
export function deriveDashboardState(unit: SeedRentalUnit): ExpectedDashboardState {
  const day = unit.localDate;
  const confirmed = unit.reservations.filter((r) => r.status === 'confirmed');

  // `[start, end)` narrowed to a single day: `datesOverlap` against `[D, D+1)` is exactly
  // `start <= D < end`, expressed with the shared helper rather than by hand.
  const current =
    confirmed.find((r) => datesOverlap(r.startDate, r.endDate, day, addDays(day, 1))) ?? null;

  const next =
    confirmed
      .filter((r) => compareDates(r.startDate, day) > 0)
      .sort((a, b) => compareDates(a.startDate, b.startDate))[0] ?? null;

  return {
    occupancy: current !== null ? 'occupied' : 'vacant',
    currentGuest: current?.guestName ?? null,
    nextCheckInGuest: next?.guestName ?? null,
  };
}
