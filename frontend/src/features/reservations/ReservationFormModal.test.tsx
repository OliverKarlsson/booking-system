import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Paginated, RentalUnit, Reservation } from '@booking/shared';
import { QueryProvider } from '@/lib/QueryProvider';
import { createQueryClient } from '@/lib/queryClient';
import { useBookingStore } from '@/store';
import { ReservationFormModal } from './ReservationFormModal';

/**
 * The container's job is turning a completed form into the right request — and turning
 * the answer, especially a 409, into something the user can act on.
 *
 * The API is mocked at `fetch` rather than at `apiClient`, so the real client is
 * exercised on the way through: URL prefixing, the JSON body, and — the part that matters
 * here — parsing the §3.4 error envelope into an `ApiError` whose `details` survive as far
 * as the form.
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

const unitsPage: Paginated<RentalUnit> = {
  data: [unit],
  pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
};

const existing: Reservation = {
  id: '33333333-3333-4333-8333-333333333333',
  rentalUnitId: UNIT_ID,
  guestName: 'Jane Doe',
  startDate: '2026-03-12',
  endDate: '2026-03-15',
  status: 'confirmed',
  createdAt: '2026-02-01T09:30:00.000Z',
  updatedAt: '2026-02-01T09:30:00.000Z',
};

/** The §3.4 `BOOKING_CONFLICT` payload, exactly as the reservations service builds it. */
const CONFLICT_ENVELOPE = {
  error: 'Reservation overlaps an existing booking',
  code: 'BOOKING_CONFLICT',
  details: [
    {
      id: existing.id,
      guestName: 'Jane Doe',
      startDate: '2026-03-12',
      endDate: '2026-03-15',
    },
  ],
};

/** A minimal stand-in for `Response`: only what `apiClient` actually touches. */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = vi.fn<typeof fetch>();

/** Routes by method and path prefix, so each test only states the response it cares about. */
function respondWith(write: Response) {
  fetchMock.mockImplementation(async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';

    if (url.startsWith('/v1/rental-units')) return jsonResponse(200, unitsPage);
    if (method === 'GET' && url.startsWith('/v1/reservations/')) return jsonResponse(200, existing);
    return write;
  });
}

function renderModal() {
  render(
    <QueryProvider client={createQueryClient()}>
      <ReservationFormModal />
    </QueryProvider>,
  );
  return userEvent.setup();
}

function requests(method: string) {
  return fetchMock.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method);
}

/** See ReservationForm.test.tsx: jsdom has no segmented date editor, so set the value. */
function setDate(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

async function fillNewBooking(user: ReturnType<typeof userEvent.setup>) {
  // Wait for the unit list to arrive before picking from it.
  await screen.findByRole('option', { name: 'Seaside flat' });
  await user.selectOptions(screen.getByLabelText(/^Rental unit/), UNIT_ID);
  await user.type(screen.getByLabelText(/^Guest name/), 'Sam Patel');
  setDate(/^Check-in/, '2026-03-13');
  setDate(/^Check-out/, '2026-03-16');
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  useBookingStore.getState().closeModal();
  vi.unstubAllGlobals();
});

describe('ReservationFormModal — the conflict path', () => {
  beforeEach(() => {
    useBookingStore.getState().openModal('createReservation');
  });

  it('names the conflicting guest and dates on the form when the API answers 409', async () => {
    respondWith(jsonResponse(409, CONFLICT_ENVELOPE));
    const user = renderModal();

    await fillNewBooking(user);
    await user.click(screen.getByRole('button', { name: 'Create reservation' }));

    // THE assertion this whole feature exists for. The backend runs a deliberately racy
    // overlap SELECT purely to populate `details`; answering that with "something went
    // wrong" would discard the only information that makes the error fixable.
    expect(
      await screen.findByText('Conflicts with Jane Doe (12–15 March 2026)'),
    ).toBeInTheDocument();
  });

  it('keeps the conflict on screen in the still-open dialog, not in a toast', async () => {
    respondWith(jsonResponse(409, CONFLICT_ENVELOPE));
    const user = renderModal();

    await fillNewBooking(user);
    await user.click(screen.getByRole('button', { name: 'Create reservation' }));

    await screen.findByText('Conflicts with Jane Doe (12–15 March 2026)');

    // The dialog stays open with the values still in it, so the user can change the dates
    // while reading who is in the way.
    expect(useBookingStore.getState().activeModal).toBe('createReservation');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Guest name/)).toHaveValue('Sam Patel');
    expect(screen.getByRole('alert')).toHaveTextContent('These dates are already booked');
  });

  it('prefers the specific conflict over the envelope\'s generic sentence', async () => {
    respondWith(jsonResponse(409, CONFLICT_ENVELOPE));
    const user = renderModal();

    await fillNewBooking(user);
    await user.click(screen.getByRole('button', { name: 'Create reservation' }));

    await screen.findByText('Conflicts with Jane Doe (12–15 March 2026)');
    expect(
      screen.queryByText('Reservation overlaps an existing booking'),
    ).not.toBeInTheDocument();
  });

  it('falls back to the generic message when a 409 arrives without usable details', async () => {
    // `isBookingConflict` validates `details` at runtime rather than casting it, so a
    // malformed payload degrades to the server's sentence instead of rendering
    // "Conflicts with undefined (undefined)".
    respondWith(
      jsonResponse(409, { ...CONFLICT_ENVELOPE, details: [{ guestName: 'Jane Doe' }] }),
    );
    const user = renderModal();

    await fillNewBooking(user);
    await user.click(screen.getByRole('button', { name: 'Create reservation' }));

    expect(
      await screen.findByText('Reservation overlaps an existing booking'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Conflicts with/)).not.toBeInTheDocument();
  });

  it('does not retry the booking that was just rejected', async () => {
    respondWith(jsonResponse(409, CONFLICT_ENVELOPE));
    const user = renderModal();

    await fillNewBooking(user);
    await user.click(screen.getByRole('button', { name: 'Create reservation' }));

    await screen.findByText('Conflicts with Jane Doe (12–15 March 2026)');
    // A retried POST would either conflict again or, if the first one had actually
    // succeeded, double-book against itself.
    expect(requests('POST')).toHaveLength(1);
  });
});

