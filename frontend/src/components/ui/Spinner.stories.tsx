import type { Meta, StoryObj } from '@storybook/react';

import { Spinner } from './Spinner';

const meta = {
  title: 'Primitives/Spinner',
  component: Spinner,
  argTypes: { size: { control: 'select', options: ['sm', 'md', 'lg'] } },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-6">
      <Spinner size="sm" />
      <Spinner size="md" />
      <Spinner size="lg" />
    </div>
  ),
};

/**
 * The label is announced, not drawn. Passing `label={null}` opts out — correct only when
 * the spinner sits inside something that already announces itself, such as a Button in its
 * loading state, where two live regions would say the same thing twice.
 */
export const CustomLabel: Story = { args: { label: 'Loading reservations' } };
