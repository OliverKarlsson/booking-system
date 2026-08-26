import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ConflictingReservation } from '@/lib/apiClient';
import { ReservationForm } from './ReservationForm';
import { emptyFormValues } from './reservationModel';

const UNIT_ID = '11111111-1111-4111-8111-111111111111';
const rentalUnits = [{ value: UNIT_ID, label: 'Seaside flat' }];

/**
 * A `type="date"` input is set through `fireEvent.change` rather than `user.type`: jsdom
 * does not implement the segmented date editor a real browser has, so typing character by
 * character produces a partial, invalid value. The change event is what react-hook-form
 * listens to either way, and the value is the `YYYY-MM-DD` string the API takes.
 */
function setDate(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function renderForm(overrides: Partial<Parameters<typeof ReservationForm>[0]> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <ReservationForm
      defaultValues={emptyFormValues()}
      rentalUnits={rentalUnits}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onSubmit, onCancel, user: userEvent.setup() };
}

describe('ReservationForm — client-side validation', () => {
  it('refuses to send a stay that ends before it starts', async () => {
    const { onSubmit, user } = renderForm();

    await user.selectOptions(screen.getByLabelText(/^Rental unit/), UNIT_ID);
    await user.type(screen.getByLabelText(/^Guest name/), 'Sam Patel');
    setDate(/^Check-in/, '2026-03-15');
    setDate(/^Check-out/, '2026-03-12');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    // The shared schema's own message, so the browser and the server say the same thing.
    expect(await screen.findByText('End date must be after start date')).toBeInTheDocument();
    // The point of validating here: the request is never made.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses a zero-night stay, since the interval is half-open', async () => {
    const { onSubmit, user } = renderForm();

    await user.selectOptions(screen.getByLabelText(/^Rental unit/), UNIT_ID);
    await user.type(screen.getByLabelText(/^Guest name/), 'Sam Patel');
    setDate(/^Check-in/, '2026-03-12');
    setDate(/^Check-out/, '2026-03-12');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('End date must be after start date')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('reports the required fields instead of submitting an incomplete booking', async () => {
    const { onSubmit, user } = renderForm();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Guest name is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a valid stay, dates untouched by any Date parsing', async () => {
    const { onSubmit, user } = renderForm();

    await user.selectOptions(screen.getByLabelText(/^Rental unit/), UNIT_ID);
    await user.type(screen.getByLabelText(/^Guest name/), 'Sam Patel');
    setDate(/^Check-in/, '2026-03-15');
    setDate(/^Check-out/, '2026-03-18');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      rentalUnitId: UNIT_ID,
      guestName: 'Sam Patel',
      startDate: '2026-03-15',
      endDate: '2026-03-18',
    });
  });

  it('shows the nights once both ends are set', async () => {
    renderForm();
    setDate(/^Check-in/, '2026-03-15');
    setDate(/^Check-out/, '2026-03-16');

    expect(await screen.findByText('1 night')).toBeInTheDocument();
  });
});

describe('ReservationForm — conflict feedback', () => {
  const conflicts: ConflictingReservation[] = [
    {
      id: '33333333-3333-4333-8333-333333333333',
      guestName: 'Jane Doe',
      startDate: '2026-03-12',
      endDate: '2026-03-15',
    },
  ];

  it('names the conflicting guest and dates on the form itself', () => {
    renderForm({ conflicts });

    // Not a toast: the banner is inside the form, and it is still there while the user
    // picks different dates.
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Conflicts with Jane Doe (12–15 March 2026)');
    expect(banner).toHaveTextContent('These dates are already booked');
  });

  it('lists every blocking booking when more than one is in the way', () => {
    renderForm({
      conflicts: [
        ...conflicts,
        {
          id: '44444444-4444-4444-8444-444444444444',
          guestName: 'Ada Byron',
          startDate: '2026-03-18',
          endDate: '2026-03-20',
        },
      ],
    });

    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('These dates overlap 2 existing bookings');
    expect(banner).toHaveTextContent('Conflicts with Jane Doe (12–15 March 2026)');
    expect(banner).toHaveTextContent('Conflicts with Ada Byron (18–20 March 2026)');
  });

  it('prefers the specific conflict over a generic message when both are present', () => {
    renderForm({ conflicts, errorMessage: 'Reservation overlaps an existing booking' });

    expect(screen.getByRole('alert')).toHaveTextContent('Conflicts with Jane Doe');
    expect(
      screen.queryByText('Reservation overlaps an existing booking'),
    ).not.toBeInTheDocument();
  });

  it('locks the rental unit when editing, since the API will not move a booking', () => {
    renderForm({ lockRentalUnit: true, submitLabel: 'Save changes' });
    expect(screen.getByLabelText(/^Rental unit/)).toBeDisabled();
  });
});
