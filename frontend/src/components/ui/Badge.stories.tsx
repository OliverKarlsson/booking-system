import type { Meta, StoryObj } from '@storybook/react';

import { Badge } from './Badge';

const meta = {
  title: 'Primitives/Badge',
  component: Badge,
  args: { children: 'Occupied' },
  argTypes: {
    tone: { control: 'select', options: ['neutral', 'success', 'danger', 'warning', 'accent'] },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = { args: { tone: 'neutral' } };
export const Success: Story = { args: { tone: 'success' } };
export const Danger: Story = { args: { tone: 'danger' } };
export const Warning: Story = { args: { tone: 'warning' } };
export const Accent: Story = { args: { tone: 'accent' } };

/**
 * The two tones the dashboard actually uses.
 *
 * Note that occupancy is deliberately *not* colour-coded as good/bad — an occupied flat is
 * a booked flat, which is the desirable state for the person using this. `success` marks
 * occupied for that reason, and vacant is neutral rather than a warning.
 */
export const OccupancyTones: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Badge tone="success">Occupied</Badge>
      <Badge tone="neutral">Vacant</Badge>
      <Badge tone="danger">Cancelled</Badge>
    </div>
  ),
};
