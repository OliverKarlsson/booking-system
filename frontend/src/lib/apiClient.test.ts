import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  apiBaseUrl,
  apiClient,
  buildQueryString,
  isApiError,
  isBookingConflict,
  isValidationError,
} from './apiClient';

function mockFetch(response: Response) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => response);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** `fetch` rejecting, as it does when the request never reaches the server. */
function mockFetchRejecting(error: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit): Promise<Response> => {
    throw error;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('buildQueryString', () => {
  it('omits empty values so a cleared filter disappears from the URL', () => {
    expect(
      buildQueryString({ rentalUnitId: '', from: null, to: undefined, status: 'confirmed' }),
    ).toBe('?status=confirmed');
  });

  it('returns an empty string when nothing survives', () => {
    expect(buildQueryString({ a: null })).toBe('');
    expect(buildQueryString(undefined)).toBe('');
  });

  it('serialises numbers and booleans', () => {
    expect(buildQueryString({ page: 2, limit: 20 })).toBe('?page=2&limit=20');
  });

  it('passes YYYY-MM-DD dates through verbatim', () => {
    expect(buildQueryString({ from: '2026-03-26' })).toBe('?from=2026-03-26');
  });
});

describe('apiClient requests', () => {
  it('prefixes every path with /v1', async () => {
    const fetchMock = mockFetch(jsonResponse({ data: [] }));
    await apiClient.get('/reservations');

    expect(apiBaseUrl).toBe('/v1');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/reservations');
  });

  it('appends query params', async () => {
    const fetchMock = mockFetch(jsonResponse({ data: [] }));
    await apiClient.get('/reservations', { query: { page: 2, rentalUnitId: null } });

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/v1/reservations?page=2');
  });

  it('sends a JSON body on POST', async () => {
    const fetchMock = mockFetch(jsonResponse({ id: 'r1' }, 201));
    await apiClient.post('/reservations', { guestName: 'Jane Doe' });

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"guestName":"Jane Doe"}');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('returns undefined for a 204, the documented DELETE success shape', async () => {
    mockFetch(new Response(null, { status: 204 }));
    await expect(apiClient.delete('/reservations/r1')).resolves.toBeUndefined();
  });
});

describe('error envelope parsing', () => {
  it('throws a typed ApiError carrying code and details', async () => {
    mockFetch(
      jsonResponse(
        {
          error: 'Reservation overlaps an existing booking',
          code: 'BOOKING_CONFLICT',
          details: [
            {
              id: 'res-1',
              guestName: 'Jane Doe',
              startDate: '2026-03-12',
              endDate: '2026-03-15',
            },
          ],
        },
        409,
      ),
    );

    const error = await apiClient.post('/reservations', {}).catch((e: unknown) => e);

    expect(isApiError(error)).toBe(true);
    const apiError = error as ApiError;
    expect(apiError).toBeInstanceOf(ApiError);
    expect(apiError.status).toBe(409);
    expect(apiError.code).toBe('BOOKING_CONFLICT');
    expect(apiError.message).toBe('Reservation overlaps an existing booking');
    expect(apiError.details).toEqual([
      { id: 'res-1', guestName: 'Jane Doe', startDate: '2026-03-12', endDate: '2026-03-15' },
    ]);
  });

  it('narrows a booking conflict so the form can name the guest and dates', async () => {
    mockFetch(
      jsonResponse(
        {
          error: 'Reservation overlaps an existing booking',
          code: 'BOOKING_CONFLICT',
          details: [
            {
              id: 'res-1',
              guestName: 'Jane Doe',
              startDate: '2026-03-12',
              endDate: '2026-03-15',
            },
          ],
        },
        409,
      ),
    );

    const error = await apiClient.post('/reservations', {}).catch((e: unknown) => e);

    expect(isBookingConflict(error)).toBe(true);
    if (!isBookingConflict(error)) throw new Error('unreachable');

    // The dates arrive as strings and stay strings, all the way to the message.
    const [conflict] = error.details;
    expect(conflict.guestName).toBe('Jane Doe');
    expect(conflict.startDate).toBe('2026-03-12');
    expect(conflict.endDate).toBe('2026-03-15');
  });

  it('does not narrow a conflict whose details are missing or malformed', async () => {
    mockFetch(jsonResponse({ error: 'Conflict', code: 'BOOKING_CONFLICT' }, 409));
    const noDetails = await apiClient.post('/reservations', {}).catch((e: unknown) => e);
    expect(isApiError(noDetails)).toBe(true);
    // Falls through to the generic message rather than rendering `undefined`.
    expect(isBookingConflict(noDetails)).toBe(false);

    mockFetch(jsonResponse({ error: 'Conflict', code: 'BOOKING_CONFLICT', details: [{}] }, 409));
    const badDetails = await apiClient.post('/reservations', {}).catch((e: unknown) => e);
    expect(isBookingConflict(badDetails)).toBe(false);
  });

  it('narrows a validation error to its issue list', async () => {
    mockFetch(
      jsonResponse(
        {
          error: 'Invalid request body',
          code: 'VALIDATION_ERROR',
          details: [{ path: 'endDate', message: 'endDate must be after startDate' }],
        },
        400,
      ),
    );

    const error = await apiClient.post('/reservations', {}).catch((e: unknown) => e);

    expect(isValidationError(error)).toBe(true);
    if (!isValidationError(error)) throw new Error('unreachable');
    expect(error.details[0]?.path).toBe('endDate');
  });

  it('reports a 404 with its code', async () => {
    mockFetch(jsonResponse({ error: 'Rental unit not found', code: 'RENTAL_UNIT_NOT_FOUND' }, 404));
    const error = (await apiClient.get('/reservations').catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe('RENTAL_UNIT_NOT_FOUND');
    expect(error.status).toBe(404);
  });

  it('falls back to INTERNAL_ERROR when the response carries no envelope', async () => {
    mockFetch(new Response('<html>502 Bad Gateway</html>', { status: 502 }));
    const error = (await apiClient.get('/reservations').catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.status).toBe(502);
  });

  it('reports an unreachable server as status 0 without inventing an error code', async () => {
    mockFetchRejecting(new TypeError('Failed to fetch'));
    const error = (await apiClient.get('/reservations').catch((e: unknown) => e)) as ApiError;

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.code).toBe('INTERNAL_ERROR');
  });

  it('rethrows an abort untouched, so a cancelled query is not reported as a failure', async () => {
    const abort = new DOMException('The operation was aborted.', 'AbortError');
    mockFetchRejecting(abort);
    const error = await apiClient.get('/reservations').catch((e: unknown) => e);

    // TanStack Query cancels in-flight requests on unmount and when a query key
    // changes; surfacing those as ApiErrors would paint error banners over healthy UI.
    expect(error).toBe(abort);
    expect(isApiError(error)).toBe(false);
  });
});
