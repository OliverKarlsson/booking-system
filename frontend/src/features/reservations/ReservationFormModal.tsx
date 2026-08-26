import { useCallback } from 'react';
import { ErrorBanner, Modal, Spinner } from '@/components/ui';
import { useActiveModal, useBookingStore, useEditingId, useReservationFilters } from '@/store';
import {
  useCreateReservation,
  useRentalUnitOptions,
  useReservation,
  useUpdateReservation,
} from './api';
import { ReservationForm } from './ReservationForm';
import { toConflicts, toErrorMessage } from './errorMessage';
import {
  buildReservationPatch,
  emptyFormValues,
  formValuesFromReservation,
  toCreateInput,
  toRentalUnitOptions,
} from './reservationModel';
import type { ReservationFormValues } from './reservationModel';

/**
 * The container behind both the create and the edit dialog.
 *
 * Which dialog is open is client state and lives in the Zustand `uiSlice`; the
 * reservation being edited is *server* state and is fetched by id, never copied into the
 * store. One component serves both modes because the difference between them is entirely
 * in the request: same fields, same validation, different body (`POST` a whole
 * reservation versus `PATCH` only what changed).
 *
 * The conflict path is the reason this container exists in this shape. A 409 is left
 * sitting in the mutation's error state and rendered *inside the still-open dialog*,
 * beside the date fields that caused it — see `toConflicts`. Closing the dialog on a 409,
 * or reporting it as a toast, would discard the one piece of information that makes the
 * error actionable: which booking is in the way, and until when.
 */
export function ReservationFormModal() {
  const activeModal = useActiveModal();
  const editingId = useEditingId();
  const closeModal = useBookingStore((state) => state.closeModal);
  const filters = useReservationFilters();

  const isCreate = activeModal === 'createReservation';
  const isEdit = activeModal === 'editReservation' && Boolean(editingId);

  const createMutation = useCreateReservation();
  const updateMutation = useUpdateReservation();
  const reservationQuery = useReservation(isEdit ? (editingId ?? undefined) : undefined);
  const unitsQuery = useRentalUnitOptions();

  const close = useCallback(() => {
    // Clearing the mutation state matters: without it, reopening the dialog after a
    // failed save shows the previous attempt's conflict above an untouched form.
    createMutation.reset();
    updateMutation.reset();
    closeModal();
  }, [closeModal, createMutation, updateMutation]);

  const handleSubmit = (values: ReservationFormValues) => {
    if (isCreate) {
      createMutation.mutate(toCreateInput(values), { onSuccess: close });
      return;
    }

    const reservation = reservationQuery.data;
    if (!reservation) return;

    const patch = buildReservationPatch(reservation, values);
    if (!patch) {
      // Nothing changed. `PATCH {}` is a deliberate 400 (§3.6), so the correct move is to
      // send no request at all rather than to bother the user with an error they caused by
      // pressing Save on an untouched form.
      close();
      return;
    }

    updateMutation.mutate({ id: reservation.id, patch }, { onSuccess: close });
  };

  if (!isCreate && !isEdit) return null;

  const rentalUnits = toRentalUnitOptions(unitsQuery.data?.data ?? []);

  return (
    <Modal
      open
      onClose={close}
      title={isCreate ? 'New reservation' : 'Edit reservation'}
      description={
        isCreate
          ? 'Check-out is the day the guest leaves — a stay ending on the day another begins is not a conflict.'
          : 'Dates are re-checked against the other bookings for this unit when you save.'
      }
    >
      {isEdit && reservationQuery.isPending ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading reservation" />
        </div>
      ) : null}

      {isEdit && reservationQuery.isError ? (
        <ErrorBanner
          title="Could not load this reservation"
          message={toErrorMessage(reservationQuery.error)}
          onRetry={() => void reservationQuery.refetch()}
        />
      ) : null}

      {isCreate ? (
        <ReservationForm
          // Pre-selecting the filtered unit saves re-picking the one the user is already
          // looking at. It is a default, not a lock — the picker stays editable.
          defaultValues={emptyFormValues(filters.rentalUnitId ?? '')}
          rentalUnits={rentalUnits}
          onSubmit={handleSubmit}
          onCancel={close}
          submitLabel="Create reservation"
          isSubmitting={createMutation.isPending}
          conflicts={toConflicts(createMutation.error)}
          errorMessage={createMutation.isError ? toErrorMessage(createMutation.error) : undefined}
        />
      ) : null}

      {isEdit && reservationQuery.data ? (
        <ReservationForm
          // Keyed by id so switching which reservation is being edited remounts the form
          // with that one's values instead of keeping the previous one's.
          key={reservationQuery.data.id}
          defaultValues={formValuesFromReservation(reservationQuery.data)}
          rentalUnits={rentalUnits}
          lockRentalUnit
          onSubmit={handleSubmit}
          onCancel={close}
          submitLabel="Save changes"
          isSubmitting={updateMutation.isPending}
          conflicts={toConflicts(updateMutation.error)}
          errorMessage={updateMutation.isError ? toErrorMessage(updateMutation.error) : undefined}
        />
      ) : null}
    </Modal>
  );
}
