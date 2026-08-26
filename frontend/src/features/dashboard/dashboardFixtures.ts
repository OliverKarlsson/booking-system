import type { DashboardEntry, ReservationSummary } from '@booking/shared';

/**
 * Fixtures for this feature's tests, kept in one file so every case starts from the same
 * unit and only states the field it is actually about.
 *
 * The dates are fixed rather than computed from `Date.now()`: the whole point of §3.7 is
 * that these strings are property-local calendar facts, so a fixture derived from the
 * test runner's clock would quietly reintroduce the dependency the tests exist to rule
 * out.
 */

export const OCCUPIED_UNIT_ID = '11111111-1111-4111-8111-111111111111';
export const VACANT_UNIT_ID = '22222222-2222-4222-8222-222222222222';
export const UNBOOKED_UNIT_ID = '33333333-3333-4333-8333-333333333333';

export function makeReservation(overrides: Partial<ReservationSummary> = {}): ReservationSummary {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    guestName: 'Jane Doe',
    startDate: '2026-03-12',
    endDate: '2026-03-15',
    ...overrides,
  };
}

/** A unit with a guest in it: checked in on the 12th, leaving on the 15th. */
export const occupiedEntry: DashboardEntry = {
  rentalUnit: {
    id: OCCUPIED_UNIT_ID,
    name: 'Seaside flat',
    timezone: 'Europe/Lisbon',
    address: { street: 'Rua do Mar 4', city: 'Lisbon', postcode: '1100-001', country: 'Portugal' },
  },
  localDate: '2026-03-13',
  occupancy: 'occupied',
  currentReservation: makeReservation(),
  nextCheckIn: makeReservation({
    id: '55555555-5555-4555-8555-555555555555',
    guestName: 'Ola Nordmann',
    startDate: '2026-03-20',
    endDate: '2026-03-22',
  }),
};

/** Empty today, with an arrival on the books. */
export const vacantWithArrivalEntry: DashboardEntry = {
  rentalUnit: {
    id: VACANT_UNIT_ID,
    name: 'Harbour studio',
    timezone: 'Pacific/Auckland',
    address: { city: 'Auckland', country: 'New Zealand' },
  },
  localDate: '2026-03-14',
  occupancy: 'vacant',
  currentReservation: null,
  nextCheckIn: makeReservation({
    id: '66666666-6666-4666-8666-666666666666',
    guestName: 'Mia Larsson',
    startDate: '2026-03-15',
    endDate: '2026-03-16',
  }),
};

/** Empty, and nothing booked — the state that must not read as a failed load. */
export const unbookedEntry: DashboardEntry = {
  rentalUnit: {
    id: UNBOOKED_UNIT_ID,
    name: 'Mountain cabin',
    timezone: 'America/Los_Angeles',
  },
  localDate: '2026-03-13',
  occupancy: 'vacant',
  currentReservation: null,
  nextCheckIn: null,
};
