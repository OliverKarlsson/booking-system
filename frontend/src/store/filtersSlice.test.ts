import { beforeEach, describe, expect, it } from 'vitest';
import { createBookingStore, initialReservationFilters } from './index';

type Store = ReturnType<typeof createBookingStore>;

describe('filtersSlice', () => {
  let store: Store;

  beforeEach(() => {
    store = createBookingStore();
  });

  const filters = () => store.getState().filters;

  it('starts with no unit selected, no date bounds, and confirmed reservations on page 1', () => {
    expect(filters()).toEqual(initialReservationFilters);
    expect(filters().status).toBe('confirmed');
    expect(filters().page).toBe(1);
  });

  it('selects a rental unit and clears it again', () => {
    store.getState().setRentalUnitFilter('11111111-1111-4111-8111-111111111111');
    expect(filters().rentalUnitId).toBe('11111111-1111-4111-8111-111111111111');

    store.getState().setRentalUnitFilter(null);
    expect(filters().rentalUnitId).toBeNull();
  });

  it('stores the date range as YYYY-MM-DD strings, untouched', () => {
    store.getState().setDateRange('2026-03-26', '2026-03-29');

    // The exact strings the API sent and the API expects back — no parsing, no
    // reformatting, no Date object anywhere in between (§3.7).
    expect(filters().from).toBe('2026-03-26');
    expect(filters().to).toBe('2026-03-29');
  });

  it('supports an open-ended range', () => {
    store.getState().setDateRange('2026-03-26', null);
    expect(filters().from).toBe('2026-03-26');
    expect(filters().to).toBeNull();
  });

  it('switches the status filter', () => {
    store.getState().setStatusFilter('cancelled');
    expect(filters().status).toBe('cancelled');
  });

  it('resets to page 1 whenever a filter changes', () => {
    store.getState().setPage(4);
    store.getState().setRentalUnitFilter('unit-a');
    expect(filters().page).toBe(1);

    store.getState().setPage(4);
    store.getState().setDateRange('2026-01-01', '2026-02-01');
    expect(filters().page).toBe(1);

    store.getState().setPage(4);
    store.getState().setStatusFilter('cancelled');
    expect(filters().page).toBe(1);
  });

  it('clamps page numbers to the 1-based range of the list envelope', () => {
    store.getState().setPage(0);
    expect(filters().page).toBe(1);

    store.getState().setPage(-3);
    expect(filters().page).toBe(1);

    store.getState().setPage(2.7);
    expect(filters().page).toBe(2);
  });

  it('paginates without disturbing the other filters', () => {
    store.getState().setRentalUnitFilter('unit-a');
    store.getState().setDateRange('2026-03-01', '2026-04-01');
    store.getState().setPage(3);

    expect(filters()).toEqual({
      rentalUnitId: 'unit-a',
      from: '2026-03-01',
      to: '2026-04-01',
      status: 'confirmed',
      page: 3,
    });
  });

  it('resetFilters restores every field at once', () => {
    store.getState().setRentalUnitFilter('unit-a');
    store.getState().setDateRange('2026-03-01', '2026-04-01');
    store.getState().setStatusFilter('cancelled');
    store.getState().setPage(5);

    store.getState().resetFilters();

    expect(filters()).toEqual(initialReservationFilters);
  });

  it('replaces the filters object rather than mutating it, so subscribers re-render', () => {
    const before = filters();
    store.getState().setPage(2);
    expect(filters()).not.toBe(before);
    expect(before.page).toBe(1);
  });

  it('leaves ui state alone', () => {
    store.getState().openModal('createReservation');
    store.getState().resetFilters();
    expect(store.getState().activeModal).toBe('createReservation');
  });
});
