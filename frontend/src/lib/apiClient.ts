import type {
  ErrorCode,
  ErrorResponse,
  ReservationSummary,
  ValidationIssue,
} from '@booking/shared';

/**
 * The single place in the frontend where a network call happens.
 *
 * Everything above this file (TanStack Query hooks, forms, views) deals in typed
 * values and `ApiError`, never in `Response` objects or status codes. That keeps
 * error handling uniform: one envelope parser instead of every feature re-deciding
 * what a failed request looks like.
 */

/** Origin of the API. Empty in dev and in Docker, where the API shares our origin. */
const API_ORIGIN = import.meta.env.VITE_API_URL ?? '';

/** Every endpoint lives under the `/v1` URI prefix (contract §3.6). */
const API_PREFIX = '/v1';

export const apiBaseUrl = `${API_ORIGIN}${API_PREFIX}`;

/**
 * `details` payload of a `BOOKING_CONFLICT` (contract §3.4) — enough of a reservation
 * to name the conflicting guest and dates on the form.
 *
 * Aliased from the shared contract rather than restated, so the shape the client reads
 * is by construction the shape the server's `bookingConflictDetailsSchema` produces.
 * Dates are `YYYY-MM-DD` strings and are never parsed into `Date` (§3.7).
 */
export type ConflictingReservation = ReservationSummary;

export type { ValidationIssue };

/** The §3.4 error envelope, as validated by the shared `errorResponseSchema`. */
export type ErrorEnvelope = ErrorResponse;

/**
 * A non-2xx response, parsed. Callers branch on `code` — the stable machine string —
 * rather than on `status`, so adding an HTTP status never breaks a consumer.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(message: string, status: number, code: ErrorCode, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    // Required for `instanceof` to survive TypeScript's ES5-class downlevelling.
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

function looksLikeConflictingReservation(value: unknown): value is ConflictingReservation {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.guestName === 'string' &&
    typeof candidate.startDate === 'string' &&
    typeof candidate.endDate === 'string'
  );
}

/**
 * Narrows a caught error to a booking conflict *with usable details*.
 *
 * The details are validated at runtime, not merely cast: they arrive over the network,
 * and the reservation form's whole conflict message depends on them being present. A
 * conflict whose details are missing or malformed falls through to the generic message
 * rather than rendering `undefined`.
 */
export function isBookingConflict(
  error: unknown,
): error is ApiError & { details: ConflictingReservation[] } {
  return (
    isApiError(error) &&
    error.code === 'BOOKING_CONFLICT' &&
    Array.isArray(error.details) &&
    error.details.length > 0 &&
    error.details.every(looksLikeConflictingReservation)
  );
}

function looksLikeValidationIssue(value: unknown): value is ValidationIssue {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.path === 'string' && typeof candidate.message === 'string';
}

export function isValidationError(
  error: unknown,
): error is ApiError & { details: ValidationIssue[] } {
  return (
    isApiError(error) &&
    error.code === 'VALIDATION_ERROR' &&
    Array.isArray(error.details) &&
    error.details.every(looksLikeValidationIssue)
  );
}

export type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

/**
 * Omits empty values so a cleared filter disappears from the URL instead of being sent
 * as `?rentalUnitId=`, which the backend would reject as a malformed uuid.
 */
export function buildQueryString(params?: QueryParams): string {
  if (!params) return '';
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const encoded = search.toString();
  return encoded ? `?${encoded}` : '';
}

export interface RequestOptions {
  query?: QueryParams;
  signal?: AbortSignal;
}

interface InternalRequestOptions extends RequestOptions {
  method: string;
  body?: unknown;
}

async function readEnvelope(response: Response): Promise<Partial<ErrorEnvelope>> {
  try {
    const parsed: unknown = await response.json();
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed as Partial<ErrorEnvelope>;
    }
  } catch {
    // Non-JSON body (a proxy's HTML 502, an empty 500). Handled by the caller.
  }
  return {};
}

async function request<T>(path: string, options: InternalRequestOptions): Promise<T> {
  const { method, body, query, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}${path}${buildQueryString(query)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal,
    });
  } catch (cause) {
    // An abort is the caller's own doing (TanStack Query cancelling a stale request),
    // so it is rethrown untouched instead of being reported as a server failure.
    // Matched on `name` rather than `instanceof DOMException`, which is not uniform
    // across runtimes and polyfills.
    if (typeof cause === 'object' && cause !== null && (cause as Error).name === 'AbortError') {
      throw cause;
    }
    // The request never reached the API, so there is no envelope to read. `status: 0`
    // distinguishes this from a real 500 without inventing an error code outside §3.4.
    throw new ApiError(
      'Could not reach the server. Check your connection and try again.',
      0,
      'INTERNAL_ERROR',
      undefined,
    );
  }

  if (!response.ok) {
    const envelope = await readEnvelope(response);
    throw new ApiError(
      typeof envelope.error === 'string' && envelope.error.length > 0
        ? envelope.error
        : `Request failed with status ${response.status}`,
      response.status,
      // A response without a parseable envelope (gateway error, crash before the
      // error middleware ran) is still an unexpected server failure.
      typeof envelope.code === 'string' ? (envelope.code as ErrorCode) : 'INTERNAL_ERROR',
      envelope.details,
    );
  }

  // 204 No Content is the documented success shape for DELETE (§3.6).
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const apiClient = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),

  delete: <T = void>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};