describe('ReservationFormModal — create', () => {
  beforeEach(() => {
    useBookingStore.getState().openModal('createReservation');
  });

  it('posts the booking and closes on success', async () => {
    respondWith(jsonResponse(201, { ...existing, guestName: 'Sam Patel' }));
    const user = renderModal();

    await fillNewBooking(user);
    await user.click(screen.getByRole('button', { name: 'Create reservation' }));

    await waitFor(() => expect(requests('POST')).toHaveLength(1));

    const [url, init] = requests('POST')[0];
    expect(url).toBe('/v1/reservations');
    expect(JSON.parse(String(init?.body))).toEqual({
      rentalUnitId: UNIT_ID,
      guestName: 'Sam Patel',
      // The dates go out exactly as typed — no Date was constructed anywhere in the path.
      startDate: '2026-03-13',
      endDate: '2026-03-16',
    });

    await waitFor(() => expect(useBookingStore.getState().activeModal).toBeNull());
  });

  it('sends nothing when the client-side date check fails', async () => {
    respondWith(jsonResponse(201, existing));
    const user = renderModal();

    await screen.findByRole('option', { name: 'Seaside flat' });
    await user.selectOptions(screen.getByLabelText(/^Rental unit/), UNIT_ID);
    await user.type(screen.getByLabelText(/^Guest name/), 'Sam Patel');
    setDate(/^Check-in/, '2026-03-16');
    setDate(/^Check-out/, '2026-03-13');

    await user.click(screen.getByRole('button', { name: 'Create reservation' }));

    expect(await screen.findByText('End date must be after start date')).toBeInTheDocument();
    expect(requests('POST')).toHaveLength(0);
  });
});

describe('ReservationFormModal — edit', () => {
  beforeEach(() => {
    useBookingStore.getState().openModal('editReservation', existing.id);
  });

  it('sends no request at all when nothing was changed', async () => {
    respondWith(jsonResponse(200, existing));
    const user = renderModal();

    await screen.findByDisplayValue('Jane Doe');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    // `PATCH {}` is a deliberate 400, so an untouched form must produce no request.
    await waitFor(() => expect(useBookingStore.getState().activeModal).toBeNull());
    expect(requests('PATCH')).toHaveLength(0);
  });

  it('patches only the dates that changed, never the rental unit', async () => {
    respondWith(jsonResponse(200, existing));
    const user = renderModal();

    await screen.findByDisplayValue('Jane Doe');
    setDate(/^Check-out/, '2026-03-18');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(requests('PATCH')).toHaveLength(1));

    const [url, init] = requests('PATCH')[0];
    expect(url).toBe(`/v1/reservations/${existing.id}`);
    expect(JSON.parse(String(init?.body))).toEqual({ endDate: '2026-03-18' });
  });

  it('shows the conflict on the edit form when the move lands on an occupied slot', async () => {
    respondWith(jsonResponse(409, CONFLICT_ENVELOPE));
    const user = renderModal();

    await screen.findByDisplayValue('Jane Doe');
    setDate(/^Check-out/, '2026-03-18');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    // A conflicting PATCH must be indistinguishable from a conflicting POST to the user.
    expect(
      await screen.findByText('Conflicts with Jane Doe (12–15 March 2026)'),
    ).toBeInTheDocument();
    expect(useBookingStore.getState().activeModal).toBe('editReservation');
  });
});
