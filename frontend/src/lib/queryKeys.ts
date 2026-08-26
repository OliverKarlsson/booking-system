/**
 * The single source of truth for TanStack Query cache keys.
 *
 * Every hook builds its key here rather than inlining an array literal, because
 * invalidation is prefix-based: `invalidateQueries({ queryKey: queryKeys.reservations.all })`
 * only clears every reservation list and detail if all of them were built from that
 * same prefix. One hand-written `['reservations', filters]` somewhere is enough to
 * leave a stale list on screen after a successful write.
 *
 * The hierarchy is deliberate — `all` → `lists()` → `list(filters)` — so a mutation can
 * choose how wide to invalidate: a create clears the lists, an edit of one reservation
 * can clear just that detail plus the lists.
 */

/** Filters are passed through structurally; the key is the filter object itself. */
export type QueryFilters = Record<string, unknown> | undefined;

export const queryKeys = {
  rentalUnits: {
    all: ['rentalUnits'] as const,
    lists: () => [...queryKeys.rentalUnits.all, 'list'] as const,
    list: (filters?: QueryFilters) => [...queryKeys.rentalUnits.lists(), filters ?? {}] as const,
    details: () => [...queryKeys.rentalUnits.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.rentalUnits.details(), id] as const,
  },

  reservations: {
    all: ['reservations'] as const,
    lists: () => [...queryKeys.reservations.all, 'list'] as const,
    list: (filters?: QueryFilters) => [...queryKeys.reservations.lists(), filters ?? {}] as const,
    details: () => [...queryKeys.reservations.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.reservations.details(), id] as const,
  },

  dashboard: {
    // The dashboard takes no parameters at all — "today" is resolved per unit by the
    // server in that unit's own timezone (§3.7), so there is nothing to key on.
    all: ['dashboard'] as const,
    list: () => [...queryKeys.dashboard.all, 'list'] as const,
  },
} as const;

/**
 * What a successful reservation write must invalidate.
 *
 * Booking, editing, or cancelling changes occupancy, so the dashboard is stale too —
 * and that cross-feature coupling is exactly the thing an individual feature agent
 * would forget. Naming it once here means every mutation gets it right by calling the
 * same helper.
 */
export const invalidatedByReservationWrite = [
  queryKeys.reservations.all,
  queryKeys.dashboard.all,
] as const;

/**
 * What a successful rental-unit write must invalidate: the unit lists and the
 * dashboard, which renders one row per active unit.
 */
export const invalidatedByRentalUnitWrite = [
  queryKeys.rentalUnits.all,
  queryKeys.dashboard.all,
] as const;
