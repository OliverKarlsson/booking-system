import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { Pagination } from './Pagination';

const meta = {
  title: 'Primitives/Pagination',
  component: Pagination,
  parameters: { layout: 'padded' },
  args: { page: 1, totalPages: 7, total: 132, onPageChange: () => {} },
} satisfies Meta<typeof Pagination>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstPage: Story = {};
export const MiddlePage: Story = { args: { page: 4 } };
export const LastPage: Story = { args: { page: 7 } };

/** A single page still reports the count; the controls are simply inert. */
export const SinglePage: Story = { args: { page: 1, totalPages: 1, total: 6 } };

/**
 * Empty is totalPages: 0, not 1 — a list with nothing in it has no pages rather than one
 * blank one, and the API's pagination envelope reports it that way.
 */
export const Empty: Story = { args: { page: 1, totalPages: 0, total: 0 } };

export const Interactive: Story = {
  render: (args) => {
    const [page, setPage] = useState(1);
    return <Pagination {...args} page={page} onPageChange={setPage} />;
  },
};
