import { useCallback } from 'react';
import { Button, ErrorBanner, Modal, Spinner } from '@/components/ui';
import { formatDateRange } from '@/lib/formatDate';
import { useActiveModal, useBookingStore, useEditingId } from '@/store';
import { useCancelReservation, useReservation } from './api';
import { toErrorMessage } from './errorMessage';

/**
 * Confirmation before cancelling a booking.
 *
 * Cancelling is destructive from the guest's point of view and is reached from a small
 * button in a list row, so it asks first — and it names the guest and the dates while
 * asking, because "Are you sure?" on its own does not let the user check they clicked the
 * right row.
 *
 * `DELETE` sets `status: 'cancelled'` rather than removing the row (§3.6). The wording
 * says so: the booking stays visible under the Cancelled filter, and its dates become
 * bookable again because the exclusion constraint only indexes confirmed rows.
 */
export function CancelReservationDialog() {
  const activeModal = useActiveModal();
  const editingId = useEditingId();
  const closeModal = useBookingStore((state) => state.closeModal);

  const isOpen = activeModal === 'cancelReservation' && Boolean(editingId);

  const reservationQuery = useReservation(isOpen ? (editingId ?? undefined) : undefined);
  const cancelMutation = useCancelReservation();

  const close = useCallback(() => {
    cancelMutation.reset();
    closeModal();
  }, [closeModal, cancelMutation]);

  if (!isOpen) return null;

  const reservation = reservationQuery.data;

  return (
    <Modal
      open
      onClose={close}
      title="Cancel this reservation?"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={cancelMutation.isPending}>
            Keep booking
          </Button>
          <Button
            variant="danger"
            loading={cancelMutation.isPending}
            disabled={!reservation}
            onClick={() =>
              reservation && cancelMutation.mutate(reservation.id, { onSuccess: close })
            }
          >
            Cancel reservation
          </Button>
        </>
      }
    >
      {reservationQuery.isPending ? (
        <div className="flex justify-center py-6">
          <Spinner label="Loading reservation" />
        </div>
      ) : null}

      {reservationQuery.isError ? (
        <ErrorBanner
          title="Could not load this reservation"
          message={toErrorMessage(reservationQuery.error)}
          onRetry={() => void reservationQuery.refetch()}
        />
      ) : null}

      {cancelMutation.isError ? (
        <ErrorBanner
          title="Could not cancel"
          message={toErrorMessage(cancelMutation.error)}
          className="mb-3"
        />
      ) : null}

      {reservation ? (
        <p className="text-sm text-ink-700">
          <span className="font-medium text-ink-900">{reservation.guestName}</span>,{' '}
          {formatDateRange(reservation.startDate, reservation.endDate)}. The booking is kept
          as a cancelled record, and these dates become available again.
        </p>
      ) : null}
    </Modal>
  );
}
