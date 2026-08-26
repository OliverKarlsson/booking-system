import { Button } from '@/components/ui';
import { PageHeader } from '@/components/layout';
import { useBookingStore } from '@/store';
import { RentalUnitList } from './RentalUnitList';
import { RentalUnitFormModal } from './RentalUnitFormModal';

/**
 * The `/units` route. Mounted by `src/router.tsx`, which this file does not touch.
 *
 * Deliberately thin: the page composes a header, the list container, and the dialog. All
 * fetching lives in `RentalUnitList`, all form state in `RentalUnitFormModal`.
 */
export function RentalUnitsPage() {
  const openModal = useBookingStore((state) => state.openModal);

  return (
    <>
      <PageHeader
        title="Rental units"
        description="The properties available to book."
        actions={<Button onClick={() => openModal('createRentalUnit')}>New rental unit</Button>}
      />
      <RentalUnitList />
      <RentalUnitFormModal />
    </>
  );
}
