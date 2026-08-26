import { Link } from 'react-router-dom';
import type { PaginationMeta, RentalUnit } from '@booking/shared';
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, ErrorBanner, Pagination, Spinner } from '@/components/ui';
import { formatTimestamp } from '@/lib/formatDate';
import { formatAddress } from './rentalUnitModel';

export interface RentalUnitListViewProps {
  units: RentalUnit[];
  pagination?: PaginationMeta;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry: () => void;
  onPageChange: (page: number) => void;
  onCreate: () => void;
  onEdit: (id: string) => void;
}

/**
 * The rental unit list, as pure markup.
 *
 * It receives the three states a list can be in as flags rather than deriving them, so
 * every one of them — loading, failed, empty — is reachable in a test by passing props,
 * with no query client, no router data loading, and no mocked network.
 */
export function RentalUnitListView({
  units,
  pagination,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  onPageChange,
  onCreate,
  onEdit,
}: RentalUnitListViewProps) {
  if (isError) {
    return (
      <ErrorBanner
        title="Could not load rental units"
        message={errorMessage ?? 'The list could not be loaded.'}
        onRetry={onRetry}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" label="Loading rental units" />
      </div>
    );
  }

  if (units.length === 0) {
    return (
      <EmptyState
        title="No rental units yet"
        description="Add the first property to start taking bookings for it."
        // The empty list is the best place to offer the action that fills it.
        action={<Button onClick={onCreate}>Add rental unit</Button>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid gap-4 sm:grid-cols-2" aria-label="Rental units">
        {units.map((unit) => (
          <li key={unit.id}>
            <Card className="h-full">
              <CardHeader
                title={
                  <Link
                    to={`/units/${unit.id}`}
                    className="text-ink-900 hover:text-accent-600 hover:underline"
                  >
                    {unit.name}
                  </Link>
                }
                subtitle={formatAddress(unit.address) ?? 'No address recorded'}
                actions={
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onEdit(unit.id)}
                    aria-label={`Edit ${unit.name}`}
                  >
                    Edit
                  </Button>
                }
              />
              <CardBody className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone="accent">{unit.timezone}</Badge>
                {/* `createdAt` is an instant, not a calendar date, so rendering it in the
                    viewer's own zone is correct here — the opposite of what a reservation
                    date needs (§3.1). */}
                <span className="text-xs text-ink-500">
                  Added {formatTimestamp(unit.createdAt)}
                </span>
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>

      {pagination ? (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          onPageChange={onPageChange}
          itemLabel="rental units"
        />
      ) : null}
    </div>
  );
}
