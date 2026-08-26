import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Reservation } from '@booking/shared';
import { ReservationListView } from './ReservationListView';

const UNIT_ID = '11111111-1111-4111-8111-111111111111';

const reservation: Reservation = {
  id: '33333333-3333-4333-8333-333333333333',
  rentalUnitId: UNIT_ID,
  guestName: 'Jane Doe',
  startDate: '2026-03-12',
  endDate: '2026-03-15',
  status: 'confirmed',
  createdAt: '2026-02-01T09:30:00.000Z',
  updatedAt: '2026-02-01T09:30:00.000Z',
};

function renderList(overrides: Partial<Parameters<typeof ReservationListView>[0]> = {}) {
  const handlers = {
    onRetry: vi.fn(),
    onPageChange: vi.fn(),
    onCreate: vi.fn(),
    onEdit: vi.fn(),
    onCancel: vi.fn(),
  };
  render(
    <ReservationListView
      reservations={[reservation]}
      unitNames={{ [UNIT_ID]: 'Seaside flat' }}
      isLoading={false}
      isError={false}
      isFiltered={false}
      {...handlers}
      {...overrides}
    />,
  );
  return { ...handlers, user: userEvent.setup() };
}

describe('ReservationListView', () => {
  it('renders a stay with its guest, dates, nights and unit', () => {
    renderList();

    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    // Formatted from the YYYY-MM-DD strings, with no Date constructed (§3.7).
    expect(screen.getByText(/12–15 March 2026/)).toBeInTheDocument();
    expect(screen.getByText(/3 nights/)).toBeInTheDocument();
    expect(screen.getByText('Seaside flat')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });

  it('offers Cancel only for a confirmed stay', async () => {
    const { onCancel, user } = renderList();
    await user.click(screen.getByRole('button', { name: 'Cancel Jane Doe' }));
    expect(onCancel).toHaveBeenCalledWith(reservation.id);

    renderList({ reservations: [{ ...reservation, status: 'cancelled' }] });
    // A cancelled booking can still be renamed, but cancelling it again is a no-op the
    // user would read as having done something.
    expect(screen.getAllByRole('button', { name: 'Edit Jane Doe' })).not.toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'Cancel Jane Doe' })).toHaveLength(1);
  });

  it('distinguishes an empty list from an empty filter result', () => {
    const { onCreate } = renderList({ reservations: [] });
    expect(screen.getByText('No reservations yet')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();

    renderList({ reservations: [], isFiltered: true });
    expect(screen.getByText('No reservations match these filters')).toBeInTheDocument();
  });

  it('shows a loading state', () => {
    renderList({ reservations: [], isLoading: true });
    expect(screen.getByText('Loading reservations')).toBeInTheDocument();
  });

  it('shows a failure with a retry', async () => {
    const { onRetry, user } = renderList({
      reservations: [],
      isError: true,
      errorMessage: 'Could not reach the server. Check your connection and try again.',
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server');
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('names a unit it does not have rather than rendering a blank line', () => {
    renderList({ unitNames: {} });
    expect(screen.getByText('Unknown rental unit')).toBeInTheDocument();
  });

  it('pages through the results', async () => {
    const { onPageChange, user } = renderList({
      pagination: { page: 1, limit: 10, total: 25, totalPages: 3 },
    });

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
