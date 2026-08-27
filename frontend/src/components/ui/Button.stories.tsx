import type { Meta, StoryObj } from '@storybook/react';

import { Button } from './Button';

const meta = {
  title: 'Primitives/Button',
  component: Button,
  args: { children: 'Save reservation' },
  argTypes: {
    variant: { control: 'select', options: ['primary', 'secondary', 'ghost', 'danger'] },
    size: { control: 'select', options: ['sm', 'md'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = { args: { variant: 'primary' } };
export const Secondary: Story = { args: { variant: 'secondary' } };
export const Ghost: Story = { args: { variant: 'ghost' } };

/** `danger` is reserved for destructive actions — cancelling a stay, deleting a unit. */
export const Danger: Story = { args: { variant: 'danger', children: 'Cancel reservation' } };

/**
 * `loading` disables the button as well as showing the spinner. That pairing is the point:
 * a submit button that spins but still accepts clicks is how a double booking attempt gets
 * sent twice, and the second one comes back as a 409 against the reservation the first one
 * just created.
 */
export const Loading: Story = { args: { loading: true } };

export const Disabled: Story = { args: { disabled: true } };

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-3">
      <Button {...args} size="sm">
        Small
      </Button>
      <Button {...args} size="md">
        Medium
      </Button>
    </div>
  ),
};

/** Every variant at a glance — the sheet to scan when adding a new one. */
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="primary" loading>
        Loading
      </Button>
      <Button variant="primary" disabled>
        Disabled
      </Button>
    </div>
  ),
};
