import { Button } from '@/components/ui';
import { PageHeader } from '@/components/layout';
import { useBookingStore } from '@/store';
import { CancelReservationDialog } from './CancelReservationDialog';
import { ReservationFormModal } from './ReservationFormModal';
import { ReservationList } from './ReservationList';

/**
 * The `/reservations` route. Mounted by `src/router.tsx`, which this file does not touch.
 *
 * Deliberately thin: the page composes a header, the list container, and the two dialogs.
 * All fetching lives in `ReservationList`, all form state in `ReservationFormModal`, and
 * the dialogs render nothing at all until `uiSlice` says they are open — which is why
 * mounting them here costs a null check rather than a fetch.
 */
export function ReservationsPage() {
  const openModal = useBookingStore((state) => state.openModal);

  return (
    <>
      <PageHeader
        title="Reservations"
        description="Bookings across every rental unit."
        actions={<Button onClick={() => openModal('createReservation')}>New reservation</Button>}
      />
      <ReservationList />
      <ReservationFormModal />
      <CancelReservationDialog />
    </>
  );
}
