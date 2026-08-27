import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { Button } from './Button';
import { Input } from './Input';
import { Modal } from './Modal';

const meta = {
  title: 'Primitives/Modal',
  component: Modal,
  parameters: { layout: 'fullscreen' },
  args: { open: true, title: 'New reservation', onClose: () => {}, children: null },
  argTypes: { size: { control: 'select', options: ['sm', 'md', 'lg'] } },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The modal traps focus, closes on Escape, and restores focus to whatever opened it. Those
 * are easiest to check here — in the app the dialog only appears after a click, so testing
 * keyboard behaviour means driving the page to get to it first.
 */
export const Default: Story = {
  args: { children: <p className="text-sm text-ink-600">Dialog body.</p> },
};

export const WithFooterActions: Story = {
  args: {
    description: 'Booking for Gamla Stan Studio.',
    children: (
      <div className="flex flex-col gap-4">
        <Input label="Guest name" defaultValue="Jane Doe" />
        <Input label="Check-in" type="date" defaultValue="2026-03-12" />
        <Input label="Check-out" type="date" defaultValue="2026-03-15" />
      </div>
    ),
    footer: (
      <>
        <Button variant="ghost">Cancel</Button>
        <Button>Create reservation</Button>
      </>
    ),
  },
};

/** Destructive confirmation — cancelling a stay is not undoable from the UI. */
export const DestructiveConfirm: Story = {
  args: {
    size: 'sm',
    title: 'Cancel this reservation?',
    description: 'Jane Doe, 12\u201315 March 2026. The dates become bookable again.',
    children: null,
    footer: (
      <>
        <Button variant="ghost">Keep it</Button>
        <Button variant="danger">Cancel reservation</Button>
      </>
    ),
  },
};

/** Open it yourself to feel the focus trap and Escape handling. */
export const Interactive: Story = {
  render: (args) => {
    const [open, setOpen] = useState(false);
    return (
      <div className="p-8">
        <Button onClick={() => setOpen(true)}>Open dialog</Button>
        <Modal {...args} open={open} onClose={() => setOpen(false)}>
          <p className="text-sm text-ink-600">Press Escape, or Tab through the controls.</p>
        </Modal>
      </div>
    );
  },
};
