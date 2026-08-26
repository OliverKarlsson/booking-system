import type { PaginationMeta, Reservation } from '@booking/shared';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorBanner,
  Pagination,
  Spinner,
} from '@/components/ui';
import { formatDateRange, formatNights } from '@/lib/formatDate';

export interface ReservationListViewProps {
  reservations: Reservation[];
  /** Unit id → name, for the row subtitle. A missing id renders a neutral fallback. */
  unitNames: Record<string, string>;
  pagination?: PaginationMeta;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  /** True when a filter is applied, so "nothing here" can say which kind of nothing. */
  isFiltered: boolean;
  onRetry: () => void;
  onPageChange: (page: number) => void;
  onCreate: () => void;
  onEdit: (id: string) => void;
  onCancel: (id: string) => void;
}

/**
 * The reservation list, as pure markup.
 *
 * It receives the states a list can be in as flags rather than deriving them, so every
 * one of them — loading, failed, empty, empty-because-filtered — is reachable in a test
 * by passing props, with no query client and no mocked network.
 *
 * Dates are formatted from the `YYYY-MM-DD` strings directly (§3.7): no `Date` is
 * constructed, so a stay on the 26th reads as the 26th in Los Angeles exactly as it does
 * in Stockholm. The checkout date is shown as stored — the interval is half-open, so it
 * is the day the guest leaves rather than their last night.
 */
export function ReservationListView({
  reservations,
  unitNames,
  pagination,
  isLoading,
  isError,
  errorMessage,
  isFiltered,
  onRetry,
  onPageChange,
  onCreate,
  onEdit,
  onCancel,
}: ReservationListViewProps) {
  if (isError) {
    return (
      <ErrorBanner
        title="Could not load reservations"
        message={errorMessage ?? 'The list could not be loaded.'}
        onRetry={onRetry}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" label="Loading reservations" />
      </div>
    );
  }

  if (reservations.length === 0) {
    return isFiltered ? (
      <EmptyState
        title="No reservations match these filters"
        description="Try widening the date window, or clearing the filters."
      />
    ) : (
      <EmptyState
        title="No reservations yet"
        description="Book the first stay to see it here and on the dashboard."
        action={<Button onClick={onCreate}>New reservation</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <ul className="divide-y divide-ink-200" aria-label="Reservations">
          {reservations.map((reservation) => {
            const isConfirmed = reservation.status === 'confirmed';

            return (
              <li key={reservation.id}>
                <CardBody className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-900">
                      {reservation.guestName}
                    </p>
                    <p className="text-sm text-ink-500">
                      {formatDateRange(reservation.startDate, reservation.endDate)} ·{' '}
                      {formatNights(reservation.startDate, reservation.endDate)}
                    </p>
                    <p className="text-xs text-ink-500">
                      {unitNames[reservation.rentalUnitId] ?? 'Unknown rental unit'}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={isConfirmed ? 'success' : 'neutral'}>
                      {isConfirmed ? 'Confirmed' : 'Cancelled'}
                    </Badge>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onEdit(reservation.id)}
                      aria-label={`Edit ${reservation.guestName}`}
                    >
                      Edit
                    </Button>
                    {/*
                      Only a confirmed stay can be cancelled: `DELETE` on an already
                      cancelled one is a no-op the user would read as having done
                      something. The row keeps its Edit button either way, since renaming
                      a cancelled booking is legal and cannot conflict.
                    */}
                    {isConfirmed ? (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => onCancel(reservation.id)}
                        aria-label={`Cancel ${reservation.guestName}`}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </CardBody>
              </li>
            );
          })}
        </ul>
      </Card>

      {pagination ? (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onPageChange={onPageChange}
          itemLabel="reservations"
        />
      ) : null}
    </div>
  );
}
