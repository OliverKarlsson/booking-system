import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createReservationSchema } from '@booking/shared';
import type { SelectOption } from '@/components/ui';
import { Button, ErrorBanner, Input, Select } from '@/components/ui';
import type { ConflictingReservation } from '@/lib/apiClient';
import { formatNights } from '@/lib/formatDate';
import { ConflictNotice } from './ConflictNotice';
import type { ReservationFormValues } from './reservationModel';

export interface ReservationFormProps {
  /**
   * Read once, on mount. The container mounts this component only after the reservation
   * it is editing has loaded (and keys it by id), so the defaults never change underneath
   * a form the user is already typing in.
   */
  defaultValues: ReservationFormValues;
  rentalUnits: SelectOption[];
  /**
   * Edit mode locks the rental unit. `updateReservationSchema` omits `rentalUnitId` on
   * purpose — moving a booking between properties is a cancel-and-rebook, not an edit —
   * so offering an editable picker here would promise something the API will not do.
   */
  lockRentalUnit?: boolean;
  onSubmit: (values: ReservationFormValues) => void;
  onCancel: () => void;
  submitLabel?: string;
  isSubmitting?: boolean;
  /** A 409's `details`. Rendered in place, next to the dates that caused it. */
  conflicts?: ConflictingReservation[];
  /** Any other failed write, already reduced to a sentence. */
  errorMessage?: string;
}

/**
 * The create/edit form — presentational apart from the form state react-hook-form owns.
 *
 * It knows nothing about the API: it hands validated values to `onSubmit` and renders
 * whatever error it is given. That is what lets one component serve both flows, and lets
 * the tests drive the conflict path with no network layer at all.
 *
 * Validation uses the **shared** `createReservationSchema` — the same object the server
 * validates the request with — rather than a second set of rules restated in the UI. It
 * carries the `endDate > startDate` refinement, so an inverted range is caught here and
 * the request is never sent: the server would reject it identically, but a round trip to
 * be told something the browser already knew is a worse experience and a wasted write
 * attempt. The create schema is the right one even when editing, because the form always
 * holds a complete reservation; turning that into the partial `PATCH` body is
 * `buildReservationPatch`'s job.
 */
export function ReservationForm({
  defaultValues,
  rentalUnits,
  lockRentalUnit = false,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  isSubmitting = false,
  conflicts,
  errorMessage,
}: ReservationFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ReservationFormValues>({
    defaultValues,
    resolver: zodResolver(createReservationSchema),
  });

  const startDate = watch('startDate');
  const endDate = watch('endDate');
  // Only meaningful once both ends are set and in order; the resolver reports the
  // inverted case, so there is nothing to say here about it.
  const nights = startDate && endDate && endDate > startDate ? formatNights(startDate, endDate) : null;

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      {conflicts && conflicts.length > 0 ? <ConflictNotice conflicts={conflicts} /> : null}
      {!conflicts && errorMessage ? (
        <ErrorBanner title="Could not save" message={errorMessage} />
      ) : null}

      <Select
        label="Rental unit"
        required
        disabled={lockRentalUnit}
        placeholder="Select a rental unit…"
        options={rentalUnits}
        hint={
          lockRentalUnit
            ? 'To move this booking to another property, cancel it and book the new one.'
            : undefined
        }
        error={errors.rentalUnitId?.message}
        {...register('rentalUnitId')}
      />

      <Input
        label="Guest name"
        required
        autoFocus
        placeholder="Jane Doe"
        error={errors.guestName?.message}
        {...register('guestName')}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {/*
          A native `type="date"` input reads and writes `value` as `YYYY-MM-DD` — exactly
          the wire format (§3.1) — so the string goes from the field to the request body
          untouched. No `Date` is constructed anywhere in this form, which is the whole
          reason a booking for the 26th stays the 26th for a user in Los Angeles.
        */}
        <Input
          label="Check-in"
          type="date"
          required
          error={errors.startDate?.message}
          {...register('startDate')}
        />
        <Input
          label="Check-out"
          type="date"
          required
          hint="The day the guest leaves. A stay ending today frees the unit for a check-in today."
          error={errors.endDate?.message}
          {...register('endDate')}
        />
      </div>

      {nights ? <p className="text-sm text-ink-500">{nights}</p> : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
