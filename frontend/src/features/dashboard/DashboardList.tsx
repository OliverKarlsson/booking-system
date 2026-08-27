import { useNavigate } from 'react-router-dom';
import { useDashboard } from './api';
import { DashboardListView } from './DashboardListView';
import { toErrorMessage } from '@/lib/errorMessage';

/**
 * Fetches occupancy and hands it to the view.
 *
 * There is nothing to parameterise: the endpoint takes no date (§3.7), the response is
 * every active unit, and the only interaction on the page is a retry. So this container
 * is genuinely thin — which is the point of the split, not a sign it should be collapsed
 * into the view: the view stays renderable from props alone in six tests.
 */
export function DashboardList() {
  const navigate = useNavigate();
  const query = useDashboard();

  return (
    <DashboardListView
      entries={query.data?.data ?? []}
      isLoading={query.isPending}
      isError={query.isError}
      errorMessage={query.error ? toErrorMessage(query.error) : undefined}
      onRetry={() => void query.refetch()}
      onAddRentalUnit={() => void navigate('/units')}
    />
  );
}
