import type { PaginationMeta, Reservation } from '@booking/shared';
import { Badge, Card, CardBody, CardHeader, EmptyState, ErrorBanner, Pagination, Spinner } from '@/components/ui';
import { formatDateRange, formatNights } from '@/lib/formatDate';

export interface RentalUnitReservationsViewProps {
  reservations: Reservation[];
  pagination?: PaginationMeta;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry: () => void;
  onPageChange: (page: number) => void;
}

/**
 * The confirmed bookings for one unit.
 *
 * Dates come straight from the API as `YYYY-MM-DD` and are formatted from the string
 * (§3.7) — no `Date` is constructed, so `2026-03-26` reads as 26 March for a viewer in
 * Los Angeles exactly as it does for one in Stockholm. The checkout date is shown as
 * stored: the interval is half-open, so it is the day the guest leaves, not their last
 * night.
 */
export function RentalUnitReservationsView({
  reservations,
  pagination,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  onPageChange,
}: RentalUnitReservationsViewProps) {
  return (
    <Card>
      <CardHeader title="Reservations" subtitle="Confirmed bookings for this unit" />
      <CardBody className="flex flex-col gap-4">
        {isError ? (
          <ErrorBanner
            title="Could not load reservations"
            message={errorMessage ?? 'The reservations for this unit could not be loaded.'}
            onRetry={onRetry}
          />
        ) : null}

        {!isError && isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner label="Loading reservations" />
          </div>
        ) : null}

        {!isError && !isLoading && reservations.length === 0 ? (
          <EmptyState
            title="No confirmed reservations"
            description="This unit is free for every date."
            className="border-0 py-8"
          />
        ) : null}

        {!isError && !isLoading && reservations.length > 0 ? (
          <ul className="divide-y divide-ink-200" aria-label="Reservations">
            {reservations.map((reservation) => (
              <li
                key={reservation.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">
                    {reservation.guestName}
                  </p>
                  <p className="text-sm text-ink-500">
                    {formatDateRange(reservation.startDate, reservation.endDate)} ·{' '}
                    {formatNights(reservation.startDate, reservation.endDate)}
                  </p>
                </div>
                <Badge tone={reservation.status === 'confirmed' ? 'success' : 'neutral'}>
                  {reservation.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}

        {pagination ? (
          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={onPageChange}
            itemLabel="reservations"
          />
        ) : null}
      </CardBody>
    </Card>
  );
}
