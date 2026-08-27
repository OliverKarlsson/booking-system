import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal } from '@/components/ui';
import { PageHeader } from '@/components/layout';
import { isApiError } from '@/lib/apiClient';
import { useBookingStore } from '@/store';
import { useDeleteRentalUnit, useRentalUnit, useRentalUnitReservations } from './api';
import { RentalUnitDetailView } from './RentalUnitDetailView';
import { RentalUnitReservationsView } from './RentalUnitReservationsView';
import { toErrorMessage } from '@/lib/errorMessage';

export interface RentalUnitDetailProps {
  id: string;
}

/**
 * Fetches one unit and its reservations, and orchestrates the two actions on it.
 *
 * The two queries are kept separate rather than combined into one "page data" fetch, so a
 * reservation list that fails to load still leaves the unit's own details on screen — and
 * so a booking made elsewhere invalidates only the list that actually went stale.
 */
export function RentalUnitDetail({ id }: RentalUnitDetailProps) {
  const navigate = useNavigate();
  const openModal = useBookingStore((state) => state.openModal);
  const [reservationsPage, setReservationsPage] = useState(1);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const unitQuery = useRentalUnit(id);
  const reservationsQuery = useRentalUnitReservations(id, reservationsPage);
  const deleteMutation = useDeleteRentalUnit();

  const unit = unitQuery.data;

  const confirmDelete = () => {
    deleteMutation.mutate(id, {
      onSettled: () => setConfirmingDelete(false),
      // The unit is gone from every list, so staying on its detail page would show a 404
      // a moment later.
      onSuccess: () => navigate('/units'),
    });
  };

  const deleteError = deleteMutation.error;
  const deleteErrorMessage = deleteError
    ? isApiError(deleteError) && deleteError.code === 'UNIT_HAS_RESERVATIONS'
      ? // Soft delete is refused while non-cancelled bookings still point at the unit
        // (§3.6). The server's sentence says what happened; this adds what to do next.
        `${toErrorMessage(deleteError)} Cancel its reservations first.`
      : toErrorMessage(deleteError)
    : undefined;

  return (
    <>
      <PageHeader
        title="Rental unit"
        // Falls back to the id so the page identifies which unit it is loading before the
        // name has arrived.
        description={unit?.name ?? id}
      />

      <RentalUnitDetailView
        unit={unit}
        isLoading={unitQuery.isPending}
        isError={unitQuery.isError}
        errorMessage={unitQuery.error ? toErrorMessage(unitQuery.error) : undefined}
        onRetry={() => void unitQuery.refetch()}
        onEdit={() => openModal('editRentalUnit', id)}
        onDelete={() => setConfirmingDelete(true)}
        isDeleting={deleteMutation.isPending}
        deleteErrorMessage={deleteErrorMessage}
      >
        <RentalUnitReservationsView
          reservations={reservationsQuery.data?.data ?? []}
          pagination={reservationsQuery.data?.pagination}
          isLoading={reservationsQuery.isPending}
          isError={reservationsQuery.isError}
          errorMessage={
            reservationsQuery.error ? toErrorMessage(reservationsQuery.error) : undefined
          }
          onRetry={() => void reservationsQuery.refetch()}
          onPageChange={setReservationsPage}
        />
      </RentalUnitDetailView>

      <Modal
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete this rental unit?"
        description="It stops appearing in lists and on the dashboard. Cancelled reservations that reference it stay readable."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleteMutation.isPending}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-600">
          {unit ? `“${unit.name}” will be removed from the app.` : 'This unit will be removed.'}
        </p>
      </Modal>
    </>
  );
}
