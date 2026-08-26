import { useBookingStore, useReservationFilters } from '@/store';
import { RESERVATIONS_PAGE_SIZE, useRentalUnitOptions, useReservations } from './api';
import { ReservationFilterBar } from './ReservationFilterBar';
import { ReservationListView } from './ReservationListView';
import { toErrorMessage } from './errorMessage';
import {
  dateRangeError,
  toRentalUnitOptions,
  toReservationQuery,
  toUnitNames,
} from './reservationModel';

/**
 * Fetches the filtered reservation list and hands it to the views.
 *
 * The filters and the page number live in the Zustand `filtersSlice` rather than in local
 * state, because they are genuinely shared client state: opening a reservation, booking a
 * new one, and coming back should land on the same filtered view the user left. The
 * *data* is never in the store — that is TanStack Query's job, and a copy in Zustand
 * would go stale the moment anything else refetched.
 *
 * Each action is selected individually. A selector returning a freshly built object
 * (`state => ({ setPage, setStatusFilter })`) is a new reference on every store update
 * and would re-render this tree whenever any unrelated slice changed.
 */
export function ReservationList() {
  const filters = useReservationFilters();
  const setRentalUnitFilter = useBookingStore((state) => state.setRentalUnitFilter);
  const setDateRange = useBookingStore((state) => state.setDateRange);
  const setStatusFilter = useBookingStore((state) => state.setStatusFilter);
  const setPage = useBookingStore((state) => state.setPage);
  const resetFilters = useBookingStore((state) => state.resetFilters);
  const openModal = useBookingStore((state) => state.openModal);

  const rangeError = dateRangeError(filters.from, filters.to);

  // An inverted window is a guaranteed 400, so the request is not made at all: the list
  // keeps showing the last good result while the inline error explains why it has not
  // changed. Firing it anyway would replace the list with an error banner mid-typing.
  const query = useReservations(
    toReservationQuery(filters, RESERVATIONS_PAGE_SIZE),
    rangeError === undefined,
  );

  const unitsQuery = useRentalUnitOptions();
  const units = unitsQuery.data?.data ?? [];

  const isFiltered =
    filters.rentalUnitId !== null ||
    filters.from !== null ||
    filters.to !== null ||
    filters.status !== 'confirmed';

  return (
    <div className="flex flex-col gap-4">
      <ReservationFilterBar
        filters={filters}
        rentalUnits={toRentalUnitOptions(units)}
        dateRangeError={rangeError}
        onRentalUnitChange={setRentalUnitFilter}
        onDateRangeChange={setDateRange}
        onStatusChange={setStatusFilter}
        onReset={resetFilters}
      />

      <ReservationListView
        reservations={query.data?.data ?? []}
        unitNames={toUnitNames(units)}
        pagination={query.data?.pagination}
        // `isPending` stays true while the query is disabled, which would otherwise show a
        // spinner forever on an invalid date window.
        isLoading={query.isPending && rangeError === undefined}
        isError={query.isError}
        errorMessage={query.error ? toErrorMessage(query.error) : undefined}
        isFiltered={isFiltered}
        onRetry={() => void query.refetch()}
        onPageChange={setPage}
        onCreate={() => openModal('createReservation')}
        onEdit={(id) => openModal('editReservation', id)}
        onCancel={(id) => openModal('cancelReservation', id)}
      />
    </div>
  );
}
