import { useCallback } from 'react';
import { ErrorBanner, Modal, Spinner } from '@/components/ui';
import { useActiveModal, useBookingStore, useEditingId } from '@/store';
import { useCreateRentalUnit, useRentalUnit, useUpdateRentalUnit } from './api';
import { RentalUnitForm } from './RentalUnitForm';
import { toErrorMessage } from '@/lib/errorMessage';
import { buildRentalUnitPatch, emptyFormValues, formValuesFromUnit, toCreateInput } from './rentalUnitModel';
import type { RentalUnitFormValues } from './rentalUnitModel';
import { detectTimezone } from './timezones';

/**
 * The container behind both the create and the edit dialog.
 *
 * Which dialog is open is client state and lives in the Zustand `uiSlice`; the unit being
 * edited is *server* state and is fetched by id, never copied into the store. That split
 * is why opening the edit dialog from the list and from the detail page needs no shared
 * prop-drilling and cannot show a stale copy of the unit.
 *
 * One component serves both modes because the difference between them is entirely in the
 * request: same fields, same validation, different body (`POST` a whole unit versus
 * `PATCH` only what changed).
 */
export function RentalUnitFormModal() {
  const activeModal = useActiveModal();
  const editingId = useEditingId();
  const closeModal = useBookingStore((state) => state.closeModal);

  const isCreate = activeModal === 'createRentalUnit';
  const isEdit = activeModal === 'editRentalUnit' && Boolean(editingId);

  const createMutation = useCreateRentalUnit();
  const updateMutation = useUpdateRentalUnit();
  const unitQuery = useRentalUnit(isEdit ? (editingId ?? undefined) : undefined);

  const close = useCallback(() => {
    // Clearing the mutation state matters: without it, reopening the dialog after a
    // failed save shows the previous attempt's error above an untouched form.
    createMutation.reset();
    updateMutation.reset();
    closeModal();
  }, [closeModal, createMutation, updateMutation]);

  const handleSubmit = (values: RentalUnitFormValues) => {
    if (isCreate) {
      createMutation.mutate(toCreateInput(values), { onSuccess: close });
      return;
    }

    const unit = unitQuery.data;
    if (!unit) return;

    const patch = buildRentalUnitPatch(unit, values);
    if (!patch) {
      // Nothing changed. `PATCH {}` is a deliberate 400 (§3.6), so the correct move is to
      // send no request at all rather than to bother the user with an error they caused
      // by pressing Save on an untouched form.
      close();
      return;
    }

    updateMutation.mutate({ id: unit.id, patch }, { onSuccess: close });
  };

  if (!isCreate && !isEdit) return null;

  return (
    <Modal
      open
      onClose={close}
      title={isCreate ? 'New rental unit' : 'Edit rental unit'}
      description={
        isCreate
          ? 'Name the property and confirm the timezone it sits in.'
          : 'The timezone is editable — it only affects which day counts as “today” at the property.'
      }
    >
      {isEdit && unitQuery.isPending ? (
        <div className="flex justify-center py-8">
          <Spinner label="Loading rental unit" />
        </div>
      ) : null}

      {isEdit && unitQuery.isError ? (
        <ErrorBanner
          title="Could not load this rental unit"
          message={toErrorMessage(unitQuery.error)}
          onRetry={() => void unitQuery.refetch()}
        />
      ) : null}

      {isCreate ? (
        <RentalUnitForm
          defaultValues={emptyFormValues(detectTimezone())}
          onSubmit={handleSubmit}
          onCancel={close}
          submitLabel="Create rental unit"
          isSubmitting={createMutation.isPending}
          errorMessage={createMutation.isError ? toErrorMessage(createMutation.error) : undefined}
        />
      ) : null}

      {isEdit && unitQuery.data ? (
        <RentalUnitForm
          // Keyed by id so switching which unit is being edited remounts the form with
          // that unit's values instead of keeping the previous one's.
          key={unitQuery.data.id}
          defaultValues={formValuesFromUnit(unitQuery.data)}
          onSubmit={handleSubmit}
          onCancel={close}
          submitLabel="Save changes"
          isSubmitting={updateMutation.isPending}
          errorMessage={updateMutation.isError ? toErrorMessage(updateMutation.error) : undefined}
        />
      ) : null}
    </Modal>
  );
}
