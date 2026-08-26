import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RentalUnit } from '@booking/shared';
import { QueryProvider } from '@/lib/QueryProvider';
import { createQueryClient } from '@/lib/queryClient';
import { useBookingStore } from '@/store';
import { RentalUnitFormModal } from './RentalUnitFormModal';

/**
 * The container's job is turning a completed form into the *right request*. The API is
 * mocked at `fetch` rather than at `apiClient`, so the real client — URL prefixing, JSON
 * body, error envelope — is exercised on the way through.
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

function renderModal() {
  render(
    <QueryProvider client={createQueryClient()}>
      <RentalUnitFormModal />
    </QueryProvider>,
  );
  return userEvent.setup();
}

function requests(method: string) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === method);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  useBookingStore.getState().closeModal();
  vi.unstubAllGlobals();
});

describe('RentalUnitFormModal — create', () => {
  beforeEach(() => {
    useBookingStore.getState().openModal('createRentalUnit');
  });

  it('posts the new unit and closes', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { ...unit, name: 'Loft' }));
    const user = renderModal();

    await user.type(screen.getByLabelText(/^Name/), 'Loft');
    await user.selectOptions(screen.getByLabelText(/^Timezone/), 'Europe/Stockholm');
    await user.click(screen.getByRole('button', { name: 'Create rental unit' }));

    await waitFor(() => expect(requests('POST')).toHaveLength(1));

    const [url, init] = requests('POST')[0];
    expect(url).toBe('/v1/rental-units');
    // The blank address is omitted rather than sent as four empty strings.
    expect(JSON.parse(String(init?.body))).toEqual({ name: 'Loft', timezone: 'Europe/Stockholm' });

    await waitFor(() => expect(useBookingStore.getState().activeModal).toBeNull());
  });

  it('keeps the dialog open and surfaces the server message when the write fails', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { error: 'Name is required', code: 'VALIDATION_ERROR' }),
    );
    const user = renderModal();

    await user.type(screen.getByLabelText(/^Name/), 'Loft');
    await user.selectOptions(screen.getByLabelText(/^Timezone/), 'Europe/Stockholm');
    await user.click(screen.getByRole('button', { name: 'Create rental unit' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(useBookingStore.getState().activeModal).toBe('createRentalUnit');
  });
});

describe('RentalUnitFormModal — edit', () => {
  beforeEach(() => {
    useBookingStore.getState().openModal('editRentalUnit', unit.id);
  });

  it('sends no request at all when nothing was changed', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, unit));
    const user = renderModal();

    await screen.findByDisplayValue('Seaside flat');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    // `PATCH {}` is a deliberate 400, so an untouched form must produce no request.
    await waitFor(() => expect(useBookingStore.getState().activeModal).toBeNull());
    expect(requests('PATCH')).toHaveLength(0);
  });

  it('patches only the fields that changed, timezone included', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, unit));
    const user = renderModal();

    await screen.findByDisplayValue('Seaside flat');
    await user.selectOptions(screen.getByLabelText(/^Timezone/), 'Pacific/Auckland');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(requests('PATCH')).toHaveLength(1));

    const [url, init] = requests('PATCH')[0];
    expect(url).toBe(`/v1/rental-units/${unit.id}`);
    expect(JSON.parse(String(init?.body))).toEqual({ timezone: 'Pacific/Auckland' });
  });
});
