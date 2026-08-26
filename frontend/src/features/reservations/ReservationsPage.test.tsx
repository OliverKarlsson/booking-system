import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Paginated, RentalUnit, Reservation } from '@booking/shared';
import { QueryProvider } from '@/lib/QueryProvider';
import { createQueryClient } from '@/lib/queryClient';
import { useBookingStore } from '@/store';
import { ReservationsPage } from './ReservationsPage';

/**
 * The routed page, wired to a mocked API.
 *
 * These assert the seam the component tests cannot: that the filter controls drive the
 * Zustand slice, that the slice drives the request, and that cancelling asks first. The
 * backend is mocked at `fetch` so the real `apiClient` — and the real query string it
 * builds — is exercised.
 */

const UNIT_ID = '11111111-1111-4111-8111-111111111111';

const unit: RentalUnit = {
  id: UNIT_ID,
  name: 'Seaside flat',
  timezone: 'Europe/Lisbon',
  status: 'active',
  createdAt: '2026-01-05T09:30:00.000Z',
  updatedAt: '2026-01-05T09:30:00.000Z',
};

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

const unitsPage: Paginated<RentalUnit> = {
  data: [unit],
  pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
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

function renderPage() {
  render(
    <QueryProvider client={createQueryClient()}>
      <ReservationsPage />
    </QueryProvider>,
  );
  return userEvent.setup();
}

/** Every `GET /v1/reservations` list URL requested so far, in order. */
function listRequests(): string[] {
  return fetchMock.mock.calls
    .filter(([, init]) => (init?.method ?? 'GET') === 'GET')
    .map(([input]) => String(input))
    .filter((url) => url.startsWith('/v1/reservations?') || url === '/v1/reservations');
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.startsWith('/v1/rental-units')) return jsonResponse(200, unitsPage);
    if (method === 'DELETE') return jsonResponse(204, null);
    // A path segment after the collection means a detail read.
    if (url.startsWith('/v1/reservations/')) return jsonResponse(200, reservation);
    return jsonResponse(200, reservationsPage);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  // The store is a module singleton, so filters set by one case would leak into the next.
  useBookingStore.getState().resetFilters();
  useBookingStore.getState().closeModal();
  vi.unstubAllGlobals();
});

describe('ReservationsPage — filters', () => {
  it('requests the default confirmed list on first render', async () => {
    renderPage();

    await screen.findByText('Jane Doe');
    expect(listRequests()[0]).toBe('/v1/reservations?status=confirmed&page=1&limit=10');
  });

  it('binds the rental unit filter to the store and refetches', async () => {
    const user = renderPage();
    await screen.findByRole('option', { name: 'Seaside flat' });

    await user.selectOptions(screen.getByLabelText(/^Rental unit/), UNIT_ID);

    expect(useBookingStore.getState().filters.rentalUnitId).toBe(UNIT_ID);
    await waitFor(() =>
      expect(listRequests().some((url) => url.includes(`rentalUnitId=${UNIT_ID}`))).toBe(true),
    );
  });

  it('binds the status filter to the store', async () => {
    const user = renderPage();
    await screen.findByText('Jane Doe');

    await user.selectOptions(screen.getByLabelText(/^Status/), 'cancelled');

    expect(useBookingStore.getState().filters.status).toBe('cancelled');
    await waitFor(() =>
      expect(listRequests().some((url) => url.includes('status=cancelled'))).toBe(true),
    );
  });

  it('sends the date window as YYYY-MM-DD, unparsed', async () => {
    renderPage();
    await screen.findByText('Jane Doe');

    fireEvent.change(screen.getByLabelText(/^From/), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText(/^To/), { target: { value: '2026-04-01' } });

    expect(useBookingStore.getState().filters.from).toBe('2026-03-01');
    await waitFor(() =>
      expect(
        listRequests().some(
          (url) => url.includes('from=2026-03-01') && url.includes('to=2026-04-01'),
        ),
      ).toBe(true),
    );
  });

  it('does not request an inverted window it knows would 400', async () => {
    renderPage();
    await screen.findByText('Jane Doe');

    // `from` on its own is an open-ended window and a perfectly valid request, so it is
    // expected to fire. The count is snapshotted after it settles.
    fireEvent.change(screen.getByLabelText(/^From/), { target: { value: '2026-04-01' } });
    await waitFor(() =>
      expect(listRequests().some((url) => url.includes('from=2026-04-01'))).toBe(true),
    );
    const beforeInverted = listRequests().length;

    fireEvent.change(screen.getByLabelText(/^To/), { target: { value: '2026-03-01' } });

    expect(
      await screen.findByText('The end of the window must be after the start.'),
    ).toBeInTheDocument();
    // The last good list is still on screen rather than an error banner.
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    // `reservationQuerySchema` refines `to > from`, so this request could only 400.
    expect(listRequests()).toHaveLength(beforeInverted);
    expect(listRequests().some((url) => url.includes('to=2026-03-01'))).toBe(false);
  });
});

describe('ReservationsPage — cancel', () => {
  it('confirms before cancelling, naming the guest and dates', async () => {
    const user = renderPage();
    await screen.findByText('Jane Doe');

    await user.click(screen.getByRole('button', { name: 'Cancel Jane Doe' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Cancel this reservation?');
    await waitFor(() => expect(dialog).toHaveTextContent('12–15 March 2026'));
    // Nothing has been sent yet — the dialog is the confirmation.
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);
  });

  it('sends the DELETE only after the confirmation is accepted', async () => {
    const user = renderPage();
    await screen.findByText('Jane Doe');

    await user.click(screen.getByRole('button', { name: 'Cancel Jane Doe' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Cancel reservation' }));

    await waitFor(() => {
      const deletes = fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');
      expect(deletes).toHaveLength(1);
      expect(String(deletes[0][0])).toBe(`/v1/reservations/${reservation.id}`);
    });

    await waitFor(() => expect(useBookingStore.getState().activeModal).toBeNull());
  });

  it('backs out without sending anything', async () => {
    const user = renderPage();
    await screen.findByText('Jane Doe');

    await user.click(screen.getByRole('button', { name: 'Cancel Jane Doe' }));
    await screen.findByRole('dialog');
    await user.click(screen.getByRole('button', { name: 'Keep booking' }));

    await waitFor(() => expect(useBookingStore.getState().activeModal).toBeNull());
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE')).toHaveLength(0);
  });
});
