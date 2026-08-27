import type { Meta, StoryObj } from '@storybook/react';

import { Input } from './Input';

const meta = {
  title: 'Primitives/Input',
  component: Input,
  args: { label: 'Guest name', placeholder: 'Jane Doe' },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHint: Story = {
  args: { hint: 'The name the booking was made under.' },
};

/**
 * The error is wired to the input through `aria-describedby`, so a screen reader announces
 * it on focus rather than leaving the field merely outlined in red. Worth checking in the
 * Accessibility tab.
 */
export const WithError: Story = {
  args: { error: 'Guest name is required', defaultValue: '' },
};

export const Disabled: Story = { args: { disabled: true, defaultValue: 'Jane Doe' } };

/**
 * Reservation dates use the native date input, which reads and writes `YYYY-MM-DD`
 * verbatim — the same string the API stores and returns. No `Date` is constructed at any
 * point, which is what keeps a stay booked for the 26th showing as the 26th regardless of
 * where the browser is.
 */
export const DateInputs: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-4">
      <Input label="Check-in" type="date" defaultValue="2026-03-12" />
      <Input label="Check-out" type="date" defaultValue="2026-03-15" />
    </div>
  ),
};

/** How the form reads mid-validation, before the request is ever sent. */
export const FormWithErrors: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-4">
      <Input label="Guest name" error="Guest name is required" />
      <Input label="Check-in" type="date" defaultValue="2026-03-15" />
      <Input
        label="Check-out"
        type="date"
        defaultValue="2026-03-12"
        error="Check-out must be after check-in"
      />
    </div>
  ),
};
