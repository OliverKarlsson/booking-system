import type { Meta, StoryObj } from '@storybook/react';

import { DashboardUnitCard } from './DashboardUnitCard';
import { occupiedEntry, unbookedEntry, vacantWithArrivalEntry } from './dashboardFixtures';

/**
 * The dashboard card, in every state it can be in.
 *
 * This is the clearest case for Storybook in this project. Reaching "a unit checking out
 * today" or "a back-to-back changeover" through the running app means arranging dates in
 * the database relative to the property's own local date and then waiting for the right
 * moment — here each one is a fixture. The same states are asserted in
 * DashboardUnitCard.test.tsx; these stories are for looking at them.
 *
 * Every date is rendered from its `YYYY-MM-DD` string. Nothing here is converted to the
 * viewer's timezone, which is the whole point: a stay at the Auckland flat reads the same
 * whether you open this in Stockholm or Los Angeles.
 */
const meta = {
  title: 'Dashboard/UnitCard',
  component: DashboardUnitCard,
  parameters: { layout: 'padded' },
  // Satisfies the required `entry` prop; each story supplies its own.
  args: { entry: occupiedEntry },
} satisfies Meta<typeof DashboardUnitCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A guest is in the flat right now, and nobody is booked after them. */
export const Occupied: Story = {
  args: { entry: occupiedEntry },
};

/** Empty today, with a known arrival — the most common steady state. */
export const VacantWithUpcomingArrival: Story = {
  args: { entry: vacantWithArrivalEntry },
};

/** No bookings at all. Distinct from vacant-with-an-arrival, and it should look it. */
export const VacantAndUnbooked: Story = {
  args: { entry: unbookedEntry },
};

/**
 * A guest checks out today.
 *
 * The unit reads **vacant**, which follows from the half-open interval: the stay covers
 * `[start, end)`, so on `end` itself the flat is free. This is the boundary the booking
 * rule is built around and the one an off-by-one would break first.
 */
export const CheckingOutToday: Story = {
  args: {
    entry: {
      ...vacantWithArrivalEntry,
      rentalUnit: { ...vacantWithArrivalEntry.rentalUnit, name: 'Alfama Terrace' },
      occupancy: 'vacant',
      currentReservation: null,
      nextCheckIn: {
        ...vacantWithArrivalEntry.nextCheckIn!,
        guestName: 'Nuno Barreto',
        startDate: vacantWithArrivalEntry.localDate,
      },
    },
  },
};

/**
 * A back-to-back changeover: one guest leaves and another arrives on the same day.
 *
 * The arriving guest is the *current* reservation, not the next check-in, because their
 * stay already includes today. Same-day turnover is permitted — the two stays touch at a
 * boundary and do not overlap.
 */
export const BackToBackChangeover: Story = {
  args: {
    entry: {
      ...occupiedEntry,
      rentalUnit: { ...occupiedEntry.rentalUnit, name: 'Alfama Terrace' },
      occupancy: 'occupied',
      currentReservation: {
        ...occupiedEntry.currentReservation!,
        guestName: 'Grace Miller',
        startDate: occupiedEntry.localDate,
      },
      nextCheckIn: null,
    },
  },
};

/**
 * The same reservation dates on two properties in different timezones.
 *
 * Both cards carry identical `startDate`/`endDate` values and report opposite occupancy,
 * because each is evaluated against its own `localDate`. Nothing about the viewer is
 * involved — this is the per-unit timezone column doing the work it exists for.
 */
export const SameDatesDifferentTimezones: Story = {
  render: () => (
    <div className="grid gap-4 sm:grid-cols-2">
      <DashboardUnitCard
        entry={{
          ...occupiedEntry,
          rentalUnit: {
            ...occupiedEntry.rentalUnit,
            name: 'Waiheke Vineyard Cabin',
            timezone: 'Pacific/Auckland',
          },
          localDate: '2026-08-28',
          occupancy: 'vacant',
          currentReservation: null,
          nextCheckIn: null,
        }}
      />
      <DashboardUnitCard
        entry={{
          ...occupiedEntry,
          rentalUnit: {
            ...occupiedEntry.rentalUnit,
            name: 'Venice Beach Bungalow',
            timezone: 'America/Los_Angeles',
          },
          localDate: '2026-08-27',
          occupancy: 'occupied',
          currentReservation: {
            ...occupiedEntry.currentReservation!,
            guestName: 'Elena Duarte',
            startDate: '2026-08-27',
            endDate: '2026-08-30',
          },
          nextCheckIn: null,
        }}
      />
    </div>
  ),
};
