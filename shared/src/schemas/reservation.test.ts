import { describe, expect, it } from 'vitest';

import { datesOverlap } from '../dates';
import {
  createReservationSchema,
  reservationQuerySchema,
  reservationSchema,
  reservationSummarySchema,
  updateReservationSchema,
} from './reservation';

const RENTAL_UNIT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const RESERVATION_ID = '9c858901-8a57-4791-81fe-4c455b099bc9';

const validReservation = {
  id: RESERVATION_ID,
  rentalUnitId: RENTAL_UNIT_ID,
  guestName: 'Jane Doe',
  startDate: '2026-03-12',
  endDate: '2026-03-15',
  status: 'confirmed' as const,
  createdAt: '2026-03-01T09:15:00Z',
  updatedAt: '2026-03-01T09:15:00Z',
};

const validCreate = {
  rentalUnitId: RENTAL_UNIT_ID,
  guestName: 'Jane Doe',
  startDate: '2026-03-12',
  endDate: '2026-03-15',
};

describe('reservationSchema', () => {
  it('accepts a complete reservation', () => {
    expect(reservationSchema.parse(validReservation)).toEqual(validReservation);
  });

  it('accepts a cancelled reservation', () => {
    expect(reservationSchema.safeParse({ ...validReservation, status: 'cancelled' }).success).toBe(true);
  });

  it('rejects an unknown status', () => {
    expect(reservationSchema.safeParse({ ...validReservation, status: 'pending' }).success).toBe(false);
  });

  it('enforces endDate > startDate', () => {
    expect(
      reservationSchema.safeParse({ ...validReservation, startDate: '2026-03-15', endDate: '2026-03-12' }).success,
    ).toBe(false);
    expect(
      reservationSchema.safeParse({ ...validReservation, startDate: '2026-03-12', endDate: '2026-03-12' }).success,
    ).toBe(false);
  });
});

describe('reservationSummarySchema', () => {
  it('is the shape carried by BOOKING_CONFLICT.details and the dashboard', () => {
    const summary = {
      id: RESERVATION_ID,
      guestName: 'Jane Doe',
      startDate: '2026-03-12',
      endDate: '2026-03-15',
    };

    expect(reservationSummarySchema.parse(summary)).toEqual(summary);
  });

  it('drops the fields the summary deliberately omits', () => {
    const parsed = reservationSummarySchema.parse(validReservation);

    expect(Object.keys(parsed).sort()).toEqual(['endDate', 'guestName', 'id', 'startDate']);
  });
});

describe('createReservationSchema', () => {
  it('accepts a valid booking', () => {
    expect(createReservationSchema.parse(validCreate)).toEqual(validCreate);
  });

  it('accepts a single-night stay', () => {
    expect(
      createReservationSchema.safeParse({ ...validCreate, startDate: '2026-03-12', endDate: '2026-03-13' }).success,
    ).toBe(true);
  });

  it('rejects a zero-night stay — a reservation is at least one night', () => {
    const result = createReservationSchema.safeParse({ ...validCreate, endDate: validCreate.startDate });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['endDate']);
      expect(result.error.issues[0]?.message).toMatch(/after start date/);
    }
  });

  it('rejects an inverted range', () => {
    expect(
      createReservationSchema.safeParse({ ...validCreate, startDate: '2026-03-15', endDate: '2026-03-12' }).success,
    ).toBe(false);
  });

  it('rejects impossible calendar dates before it ever gets to the range check', () => {
    expect(createReservationSchema.safeParse({ ...validCreate, startDate: '2026-02-31' }).success).toBe(false);
    expect(createReservationSchema.safeParse({ ...validCreate, endDate: '2026-13-01' }).success).toBe(false);
  });

  it('rejects timestamps in place of dates', () => {
    expect(createReservationSchema.safeParse({ ...validCreate, startDate: '2026-03-12T00:00:00Z' }).success).toBe(
      false,
    );
  });

  it('requires a valid rentalUnitId', () => {
    expect(createReservationSchema.safeParse({ ...validCreate, rentalUnitId: 'unit-1' }).success).toBe(false);
    const { rentalUnitId: _omitted, ...withoutUnit } = validCreate;
    expect(createReservationSchema.safeParse(withoutUnit).success).toBe(false);
  });

  it('requires a guest name of 1–120 characters', () => {
    expect(createReservationSchema.safeParse({ ...validCreate, guestName: '' }).success).toBe(false);
    expect(createReservationSchema.safeParse({ ...validCreate, guestName: '  ' }).success).toBe(false);
    expect(createReservationSchema.safeParse({ ...validCreate, guestName: 'x'.repeat(121) }).success).toBe(false);
  });

  it('does not accept a client-chosen status', () => {
    expect(createReservationSchema.parse({ ...validCreate, status: 'cancelled' })).not.toHaveProperty('status');
  });
});

