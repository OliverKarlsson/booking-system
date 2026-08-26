import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RentalUnitForm } from './RentalUnitForm';
import { emptyFormValues, formValuesFromUnit } from './rentalUnitModel';
import type { RentalUnit } from '@booking/shared';

const unit: RentalUnit = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Seaside flat',
  timezone: 'Europe/Lisbon',
  address: { street: 'Rua do Mar 4', city: 'Lisbon', postcode: '1100-001', country: 'Portugal' },
  status: 'active',
  createdAt: '2026-01-05T09:30:00.000Z',
  updatedAt: '2026-01-05T09:30:00.000Z',
};

function renderForm(overrides: Partial<Parameters<typeof RentalUnitForm>[0]> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <RentalUnitForm
      defaultValues={emptyFormValues()}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onSubmit, onCancel, user: userEvent.setup() };
}

describe('RentalUnitForm', () => {
  it('reports the required fields instead of submitting an incomplete unit', async () => {
    const { onSubmit, user } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Name is required')).toBeInTheDocument();
    expect(screen.getByText('Timezone is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects a name longer than the contract allows', async () => {
    const { onSubmit, user } = renderForm();

    await user.type(screen.getByLabelText(/^Name/), 'x'.repeat(121));
    await user.selectOptions(screen.getByLabelText(/^Timezone/), 'Europe/Stockholm');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Name must be at most 120 characters')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the completed form', async () => {
    const { onSubmit, user } = renderForm();

    await user.type(screen.getByLabelText(/^Name/), 'Seaside flat');
    await user.selectOptions(screen.getByLabelText(/^Timezone/), 'Europe/Lisbon');
    await user.type(screen.getByLabelText(/^City/), 'Lisbon');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      name: 'Seaside flat',
      timezone: 'Europe/Lisbon',
      address: { city: 'Lisbon' },
    });
  });

  it('pre-fills the timezone as a confirmable default rather than a hidden one', () => {
    // The detected zone is the manager's, not necessarily the property's, so it has to be
    // visible in the control before saving.
    renderForm({ defaultValues: emptyFormValues('Europe/Stockholm') });
    expect(screen.getByLabelText(/^Timezone/)).toHaveValue('Europe/Stockholm');
  });

  it('never offers a timezone the API would reject', () => {
    renderForm();
    // Browsers list `UTC`; Node's tz data does not, so selecting it would earn a 400 from
    // a control that gave the user no other way to be right.
    expect(screen.queryByRole('option', { name: 'UTC' })).not.toBeInTheDocument();
  });

  it('loads an existing unit into the fields, timezone included', () => {
    renderForm({ defaultValues: formValuesFromUnit(unit), submitLabel: 'Save changes' });

    expect(screen.getByLabelText(/^Name/)).toHaveValue('Seaside flat');
    expect(screen.getByLabelText(/^Timezone/)).toHaveValue('Europe/Lisbon');
    expect(screen.getByLabelText(/^Street/)).toHaveValue('Rua do Mar 4');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('keeps a failed save on screen next to the form', async () => {
    const { user, onCancel } = renderForm({ errorMessage: 'Name is already taken' });

    expect(screen.getByRole('alert')).toHaveTextContent('Name is already taken');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
