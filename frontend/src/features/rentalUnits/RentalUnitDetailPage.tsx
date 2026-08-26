import { useParams } from 'react-router-dom';
import { EmptyState } from '@/components/ui';
import { PageHeader } from '@/components/layout';
import { RentalUnitDetail } from './RentalUnitDetail';
import { RentalUnitFormModal } from './RentalUnitFormModal';

/**
 * The `/units/:id` route. Mounted by `src/router.tsx`, which this file does not touch.
 *
 * The param is unwrapped here and passed down as a required prop, so nothing below this
 * point has to cope with react-router typing every param as possibly `undefined`.
 */
export function RentalUnitDetailPage() {
  const { id } = useParams<{ id: string }>();

  if (!id) {
    return (
      <>
        <PageHeader title="Rental unit" />
        <EmptyState
          title="No rental unit selected"
          description="This URL is missing a rental unit id."
        />
      </>
    );
  }

  return (
    <>
      <RentalUnitDetail id={id} />
      <RentalUnitFormModal />
    </>
  );
}
