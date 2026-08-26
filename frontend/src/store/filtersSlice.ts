import type { StateCreator } from 'zustand';
import type { BookingStore } from './types';

export type ReservationStatusFilter = 'confirmed' | 'cancelled';

/**
 * The reservation list's filters, mirroring the `GET /v1/reservations` query params
 * of contract §3.6.
 *
 * `from` and `to` are `YYYY-MM-DD` strings and stay strings — they are handed straight
 * to the query string and never parsed into a `Date` (§3.7). `null` means "no bound",
 * which is why these are `string | null` rather than `''`: an empty string would be
 * serialised into the URL as `from=` and rejected as a malformed date.
 */
export interface ReservationFilters {
  /** `null` = all units. */
  rentalUnitId: string | null;
  /** Inclusive start of the window, `YYYY-MM-DD`, or `null`. */
  from: string | null;
  /** End of the window, `YYYY-MM-DD`, or `null`. */
  to: string | null;
  /** The API defaults to `confirmed`; the UI states it explicitly so the control matches. */
  status: ReservationStatusFilter;
  /** 1-based, per §3.5. */
  page: number;
}

export const initialReservationFilters: ReservationFilters = {
  rentalUnitId: null,
  from: null,
  to: null,
  status: 'confirmed',
  page: 1,
};

export interface FiltersSlice {
  filters: ReservationFilters;
  setRentalUnitFilter: (rentalUnitId: string | null) => void;
  setDateRange: (from: string | null, to: string | null) => void;
  setStatusFilter: (status: ReservationStatusFilter) => void;
  setPage: (page: number) => void;
  resetFilters: () => void;
}

export const createFiltersSlice: StateCreator<BookingStore, [], [], FiltersSlice> = (set) => ({
  filters: initialReservationFilters,

  // Every filter change resets to page 1. Without it, narrowing a filter while on
  // page 3 requests a page that no longer exists and the list renders empty — which
  // reads as "no reservations match" rather than "you are past the end".
  setRentalUnitFilter: (rentalUnitId) =>
    set((state) => ({ filters: { ...state.filters, rentalUnitId, page: 1 } })),

  setDateRange: (from, to) => set((state) => ({ filters: { ...state.filters, from, to, page: 1 } })),

  setStatusFilter: (status) => set((state) => ({ filters: { ...state.filters, status, page: 1 } })),

  // Pages are 1-based (§3.5), so clamp rather than trusting a caller's arithmetic.
  setPage: (page) =>
    set((state) => ({ filters: { ...state.filters, page: Math.max(1, Math.floor(page)) } })),

  resetFilters: () => set({ filters: initialReservationFilters }),
});
