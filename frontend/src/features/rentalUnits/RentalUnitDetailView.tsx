import type { ReactNode } from 'react';
import type { RentalUnit } from '@booking/shared';
import { Badge, Button, Card, CardBody, CardHeader, ErrorBanner, Spinner } from '@/components/ui';
import { formatTimestamp } from '@/lib/formatDate';
import { formatAddress } from './rentalUnitModel';

export interface RentalUnitDetailViewProps {
  unit?: RentalUnit;
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
  onRetry: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting?: boolean;
  deleteErrorMessage?: string;
  /** The unit's reservations, composed in by the container. */
  children?: ReactNode;
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
      <dt className="w-32 shrink-0 text-sm text-ink-500">{label}</dt>
      <dd className="min-w-0 text-sm text-ink-900">{children}</dd>
    </div>
  );
}

/** Unit information and its reservations. Props in, markup out. */
export function RentalUnitDetailView({
  unit,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  onEdit,
  onDelete,
  isDeleting = false,
  deleteErrorMessage,
  children,
}: RentalUnitDetailViewProps) {
  if (isError) {
    return (
      <ErrorBanner
        title="Could not load this rental unit"
        message={errorMessage ?? 'The unit could not be loaded.'}
        onRetry={onRetry}
      />
    );
  }

  if (isLoading || !unit) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" label="Loading rental unit" />
      </div>
    );
  }

  const address = formatAddress(unit.address);

  return (
    <div className="flex flex-col gap-6">
      {deleteErrorMessage ? (
        <ErrorBanner title="Could not delete this rental unit" message={deleteErrorMessage} />
      ) : null}

      <Card>
        <CardHeader
          title={unit.name}
          subtitle={address ?? 'No address recorded'}
          actions={
            <>
              <Button variant="secondary" size="sm" onClick={onEdit}>
                Edit
              </Button>
              <Button variant="danger" size="sm" onClick={onDelete} loading={isDeleting}>
                Delete
              </Button>
            </>
          }
        />
        <CardBody>
          <dl className="divide-y divide-ink-200">
            <DetailRow label="Timezone">
              <Badge tone="accent">{unit.timezone}</Badge>
            </DetailRow>
            <DetailRow label="Status">
              <Badge tone={unit.status === 'active' ? 'success' : 'neutral'}>
                {unit.status === 'active' ? 'Active' : 'Deleted'}
              </Badge>
            </DetailRow>
            <DetailRow label="Identifier">
              <span className="break-all font-mono text-xs text-ink-600">{unit.id}</span>
            </DetailRow>
            {/* Timestamps are instants (§3.1), so the viewer's local rendering is right. */}
            <DetailRow label="Created">{formatTimestamp(unit.createdAt)}</DetailRow>
            <DetailRow label="Updated">{formatTimestamp(unit.updatedAt)}</DetailRow>
          </dl>
        </CardBody>
      </Card>

      {children}
    </div>
  );
}
