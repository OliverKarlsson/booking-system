import { PageHeader } from '@/components/layout';
import { DashboardList } from './DashboardList';

/**
 * The `/` route — the application's landing page. Mounted by `src/router.tsx`, which this
 * file does not touch.
 *
 * Deliberately thin: the page composes a header and the list container, and all fetching
 * lives in `DashboardList`.
 *
 * The description says "each property's own local date" rather than "today" on purpose.
 * Occupancy here is not evaluated against the viewer's clock at all — the server resolves
 * the date per unit in that unit's timezone (§3.7), and every card prints the date it
 * used.
 */
export function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Occupancy for every rental unit, as of each property's own local date."
      />
      <DashboardList />
    </>
  );
}
