import type { Meta, StoryObj } from '@storybook/react';

import { ErrorBanner } from './ErrorBanner';

const meta = {
  title: 'Primitives/ErrorBanner',
  component: ErrorBanner,
  args: { message: 'Could not load rental units.' },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof ErrorBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithRetry: Story = {
  args: { onRetry: () => {}, message: 'Could not reach the server.' },
};

/**
 * The generic fallback, and the case worth contrasting with ConflictNotice.
 *
 * This is what the user sees when the API returns a 409 whose `details` are missing or
 * malformed. It is deliberately the *worst* outcome of a booking conflict rather than the
 * normal one — see Reservations/ConflictNotice for what the same failure looks like when
 * the payload arrives intact.
 */
export const UnusableConflictPayload: Story = {
  args: { title: 'Could not save', message: 'Reservation overlaps an existing booking' },
};

export const ValidationSummary: Story = {
  args: {
    title: 'Check the form',
    message: 'Check-out must be after check-in.',
  },
};
