import { describe, expect, it } from 'vitest';
import type { RentalUnit, Reservation } from '@booking/shared';
import { initialReservationFilters } from '@/store';
import {
  buildReservationPatch,
  dateRangeError,
  emptyFormValues,
  formValuesFromReservation,
  toCreateInput,
  toRentalUnitOptions,
  toReservationQuery,
  toUnitNames,
} from './reservationModel';

const reservation: Reservation = {
  id: '33333333-3333-4333-8333-333333333333',
  rentalUnitId: '11111111-1111-4111-8111-111111111111',
  guestName: 'Jane Doe',
  startDate: '2026-03-12',
  endDate: '2026-03-15',
  status: 'confirmed',
  createdAt: '2026-02-01T09:30:00.000Z',
  updatedAt: '2026-02-01T09:30:00.000Z',
};

const unit = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Seaside flat',
} as RentalUnit;

describe('buildReservationPatch', () => {
  it('returns null when nothing changed, so no request is sent', () => {
    // `PATCH {}` is a deliberate 400: an untouched form must produce no request at all.
    expect(buildReservationPatch(reservation, formValuesFromReservation(reservation))).toBeNull();
  });

  it('sends only the fields that changed', () => {
    const values = { ...formValuesFromReservation(reservation), endDate: '2026-03-18' };
    expect(buildReservationPatch(reservation, values)).toEqual({ endDate: '2026-03-18' });
  });

  it('never patches rentalUnitId, even when the value differs', () => {
    // `updateReservationSchema` omits it: moving a booking between properties is a
    // cancel-and-rebook, because it silently relocates the stay's conflict domain.
    const values = {
      ...formValuesFromReservation(reservation),
      rentalUnitId: '22222222-2222-4222-8222-222222222222',
    };
    expect(buildReservationPatch(reservation, values)).toBeNull();
  });

  it('trims the guest name before comparing, so whitespace is not a change', () => {
    const values = { ...formValuesFromReservation(reservation), guestName: '  Jane Doe  ' };
    expect(buildReservationPatch(reservation, values)).toBeNull();
  });
});

describe('toCreateInput', () => {
  it('trims the guest name', () => {
    const values = { ...formValuesFromReservation(reservation), guestName: '  Sam Patel ' };
    expect(toCreateInput(values).guestName).toBe('Sam Patel');
  });

  it('starts blank, with every field present so the inputs stay controlled', () => {
    expect(emptyFormValues()).toEqual({
      rentalUnitId: '',
      guestName: '',
      startDate: '',
      endDate: '',
    });
    expect(emptyFormValues(unit.id).rentalUnitId).toBe(unit.id);
  });
});

describe('toReservationQuery', () => {
  it('omits absent filters rather than sending them as null', () => {
    // The object doubles as the cache key: `{ from: null }` and `{}` are the same request
    // but hash differently, which would split one list across two cache entries.
    expect(toReservationQuery(initialReservationFilters, 10)).toEqual({
      status: 'confirmed',
      page: 1,
      limit: 10,
    });
  });

  it('carries every applied filter through', () => {
    expect(
      toReservationQuery(
        {
          rentalUnitId: unit.id,
          from: '2026-03-01',
          to: '2026-04-01',
          status: 'cancelled',
          page: 3,
        },
        10,
      ),
    ).toEqual({
      rentalUnitId: unit.id,
      from: '2026-03-01',
      to: '2026-04-01',
      status: 'cancelled',
      page: 3,
      limit: 10,
    });
  });
});

describe('dateRangeError', () => {
  it('accepts a partial or ordered window', () => {
    expect(dateRangeError(null, null)).toBeUndefined();
    expect(dateRangeError('2026-03-01', null)).toBeUndefined();
    expect(dateRangeError('2026-03-01', '2026-03-02')).toBeUndefined();
  });

  it('rejects an inverted or empty window before it can 400', () => {
    expect(dateRangeError('2026-04-01', '2026-03-01')).toBeDefined();
    expect(dateRangeError('2026-03-01', '2026-03-01')).toBeDefined();
  });
});

describe('rental unit lookups', () => {
  it('maps units to options and to a name lookup', () => {
    expect(toRentalUnitOptions([unit])).toEqual([{ value: unit.id, label: 'Seaside flat' }]);
    expect(toUnitNames([unit])[unit.id]).toBe('Seaside flat');
  });
});