describe('updateReservationSchema', () => {
  it('accepts a single-field patch', () => {
    expect(updateReservationSchema.parse({ guestName: 'John Doe' })).toEqual({ guestName: 'John Doe' });
  });

  it('accepts a cancellation', () => {
    expect(updateReservationSchema.parse({ status: 'cancelled' })).toEqual({ status: 'cancelled' });
  });

  it('rejects an empty patch', () => {
    expect(updateReservationSchema.safeParse({}).success).toBe(false);
  });

  it('enforces the range when both dates are present', () => {
    expect(updateReservationSchema.safeParse({ startDate: '2026-03-15', endDate: '2026-03-12' }).success).toBe(false);
    expect(updateReservationSchema.safeParse({ startDate: '2026-03-12', endDate: '2026-03-15' }).success).toBe(true);
  });

  it('allows a one-sided date patch — the stored counterpart is the service’s business', () => {
    expect(updateReservationSchema.safeParse({ endDate: '2026-03-20' }).success).toBe(true);
    expect(updateReservationSchema.safeParse({ startDate: '2026-03-11' }).success).toBe(true);
  });

  it('does not accept a rentalUnitId — moving a booking is a cancel-and-rebook', () => {
    expect(updateReservationSchema.parse({ guestName: 'John', rentalUnitId: RENTAL_UNIT_ID })).not.toHaveProperty(
      'rentalUnitId',
    );
  });
});

describe('reservationQuerySchema', () => {
  it('defaults to confirmed reservations, page 1, limit 20', () => {
    expect(reservationQuerySchema.parse({})).toEqual({ page: 1, limit: 20, status: 'confirmed' });
  });

  it('accepts the full filter set from query strings', () => {
    expect(
      reservationQuerySchema.parse({
        rentalUnitId: RENTAL_UNIT_ID,
        from: '2026-03-01',
        to: '2026-04-01',
        status: 'cancelled',
        page: '2',
        limit: '50',
      }),
    ).toEqual({
      rentalUnitId: RENTAL_UNIT_ID,
      from: '2026-03-01',
      to: '2026-04-01',
      status: 'cancelled',
      page: 2,
      limit: 50,
    });
  });

  it('accepts from or to on its own', () => {
    expect(reservationQuerySchema.safeParse({ from: '2026-03-01' }).success).toBe(true);
    expect(reservationQuerySchema.safeParse({ to: '2026-04-01' }).success).toBe(true);
  });

  it('rejects a window that ends before it starts', () => {
    expect(reservationQuerySchema.safeParse({ from: '2026-04-01', to: '2026-03-01' }).success).toBe(false);
    expect(reservationQuerySchema.safeParse({ from: '2026-03-01', to: '2026-03-01' }).success).toBe(false);
  });

  it('rejects malformed filter values', () => {
    expect(reservationQuerySchema.safeParse({ from: '01/03/2026' }).success).toBe(false);
    expect(reservationQuerySchema.safeParse({ status: 'archived' }).success).toBe(false);
    expect(reservationQuerySchema.safeParse({ rentalUnitId: 'unit-1' }).success).toBe(false);
    expect(reservationQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});

/**
 * The schemas describe one reservation; `datesOverlap` describes the relationship
 * between two. This is the boundary the database constraint enforces, restated here in
 * the terms the API contract uses — see the warning on `datesOverlap` about why this is
 * a description of the rule and not the enforcement of it.
 */
describe('the booking rule as the API sees it', () => {
  const existing = createReservationSchema.parse(validCreate); // 2026-03-12 → 2026-03-15

  it('permits a check-in on the existing checkout date', () => {
    const turnover = createReservationSchema.parse({ ...validCreate, startDate: '2026-03-15', endDate: '2026-03-18' });

    expect(datesOverlap(existing.startDate, existing.endDate, turnover.startDate, turnover.endDate)).toBe(false);
  });

  it('blocks a stay that shares even one night', () => {
    const clash = createReservationSchema.parse({ ...validCreate, startDate: '2026-03-14', endDate: '2026-03-18' });

    expect(datesOverlap(existing.startDate, existing.endDate, clash.startDate, clash.endDate)).toBe(true);
  });
});
