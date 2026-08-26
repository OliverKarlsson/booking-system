import { create } from 'zustand';
import { createFiltersSlice } from './filtersSlice';
import { createUiSlice } from './uiSlice';
import type { BookingStore } from './types';

/**
 * Builds a fresh, isolated store.
 *
 * Exported so tests get their own instance instead of resetting a module-level
 * singleton between cases — shared mutable state is the usual source of order-dependent
 * store tests.
 */
export const createBookingStore = () =>
  create<BookingStore>()((...args) => ({
    ...createFiltersSlice(...args),
    ...createUiSlice(...args),
  }));

/** The application's store. */
export const useBookingStore = createBookingStore();

/*
 * Selector hooks. Components should subscribe through these rather than pulling the
 * whole store, so a modal opening does not re-render the filter bar. Each returns a
 * stable reference (a slice of state or an action), never a freshly built object —
 * a selector that constructs one re-renders on every store update.
 */
export const useReservationFilters = () => useBookingStore((state) => state.filters);
export const useActiveModal = () => useBookingStore((state) => state.activeModal);
export const useEditingId = () => useBookingStore((state) => state.editingId);

export { createFiltersSlice, initialReservationFilters } from './filtersSlice';
export type { FiltersSlice, ReservationFilters, ReservationStatusFilter } from './filtersSlice';
export { createUiSlice } from './uiSlice';
export type { UiSlice, ModalName } from './uiSlice';
export type { BookingStore } from './types';
