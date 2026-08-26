import { EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/layout';

/**
 * STUB — owned by T3.1 (dashboard view).
 *
 * Replace the body of this component. It is already mounted at `/` in `src/router.tsx`;
 * do not edit the router.
 *
 * Reminders from the contract: send no date (§3.6 — the server resolves "today" per unit
 * in that unit's own timezone), and render every date with `formatDate` from
 * `@/lib/formatDate` rather than constructing a `Date` (§3.7).
 */
export function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Occupancy for every rental unit, as of each property's own local date."
      />
      <EmptyState
        title="Dashboard not built yet"
        description="This page is a Wave 1 stub. T3.1 fills it in with one card per rental unit."
      />
    </>
  );
}
