import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardResponse } from '@booking/shared';
import { QueryProvider } from '@/lib/QueryProvider';
import { createQueryClient } from '@/lib/queryClient';
import { DashboardPage } from './DashboardPage';
import { occupiedEntry, unbookedEntry, vacantWithArrivalEntry } from './dashboardFixtures';

/**
 * The landing page, wired to a mocked API.
 *
 * This asserts the seam the view tests cannot: that the container asks for the right
 * thing — including, crucially, that it asks for it *without a date* — and hands the
 * answer to the view. `fetch` is mocked rather than a live server used, so the test is a
 * check rather than a schedule dependency on the backend running.
 */

const response: DashboardResponse = {
  data: [occupiedEntry, vacantWithArrivalEntry, unbookedEntry],
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

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => jsonResponse(200, response));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage() {
  render(
    <QueryProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/units" element={<h1>Rental units</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryProvider>,
  );
}

describe('DashboardPage', () => {
  it('renders occupancy for every unit the API returns', async () => {
    renderPage();

    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();

    expect(await screen.findByRole('link', { name: 'Seaside flat' })).toBeInTheDocument();
    expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    expect(screen.getByText(/Checking out 15 Mar 2026/)).toBeInTheDocument();
    expect(screen.getByText('Mia Larsson')).toBeInTheDocument();
    expect(screen.getByText('No upcoming reservation')).toBeInTheDocument();
  });

  it('sends no date — the server resolves today per unit, in that unit’s timezone', async () => {
    renderPage();
    await screen.findByRole('link', { name: 'Seaside flat' });

    // The heart of §3.7 as a test: a `?date=` or `?now=` here would mean the viewer's
    // clock had crept into the answer, which is exactly the bug this endpoint's shape
    // exists to make unrepresentable.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('/v1/dashboard');
  });

  it('surfaces a failed load as a retryable error, not an empty portfolio', async () => {
    // A 4xx rather than a 500 on purpose: the query client retries 5xx twice with a
    // backoff (see `lib/queryClient`), so a 500 would spend the test's timeout waiting
    // for a retry rather than asserting the error state.
    fetchMock.mockImplementation(async () =>
      jsonResponse(429, { error: 'Too many requests. Try again shortly.', code: 'RATE_LIMITED' }),
    );

    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    expect(screen.queryByText('No rental units yet')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('offers a route to add the first unit when the portfolio is empty', async () => {
    fetchMock.mockImplementation(async () => jsonResponse(200, { data: [] }));

    renderPage();

    expect(await screen.findByText('No rental units yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add rental unit' })).toBeInTheDocument();
  });
});
