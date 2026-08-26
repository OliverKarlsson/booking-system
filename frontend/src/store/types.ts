import type { FiltersSlice } from './filtersSlice';
import type { UiSlice } from './uiSlice';

/**
 * The whole client-side store.
 *
 * Client state *only* — filters, selection, and modal/editing state. Rental units,
 * reservations, and dashboard rows are server state and belong to TanStack Query;
 * copying them in here would mean hand-rolling refetching, invalidation and staleness,
 * and then writing tests against that reimplementation instead of against the cache
 * that already solves it.
 */
export type BookingStore = FiltersSlice & UiSlice;
