import { useQuery } from '@tanstack/react-query';
import type { DashboardResponse } from '@booking/shared';
import { apiClient } from '@/lib/apiClient';
import { queryKeys } from '@/lib/queryKeys';

/**
 * Server state for the dashboard.
 *
 * **No date is sent.** The endpoint takes no parameters at all: "today" is resolved by
 * the server per unit, in that unit's own timezone (§3.6/§3.7), because occupancy is a
 * fact about the flat rather than about whoever is looking at the screen. Passing the
 * viewer's date would be the bug this design exists to avoid, and the cache key has
 * nothing to vary on as a result.
 *
 * The `?now=` override in the contract is test-only server-side tooling and deliberately
 * has no client here.
 */

const DASHBOARD_PATH = '/dashboard';

export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard.list(),
    queryFn: ({ signal }) => apiClient.get<DashboardResponse>(DASHBOARD_PATH, { signal }),
  });
}
