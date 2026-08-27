import type { Meta, StoryObj } from '@storybook/react';

import { ConflictNotice } from './ConflictNotice';

/**
 * The booking-conflict surface — the human-facing half of the overlap rule.
 *
 * The API goes to real trouble here: rather than a bare 409, it returns the reservations
 * that actually collided, so this component can name the guest and the dates instead of
 * saying "something went wrong". A conflict is not a system error — it is the answer to a
 * question the user asked, and it should read like one.
 *
 * It renders inside the still-open form, never as a toast: the user's next action is to
 * change the dates, and a message that disappears takes the information they need with it.
 */
const meta = {
  title: 'Reservations/ConflictNotice',
  component: ConflictNotice,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ConflictNotice>;

export default meta;
type Story = StoryObj<typeof meta>;

const janeDoe = {
  id: '8f14e45f-ceea-4d0a-9c1b-2f2a1c8d3b71',
  guestName: 'Jane Doe',
  startDate: '2026-03-12',
  endDate: '2026-03-15',
};

/** The ordinary case: one existing stay is in the way. */
export const SingleConflict: Story = {
  args: { conflicts: [janeDoe] },
};

/**
 * A long requested range can span several existing stays, so `details` is a list rather
 * than a single reservation. Every blocker is shown — telling the user about one at a time
 * would make them retry, fail, and retry again.
 */
export const MultipleConflicts: Story = {
  args: {
    conflicts: [
      janeDoe,
      {
        id: '3c6e0b8a-9c15-4f2b-8d1e-7a5b2c9d4e6f',
        guestName: 'Johan Ek',
        startDate: '2026-03-18',
        endDate: '2026-03-22',
      },
      {
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        guestName: 'Marta Silva',
        startDate: '2026-03-24',
        endDate: '2026-03-27',
      },
    ],
  },
};

/** A single-night stay blocking a single night — the tightest conflict there is. */
export const SingleNightConflict: Story = {
  args: {
    conflicts: [
      {
        id: '5d41402a-bc4b-4a76-b971-9d911017c592',
        guestName: 'Aisha Rahman',
        startDate: '2026-04-02',
        endDate: '2026-04-03',
      },
    ],
  },
};

/**
 * Nothing to show.
 *
 * `isBookingConflict` validates the 409 payload at runtime, so a malformed or empty
 * `details` array falls through to the envelope's generic message rather than rendering
 * "undefined (undefined)". This story documents that this component stays silent in that
 * case instead of drawing an empty box — see Primitives/ErrorBanner for what the user
 * actually sees instead.
 */
export const NoConflicts: Story = {
  args: { conflicts: [] },
};
