import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { DashboardListView } from './DashboardListView';
import type { DashboardListViewProps } from './DashboardListView';
import { occupiedEntry, unbookedEntry, vacantWithArrivalEntry } from './dashboardFixtures';

function renderDashboard(overrides: Partial<DashboardListViewProps> = {}) {
  const props: DashboardListViewProps = {
    entries: [],
    isLoading: false,
    isError: false,
    onRetry: vi.fn(),
    onAddRentalUnit: vi.fn(),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <DashboardListView {...props} />
    </MemoryRouter>,
  );
  return { props, user: userEvent.setup() };
}

describe('DashboardListView', () => {
  it('shows a loading indicator on the first fetch', () => {
    renderDashboard({ isLoading: true });

    expect(screen.getByRole('status')).toHaveTextContent('Loading dashboard');
    expect(screen.queryByRole('list', { name: 'Rental unit occupancy' })).not.toBeInTheDocument();
  });

  it('shows a retryable error instead of an empty dashboard when the request fails', async () => {
    const { props, user } = renderDashboard({
      isError: true,
      errorMessage: 'Could not reach the server. Check your connection and try again.',
    });

    // Rendering a failed load as "no rental units yet" would state a fact about the
    // portfolio that nobody established.
    expect(screen.queryByText('No rental units yet')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not reach the server');

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it('offers the first-unit action when no units exist at all', async () => {
    const { props, user } = renderDashboard({ entries: [] });

    expect(screen.getByText('No rental units yet')).toBeInTheDocument();
    // Not the same as every unit being vacant: there is nothing to summarise, so the
    // counts are not rendered either.
    expect(screen.queryByLabelText('Portfolio summary')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add rental unit' }));
    expect(props.onAddRentalUnit).toHaveBeenCalledTimes(1);
  });

  it('renders one card per unit, in the order the API returned them', () => {
    renderDashboard({ entries: [occupiedEntry, vacantWithArrivalEntry, unbookedEntry] });

    const cards = within(screen.getByRole('list', { name: 'Rental unit occupancy' })).getAllByRole(
      'listitem',
    );
    expect(cards).toHaveLength(3);
    // The API sorts by name (§3.6); re-sorting here would be a second, drifting ordering.
    expect(cards.map((card) => within(card).getByRole('link').textContent)).toEqual([
      'Seaside flat',
      'Harbour studio',
      'Mountain cabin',
    ]);
  });

  it('summarises the portfolio above the cards', () => {
    renderDashboard({ entries: [occupiedEntry, vacantWithArrivalEntry, unbookedEntry] });

    const summary = screen.getByLabelText('Portfolio summary');
    // Each tile is a `<dt>` term with its count as the `<dd>` next to it, so the count is
    // asserted through that pairing rather than by finding a loose number on the page.
    const count = (label: string) => within(summary).getByText(label).nextElementSibling;

    expect(count('Rental units')).toHaveTextContent('3');
    expect(count('Occupied')).toHaveTextContent('1');
    expect(count('Vacant')).toHaveTextContent('2');
    expect(count('Upcoming arrivals')).toHaveTextContent('2');
  });

  it('shows every occupancy state on one screen without any of them reading as an error', () => {
    renderDashboard({ entries: [occupiedEntry, vacantWithArrivalEntry, unbookedEntry] });

    // Scoped to the cards: "Occupied" and "Vacant" are also tile labels in the summary
    // above, and counting those would make this assertion agree with itself.
    const cards = within(screen.getByRole('list', { name: 'Rental unit occupancy' }));
    expect(cards.getAllByText('Occupied')).toHaveLength(1);
    expect(cards.getAllByText('Vacant')).toHaveLength(2);
    expect(screen.getByText('No upcoming reservation')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
