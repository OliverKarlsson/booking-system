import type { Meta, StoryObj } from '@storybook/react';

import { Button } from './Button';
import { EmptyState } from './EmptyState';

const meta = {
  title: 'Primitives/EmptyState',
  component: EmptyState,
  parameters: { layout: 'padded' },
  args: { title: 'No reservations yet' },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithDescription: Story = {
  args: { description: 'Bookings for this property will appear here.' },
};

/**
 * First run. The dashboard is the landing page, so this is genuinely the first screen a
 * new user sees — it carries the action rather than leaving them on an empty page to
 * work out where to go.
 */
export const NoUnitsYet: Story = {
  args: {
    title: 'No rental units yet',
    description: 'Add a property to start tracking occupancy and bookings.',
    action: <Button>Add rental unit</Button>,
  },
};

/** Distinct from "nothing exists": filters are set and matched nothing. */
export const NoFilterMatches: Story = {
  args: {
    title: 'No reservations match these filters',
    description: 'Try widening the date range, or clearing the status filter.',
    action: <Button variant="secondary">Clear filters</Button>,
  },
};
