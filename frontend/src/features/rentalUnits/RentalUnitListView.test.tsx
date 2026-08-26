import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { RentalUnit } from '@booking/shared';
import { RentalUnitListView } from './RentalUnitListView';
import type { RentalUnitListViewProps } from './RentalUnitListView';

const units: RentalUnit[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Seaside flat',
    timezone: 'Europe/Lisbon',
    address: { street: 'Rua do Mar 4', city: 'Lisbon', postcode: '1100-001', country: 'Portugal' },
    status: 'active',
    createdAt: '2026-01-05T09:30:00.000Z',
    updatedAt: '2026-01-05T09:30:00.000Z',
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Harbour studio',
    timezone: 'Pacific/Auckland',
    status: 'active',
    createdAt: '2026-01-06T09:30:00.000Z',
    updatedAt: '2026-01-06T09:30:00.000Z',
  },
];

function renderList(overrides: Partial<RentalUnitListViewProps> = {}) {
  const props: RentalUnitListViewProps = {
    units: [],
    isLoading: false,
    isError: false,
    onRetry: vi.fn(),
    onPageChange: vi.fn(),
    onCreate: vi.fn(),
    onEdit: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <RentalUnitListView {...props} />
    </MemoryRouter>,
  );
  return { props, user: userEvent.setup() };
}

describe('RentalUnitListView', () => {
  it('shows a loading indicator on the first fetch', () => {
    renderList({ isLoading: true });

    expect(screen.getByRole('status')).toHaveTextContent('Loading rental units');
    expect(screen.queryByRole('list', { name: 'Rental units' })).not.toBeInTheDocument();
  });

  it('offers the create action from the empty state', async () => {
    const { props, user } = renderList({ units: [] });

    expect(screen.getByText('No rental units yet')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add rental unit' }));
    expect(props.onCreate).toHaveBeenCalledTimes(1);
  });

  it('shows a retryable error instead of an empty list when the request fails', async () => {
    const { props, user } = renderList({
      isError: true,
      errorMessage: 'Could not reach the server. Check your connection and try again.',
    });

    // An error rendered as "no rental units yet" would read as a fact about the data
    // rather than a failure to load it.
    expect(screen.queryByText('No rental units yet')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server');

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders each unit with its address and timezone', () => {
    renderList({ units });

    expect(screen.getByRole('link', { name: 'Seaside flat' })).toHaveAttribute(
      'href',
      '/units/11111111-1111-4111-8111-111111111111',
    );
    expect(screen.getByText('Rua do Mar 4, 1100-001 Lisbon, Portugal')).toBeInTheDocument();
    expect(screen.getByText('Europe/Lisbon')).toBeInTheDocument();
    expect(screen.getByText('No address recorded')).toBeInTheDocument();
    expect(screen.getByText('Pacific/Auckland')).toBeInTheDocument();
  });

  it('asks to edit the unit whose row was clicked', async () => {
    const { props, user } = renderList({ units });

    await user.click(screen.getByRole('button', { name: 'Edit Harbour studio' }));
    expect(props.onEdit).toHaveBeenCalledWith('22222222-2222-4222-8222-222222222222');
  });

  it('pages through the list', async () => {
    const { props, user } = renderList({
      units,
      pagination: { page: 1, limit: 10, total: 24, totalPages: 3 },
    });

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(props.onPageChange).toHaveBeenCalledWith(2);
  });
});
