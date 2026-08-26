import { useParams } from 'react-router-dom';
import { EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/layout';

/**
 * STUB — owned by T2.4 (rental unit management UI).
 *
 * Replace the body of this component. It is already mounted at `/units/:id` in
 * `src/router.tsx`; do not edit the router. The route param is named `id`.
 */
export function RentalUnitDetailPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <>
      <PageHeader title="Rental unit" description={id} />
      <EmptyState
        title="Rental unit detail not built yet"
        description="This page is a Wave 1 stub. T2.4 fills it in with unit info and its reservations."
      />
    </>
  );
}
