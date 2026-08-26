import type { DashboardEntry } from '@booking/shared';
import { Button, EmptyState, ErrorBanner, Spinner } from '@/components/ui';
import { DashboardSummary } from './DashboardSummary';
import { DashboardUnitCard } from './DashboardUnitCard';
import { summarizeDashboard } from './dashboardModel';

export interface DashboardListViewProps {
  entries: DashboardEntry[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry: () => void;
  /** Navigates to the rental units screen from the empty state. */
  onAddRentalUnit: () => void;
}

/**
 * The dashboard, as pure markup.
 *
 * It takes the three states a fetched list can be in as flags rather than deriving them,
 * so loading, failed, and empty are each reachable in a test by passing props — no query
 * client, no router data loading, no mocked network.
 *
 * The response is unpaginated by design (§3.6 returns every active unit), so there is no
 * pagination control here — unlike the rental unit list, which pages.
 */
export function DashboardListView({
  entries,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  onAddRentalUnit,
}: DashboardListViewProps) {
  if (isError) {
    return (
      <ErrorBanner
        title="Could not load the dashboard"
        message={errorMessage ?? 'Occupancy could not be loaded.'}
        onRetry={onRetry}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" label="Loading dashboard" />
      </div>
    );
  }

  if (entries.length === 0) {
    // Distinct from "every unit is vacant": there is nothing to be occupied yet, so the
    // page offers the action that fixes it rather than showing four zeroes.
    return (
      <EmptyState
        title="No rental units yet"
        description="Add a property and its occupancy will appear here, evaluated against that property's own local date."
        action={<Button onClick={onAddRentalUnit}>Add rental unit</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <DashboardSummary counts={summarizeDashboard(entries)} />

      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Rental unit occupancy">
        {entries.map((entry) => (
          <li key={entry.rentalUnit.id}>
            <DashboardUnitCard entry={entry} />
          </li>
        ))}
      </ul>
    </div>
  );
}
