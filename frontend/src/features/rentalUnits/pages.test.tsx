import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Paginated, RentalUnit, Reservation } from '@booking/shared';
import { QueryProvider } from '@/lib/QueryProvider';
import { createQueryClient } from '@/lib/queryClient';
import { useBookingStore } from '@/store';
import { RentalUnitDetailPage } from './RentalUnitDetailPage';
import { RentalUnitsPage } from './RentalUnitsPage';

/**
 * The routed pages, wired to a mocked API.
 *
 * These assert the seam the unit tests above cannot: that the containers ask for the
 * right thing and hand the answer to the right view. The backend is mocked at `fetch`,
 * since the rental-units API is being built in parallel and a live server would make
 * these tests a schedule dependency rather than a check.
 */

const unit: RentalUnit = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Seaside flat',
  timezone: 'Europe/Lisbon',
  address: { street: 'Rua do Mar 4', city: 'Lisbon', postcode: '1100-001', country: 'Portugal' },
  status: 'active',
  createdAt: '2026-01-05T09:30:00.000Z',
  updatedAt: '2026-01-05T09:30:00.000Z',
};

const reservation: Reservation = {
  id: '33333333-3333-4333-8333-333333333333',
  rentalUnitId: unit.id,
  guestName: 'Jane Doe',
  startDate: '2026-03-12',
  endDate: '2026-03-15',
  status: 'confirmed',
  createdAt: '2026-02-01T09:30:00.000Z',
  updatedAt: '2026-02-01T09:30:00.000Z',
};

const unitsPage: Paginated<RentalUnit> = {
  data: [unit],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
};

const reservationsPage: Paginated<Reservation> = {
  data: [reservation],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
};

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = vi.fn<typeof fetch>();

function routeByUrl(input: RequestInfo | URL): Response {
  const url = String(input);
  if (url.startsWith('/v1/reservations')) return jsonResponse(200, reservationsPage);
  if (url.startsWith(`/v1/rental-units/${unit.id}`)) return jsonResponse(200, unit);
  if (url.startsWith('/v1/rental-units')) return jsonResponse(200, unitsPage);
  throw new Error(`Unexpected request: ${url}`);
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => routeByUrl(input));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  useBookingStore.getState().closeModal();
  vi.unstubAllGlobals();
});

function renderPage(element: React.ReactElement, path: string, initialPath: string) {
  render(
    <QueryProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path={path} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryProvider>,
  );
  return userEvent.setup();
}

describe('RentalUnitsPage', () => {
  it('lists the units the API returns', async () => {
    renderPage(<RentalUnitsPage />, '/units', '/units');

    expect(screen.getByRole('heading', { level: 1, name: 'Rental units' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Seaside flat' })).toHaveAttribute(
      'href',
      `/units/${unit.id}`,
    );
    expect(screen.getByText('Europe/Lisbon')).toBeInTheDocument();
  });

  it('opens the create dialog with the timezone select ready', async () => {
    const user = renderPage(<RentalUnitsPage />, '/units', '/units');

    await user.click(screen.getByRole('button', { name: 'New rental unit' }));

    const dialog = await screen.findByRole('dialog', { name: 'New rental unit' });
    expect(within(dialog).getByLabelText(/^Timezone/)).toBeRequired();
  });
});

describe('RentalUnitDetailPage', () => {
  it('shows the unit and its reservations', async () => {
    renderPage(<RentalUnitDetailPage />, '/units/:id', `/units/${unit.id}`);

    expect(screen.getByRole('heading', { level: 1, name: 'Rental unit' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'Seaside flat' })).toBeInTheDocument();
    expect(screen.getByText(unit.id)).toBeInTheDocument();
    expect(screen.getByText('Rua do Mar 4, 1100-001 Lisbon, Portugal')).toBeInTheDocument();

    expect(await screen.findByText('Jane Doe')).toBeInTheDocument();
    // Rendered from the `YYYY-MM-DD` strings themselves — no `Date` is constructed, so
    // this reads the same in every viewer's timezone (§3.7).
    expect(screen.getByText(/12–15 March 2026/)).toBeInTheDocument();
  });

  it('surfaces a failed unit fetch as a retryable error, not an empty page', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith('/v1/reservations')) return jsonResponse(200, reservationsPage);
      return jsonResponse(404, { error: 'Rental unit not found', code: 'NOT_FOUND' });
    });

    renderPage(<RentalUnitDetailPage />, '/units/:id', `/units/${unit.id}`);

    expect(await screen.findByRole('alert')).toHaveTextContent('Rental unit not found');
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
