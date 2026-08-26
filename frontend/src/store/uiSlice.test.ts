import { beforeEach, describe, expect, it } from 'vitest';
import { createBookingStore, initialReservationFilters } from './index';

type Store = ReturnType<typeof createBookingStore>;

describe('uiSlice', () => {
  let store: Store;

  beforeEach(() => {
    store = createBookingStore();
  });

  it('starts with no modal open and nothing being edited', () => {
    expect(store.getState().activeModal).toBeNull();
    expect(store.getState().editingId).toBeNull();
  });

  it('opens a create modal with no editing id', () => {
    store.getState().openModal('createReservation');
    expect(store.getState().activeModal).toBe('createReservation');
    expect(store.getState().editingId).toBeNull();
  });

  it('opens an edit modal carrying the record id', () => {
    store.getState().openModal('editReservation', 'res-1');
    expect(store.getState().activeModal).toBe('editReservation');
    expect(store.getState().editingId).toBe('res-1');
  });

  it('closing clears the editing id as well as the modal', () => {
    store.getState().openModal('editReservation', 'res-1');
    store.getState().closeModal();

    expect(store.getState().activeModal).toBeNull();
    // A leftover id would be picked up by the next modal opened without one.
    expect(store.getState().editingId).toBeNull();
  });

  it('opening a create modal after an edit modal drops the previous editing id', () => {
    store.getState().openModal('editReservation', 'res-1');
    store.getState().openModal('createReservation');

    expect(store.getState().activeModal).toBe('createReservation');
    expect(store.getState().editingId).toBeNull();
  });

  it('only one modal is open at a time', () => {
    store.getState().openModal('createReservation');
    store.getState().openModal('cancelReservation', 'res-2');

    expect(store.getState().activeModal).toBe('cancelReservation');
    expect(store.getState().editingId).toBe('res-2');
  });

  it('leaves filters alone', () => {
    store.getState().setPage(3);
    store.getState().openModal('editRentalUnit', 'unit-1');
    store.getState().closeModal();

    expect(store.getState().filters.page).toBe(3);
    expect(store.getState().filters.status).toBe(initialReservationFilters.status);
  });
});
