import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  CreateReservationInput,
  Paginated,
  RentalUnit,
  Reservation,
  UpdateReservationInput,
} from '@booking/shared';
import { apiClient } from '@/lib/apiClient';
import { invalidatedByReservationWrite, queryKeys } from '@/lib/queryKeys';
import type { ReservationQueryParams } from './reservationModel';

/**
 * Server state for reservations. Every network call goes through `apiClient`, every cache
 * key comes from the shared `queryKeys` factory — a hand-written key array here would be
 * invisible to the prefix-based invalidation the mutations rely on.
 */

const RESERVATIONS_PATH = '/reservations';
const RENTAL_UNITS_PATH = '/rental-units';

/** Ten rows fit the list without scrolling; the API's own default is 20 (§3.5). */
export const RESERVATIONS_PAGE_SIZE = 10;

/** §3.5 caps `limit` at 100. The unit picker wants them all, so it asks for the cap. */
const RENTAL_UNIT_OPTIONS_LIMIT = 100;

export function useReservations(params: ReservationQueryParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reservations.list(params),
    queryFn: ({ signal }) =>
      apiClient.get<Paginated<Reservation>>(RESERVATIONS_PATH, { query: { ...params }, signal }),
    enabled,
    // Paging keeps the previous page on screen while the next one loads. Without it the
    // list unmounts into a spinner on every click, which reads as the page breaking.
    placeholderData: keepPreviousData,
  });
}

export function useReservation(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.reservations.detail(id ?? ''),
    queryFn: ({ signal }) => apiClient.get<Reservation>(`${RESERVATIONS_PATH}/${id}`, { signal }),
    enabled: Boolean(id),
  });
}

/**
 * The rental units, for the filter bar's picker and the create form's required
 * `rentalUnitId`.
 *
 * Fetched here rather than imported from `features/rentalUnits/api.ts` so the two feature
 * modules stay independently ownable — but it is keyed under `queryKeys.rentalUnits`, so
 * the two hooks share one cache entry whenever their parameters match and a unit write
 * invalidates both. The overlap with `useRentalUnits` is a known, deliberate duplication
 * for Wave 4 to dedupe; what would *not* be safe is a second cache key for the same data.
 */
export function useRentalUnitOptions() {
  const query = { page: 1, limit: RENTAL_UNIT_OPTIONS_LIMIT } as const;

  return useQuery({
    queryKey: queryKeys.rentalUnits.list(query),
    queryFn: ({ signal }) =>
      apiClient.get<Paginated<RentalUnit>>(RENTAL_UNITS_PATH, { query: { ...query }, signal }),
  });
}

/**
 * Invalidates everything a reservation write makes stale.
 *
 * The set is imported rather than listed here, and that matters more than it looks: a new
 * booking changes the **dashboard's** occupancy too, and a feature module editing
 * reservations is exactly the place where that cross-feature coupling gets forgotten.
 * `invalidatedByReservationWrite` bundles the dashboard in so every mutation below gets
 * it right identically — which is what makes a new booking show up on the landing page
 * without a manual refresh.
 */
function useInvalidateReservationWrites() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      invalidatedByReservationWrite.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
}

/**
 * Creates a reservation. A 409 `BOOKING_CONFLICT` is an expected outcome here, not a
 * failure of the request — the caller narrows it with `isBookingConflict` and renders the
 * conflicting guest and dates on the form.
 */
export function useCreateReservation(): UseMutationResult<
  Reservation,
  unknown,
  CreateReservationInput
> {
  const invalidate = useInvalidateReservationWrites();

  return useMutation({
    mutationFn: (input: CreateReservationInput) =>
      apiClient.post<Reservation>(RESERVATIONS_PATH, input),
    onSuccess: invalidate,
  });
}

export interface UpdateReservationVariables {
  id: string;
  patch: UpdateReservationInput;
}

/** Edits a reservation. The server re-checks overlap, excluding the row itself (§3.6). */
export function useUpdateReservation(): UseMutationResult<
  Reservation,
  unknown,
  UpdateReservationVariables
> {
  const invalidate = useInvalidateReservationWrites();

  return useMutation({
    mutationFn: ({ id, patch }: UpdateReservationVariables) =>
      apiClient.patch<Reservation>(`${RESERVATIONS_PATH}/${id}`, patch),
    onSuccess: invalidate,
  });
}

/**
 * Cancels a reservation.
 *
 * `DELETE` sets `status: 'cancelled'` rather than removing the row (§3.6): history is
 * preserved, and the cancelled stay stops blocking its dates because the exclusion
 * constraint only indexes confirmed rows. That is why cancelling has to invalidate the
 * same set as a booking — it frees a slot exactly as much as a create fills one.
 */
export function useCancelReservation(): UseMutationResult<void, unknown, string> {
  const invalidate = useInvalidateReservationWrites();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`${RESERVATIONS_PATH}/${id}`),
    onSuccess: invalidate,
  });
}
