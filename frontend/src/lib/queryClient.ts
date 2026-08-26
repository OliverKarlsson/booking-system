import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './apiClient';

export { queryKeys, invalidatedByReservationWrite, invalidatedByRentalUnitWrite } from './queryKeys';
export type { QueryFilters } from './queryKeys';

/**
 * Retrying a 4xx is pointless — the request is malformed, the resource is gone, or the
 * slot is taken, and none of those change by asking again. Retrying a booking conflict
 * would be actively wrong: it delays the error the user needs to see and act on.
 * 5xx and network failures (`status: 0`) are the ones worth another attempt.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Reservations and occupancy are edited by other people in other tabs, so a
        // short staleness window is right: fresh enough to avoid a refetch storm while
        // navigating, stale enough that returning to a tab shows current data.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        retry: shouldRetry,
      },
      mutations: {
        // Writes are not idempotent. A retried POST that actually succeeded server-side
        // would surface as a spurious BOOKING_CONFLICT against the booking it just made.
        retry: false,
      },
    },
  });
}

/** The app-wide client. Tests should build their own with `createQueryClient()`. */
export const queryClient = createQueryClient();
