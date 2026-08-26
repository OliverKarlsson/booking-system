import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import type { DashboardEntry } from '@booking/shared';
import { DashboardUnitCard } from './DashboardUnitCard';
import {
  OCCUPIED_UNIT_ID,
  occupiedEntry,
  unbookedEntry,
  vacantWithArrivalEntry,
} from './dashboardFixtures';

function renderCard(entry: DashboardEntry) {
  render(
    <MemoryRouter>
      <DashboardUnitCard entry={entry} />
    </MemoryRouter>,
  );
}

describe('DashboardUnitCard', () => {
  it('shows the current guest and their checkout date when the unit is occupied', () => {
    renderCard(occupiedEntry);

    expect(screen.getByText('Occupied')).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    // The checkout date is the stored `endDate`, shown as such: the interval is half-open
    // (§3.3), so it is the day the guest leaves, not their last night.
    expect(screen.getByText(/Checking out 15 Mar 2026/)).toBeInTheDocument();
    expect(screen.getByText(/in 2 days/)).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Seaside flat' })).toHaveAttribute(
      'href',
      `/units/${OCCUPIED_UNIT_ID}`,
    );
    expect(screen.getByText('Lisbon, Portugal')).toBeInTheDocument();
  });

  it('shows the next check-in alongside the current guest', () => {
    renderCard(occupiedEntry);

    expect(screen.getByText('Ola Nordmann')).toBeInTheDocument();
    expect(screen.getByText(/Arriving 20 Mar 2026/)).toBeInTheDocument();
    expect(screen.getByText(/2 nights/)).toBeInTheDocument();
  });

  it('shows the upcoming arrival when the unit is vacant', () => {
    renderCard(vacantWithArrivalEntry);

    expect(screen.getByText('Vacant')).toBeInTheDocument();
    expect(screen.getByText('Nobody staying right now')).toBeInTheDocument();

    expect(screen.getByText('Mia Larsson')).toBeInTheDocument();
    expect(screen.getByText(/Arriving 15 Mar 2026 · tomorrow · 1 night/)).toBeInTheDocument();
  });

  it('says explicitly that nothing is booked rather than leaving the slot blank', () => {
    renderCard(unbookedEntry);

    expect(screen.getByText('Vacant')).toBeInTheDocument();
    expect(screen.getByText('Nobody staying right now')).toBeInTheDocument();
    expect(screen.getByText('No upcoming reservation')).toBeInTheDocument();
    // An address is optional in the contract (§3.2); the subtitle says so instead of
    // collapsing to an empty line.
    expect(screen.getByText('No address recorded')).toBeInTheDocument();
  });

  it('prints the date the server evaluated the unit against, with its timezone', () => {
    renderCard(occupiedEntry);

    // Printed, never compared: `localDate` makes the badge inspectable (§3.6). There is
    // deliberately no "this property is on a different day" affordance anywhere here.
    expect(screen.getByText('As of 13 Mar 2026 · Europe/Lisbon')).toBeInTheDocument();
  });
});

/**
 * The regression guard for §3.7.
 *
 * A `new Date('2026-03-15')` sneaking into a formatter parses as **UTC midnight** and
 * renders as the 14th for every viewer west of Greenwich — a bug invisible in a Stockholm
 * developer's terminal. Rendering the identical fixture under two zones fourteen hours
 * apart and demanding byte-identical output is what catches it.
 */
describe.each([
  // UTC+14 and UTC-7: any `Date`-based formatting shifts the rendered day in at least one
  // of them.
  { timeZone: 'Pacific/Kiritimati', dayOfUtcMidnight: 15 },
  { timeZone: 'America/Los_Angeles', dayOfUtcMidnight: 14 },
])('rendered with the viewer in $timeZone', ({ timeZone, dayOfUtcMidnight }) => {
  const originalTimeZone = process.env.TZ;

  afterEach(() => {
    if (originalTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimeZone;
  });

  it('renders property-local dates exactly as returned', () => {
    process.env.TZ = timeZone;

    // Proof the override actually took effect. Without this the test could pass by simply
    // never having changed zone, which would make the assertions below meaningless — and
    // this is the one line in the suite that is *allowed* to construct a Date from a date
    // string, precisely because it is demonstrating the trap.
    expect(new Date('2026-03-15T00:00:00Z').getDate()).toBe(dayOfUtcMidnight);

    renderCard(occupiedEntry);

    expect(screen.getByText(/Checking out 15 Mar 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Arriving 20 Mar 2026/)).toBeInTheDocument();
    expect(screen.getByText('As of 13 Mar 2026 · Europe/Lisbon')).toBeInTheDocument();
  });
});
