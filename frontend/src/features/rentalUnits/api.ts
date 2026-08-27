import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import type {
  CreateRentalUnitInput,
  Paginated,
  RentalUnit,
  Reservation,
  UpdateRentalUnitInput,
} from '@booking/shared';
import { apiClient } from '@/lib/apiClient';
import { invalidatedByRentalUnitWrite, queryKeys } from '@/lib/queryKeys';

/**
 * Server state for rental units. Every network call goes through `apiClient`, every cache
 * key comes from the shared `queryKeys` factory — a hand-written key array here would be
 * invisible to the prefix-based invalidation the mutations rely on.
 */

const RENTAL_UNITS_PATH = '/rental-units';
const RESERVATIONS_PATH = '/reservations';

/** Ten fits a card grid without scrolling; the API's own default is 20 (§3.5). */
export const RENTAL_UNITS_PAGE_SIZE = 10;
export const UNIT_RESERVATIONS_PAGE_SIZE = 10;

/** §3.5 caps `limit` at 100. A picker wants them all, so it asks for the cap. */
const RENTAL_UNIT_OPTIONS_LIMIT = 100;

export function useRentalUnits(page = 1, limit = RENTAL_UNITS_PAGE_SIZE) {
  return useQuery({
    queryKey: queryKeys.rentalUnits.list({ page, limit }),
    queryFn: ({ signal }) =>
      apiClient.get<Paginated<RentalUnit>>(RENTAL_UNITS_PATH, { query: { page, limit }, signal }),
    // Paging keeps the previous page on screen while the next one loads. Without it the
    // list unmounts into a spinner on every click, which reads as the page breaking.
    placeholderData: keepPreviousData,
  });
}

/**
 * Every rental unit, for a picker — the reservation filter bar's unit selector and the
 * create form's required `rentalUnitId`.
 *
 * A named wrapper rather than a second hook: it is the same request against the same
 * cache key as `useRentalUnits(1, 100)`, so the picker and the unit list share one cache
 * entry and one invalidation. A parallel implementation would have been a second key for
 * identical data, which is how a stale picker survives a successful unit write.
 *
 * The name is kept because the call sites are asking for options, not for page one — and
 * "give me the picker's units" is the thing that should be stable if the cap ever moves.
 */
export function useRentalUnitOptions() {
  return useRentalUnits(1, RENTAL_UNIT_OPTIONS_LIMIT);
}

export function useRentalUnit(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.rentalUnits.detail(id ?? ''),
    queryFn: ({ signal }) => apiClient.get<RentalUnit>(`${RENTAL_UNITS_PATH}/${id}`, { signal }),
    enabled: Boolean(id),
  });
}

/**
 * The reservations belonging to one unit, for the detail page.
 *
 * Keyed under `queryKeys.reservations` rather than under the unit, because these rows
 * *are* reservations: a booking made elsewhere in the app invalidates
 * `queryKeys.reservations.all` and this list has to be included in that sweep. Filing it
 * under the unit's key would leave a stale list here after a successful booking.
 */
export function useRentalUnitReservations(
  rentalUnitId: string | undefined,
  page = 1,
  limit = UNIT_RESERVATIONS_PAGE_SIZE,
) {
  const filters = { rentalUnitId, status: 'confirmed', page, limit } as const;

  return useQuery({
    queryKey: queryKeys.reservations.list(filters),
    queryFn: ({ signal }) =>
      apiClient.get<Paginated<Reservation>>(RESERVATIONS_PATH, { query: { ...filters }, signal }),
    enabled: Boolean(rentalUnitId),
    placeholderData: keepPreviousData,
  });
}

/**
 * Invalidates everything a rental-unit write makes stale.
 *
 * The set is imported rather than listed here: a new unit changes the dashboard too
 * (one row per active unit), and that cross-feature coupling is precisely what a feature
 * module forgets. One shared list means every mutation gets it right identically.
 */
function useInvalidateRentalUnitWrites() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      invalidatedByRentalUnitWrite.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
}

export function useCreateRentalUnit(): UseMutationResult<RentalUnit, unknown, CreateRentalUnitInput> {
  const invalidate = useInvalidateRentalUnitWrites();

  return useMutation({
    mutationFn: (input: CreateRentalUnitInput) =>
      apiClient.post<RentalUnit>(RENTAL_UNITS_PATH, input),
    onSuccess: invalidate,
  });
}

export interface UpdateRentalUnitVariables {
  id: string;
  patch: UpdateRentalUnitInput;
}

export function useUpdateRentalUnit(): UseMutationResult<
  RentalUnit,
  unknown,
  UpdateRentalUnitVariables
> {
  const invalidate = useInvalidateRentalUnitWrites();

  return useMutation({
    mutationFn: ({ id, patch }: UpdateRentalUnitVariables) =>
      apiClient.patch<RentalUnit>(`${RENTAL_UNITS_PATH}/${id}`, patch),
    onSuccess: invalidate,
  });
}

/**
 * Soft-deletes a unit. The API answers 409 `UNIT_HAS_RESERVATIONS` when it still has
 * non-cancelled bookings (§3.6); the caller surfaces that message rather than retrying.
 */
export function useDeleteRentalUnit(): UseMutationResult<void, unknown, string> {
  const invalidate = useInvalidateRentalUnitWrites();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`${RENTAL_UNITS_PATH}/${id}`),
    onSuccess: invalidate,
  });
}
