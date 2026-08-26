import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createRentalUnitSchema } from '@booking/shared';
import { Button, ErrorBanner, Input, Select } from '@/components/ui';
import { TIMEZONE_OPTIONS } from './timezones';
import type { RentalUnitFormValues } from './rentalUnitModel';

export interface RentalUnitFormProps {
  /**
   * Read once, on mount. The container mounts this component only after the unit it is
   * editing has loaded (and keys it by id), so there is no case where the defaults change
   * underneath a form the user is already typing in.
   */
  defaultValues: RentalUnitFormValues;
  onSubmit: (values: RentalUnitFormValues) => void;
  onCancel: () => void;
  submitLabel?: string;
  isSubmitting?: boolean;
  /** A failed write, already reduced to a sentence. Kept next to the form, never a toast. */
  errorMessage?: string;
}

/**
 * The create/edit form — presentational apart from the form state react-hook-form owns.
 *
 * It knows nothing about the API: it hands validated values to `onSubmit` and renders
 * whatever error string it is given. That is what lets one component serve both the
 * create and the edit flow, and lets the test below drive it without a network layer.
 *
 * Validation uses the **shared** `createRentalUnitSchema` — the same object the server
 * validates the request with — rather than a second set of rules restated in the UI. The
 * create schema is the right one even for editing: the form always holds a complete unit,
 * so `updateRentalUnitSchema` (partial, and rejecting an empty patch) describes the
 * *request body*, not the fields on screen. Turning the completed form into that partial
 * body is `buildRentalUnitPatch`'s job.
 */
export function RentalUnitForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = 'Save',
  isSubmitting = false,
  errorMessage,
}: RentalUnitFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RentalUnitFormValues>({
    defaultValues,
    resolver: zodResolver(createRentalUnitSchema),
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      {errorMessage ? <ErrorBanner title="Could not save" message={errorMessage} /> : null}

      <Input
        label="Name"
        required
        autoFocus
        placeholder="Seaside flat"
        error={errors.name?.message}
        {...register('name')}
      />

      <Select
        label="Timezone"
        required
        placeholder="Select a timezone…"
        options={[...TIMEZONE_OPTIONS]}
        hint="The property's own timezone — this is what decides whether it counts as occupied today."
        error={errors.timezone?.message}
        {...register('timezone')}
      />

      <fieldset className="flex flex-col gap-4 rounded-md border border-ink-200 px-4 py-4">
        <legend className="px-1 text-sm font-medium text-ink-700">Address (optional)</legend>

        <Input label="Street" error={errors.address?.street?.message} {...register('address.street')} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Postcode"
            error={errors.address?.postcode?.message}
            {...register('address.postcode')}
          />
          <Input label="City" error={errors.address?.city?.message} {...register('address.city')} />
        </div>

        <Input
          label="Country"
          error={errors.address?.country?.message}
          {...register('address.country')}
        />
      </fieldset>

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
