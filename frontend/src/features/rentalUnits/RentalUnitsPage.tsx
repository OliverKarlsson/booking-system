import { EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/layout';

/**
 * STUB — owned by T2.4 (rental unit management UI).
 *
 * Replace the body of this component. It is already mounted at `/units` in
 * `src/router.tsx`; do not edit the router.
 */
export function RentalUnitsPage() {
  return (
    <>
      <PageHeader title="Rental units" description="The properties available to book." />
      <EmptyState
        title="Rental units not built yet"
        description="This page is a Wave 1 stub. T2.4 fills it in with the unit list and create form."
      />
    </>
  );
}
