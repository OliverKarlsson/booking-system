import { isApiError, isValidationError } from '@/lib/apiClient';

/**
 * Turns a caught error into the sentence shown in an `ErrorBanner`.
 *
 * `ApiError.message` is already the server's human-readable `error` string from the §3.4
 * envelope, so it is used as-is; the branches below only add what the envelope keeps in
 * `details` and the generic fallback for a non-`ApiError` (a rendering bug, never a
 * response).
 *
 * Deliberately a copy of `features/rentalUnits/errorMessage.ts` rather than an import
 * across feature directories — the same call T3.2 made in `features/reservations`, so all
 * three features read alike. It is a Wave 4 dedupe candidate: the right home is `lib/`,
 * which no feature task owns.
 *
 * No `BOOKING_CONFLICT` branch here, unlike the reservations copy: the dashboard only
 * ever reads, so the errors it can surface are a failed fetch, a rate limit, or a server
 * fault.
 */
export function toErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (isValidationError(error) && error.details.length > 0) {
    const issues = error.details.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    return `${error.message} (${issues})`;
  }
  if (isApiError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
