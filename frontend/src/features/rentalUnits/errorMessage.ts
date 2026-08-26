import { isApiError, isValidationError } from '@/lib/apiClient';

/**
 * Turns a caught error into the sentence shown in an `ErrorBanner`.
 *
 * `ApiError.message` is already the server's human-readable `error` string from the §3.4
 * envelope, so it is used as-is; the branches below only add what the envelope keeps in
 * `details` and the generic fallback for a non-`ApiError` (a rendering bug, never a
 * response).
 */
export function toErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (isValidationError(error) && error.details.length > 0) {
    // A validation error reaching the banner means a field the form does not surface was
    // rejected; naming the paths is the difference between a fixable message and a dead
    // end.
    const issues = error.details.map((issue) => `${issue.path}: ${issue.message}`).join('; ');
    return `${error.message} (${issues})`;
  }
  if (isApiError(error)) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
