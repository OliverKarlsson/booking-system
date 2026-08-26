import { Card, CardBody } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { DashboardSummaryCounts } from './dashboardModel';

export interface DashboardSummaryProps {
  counts: DashboardSummaryCounts;
}

interface Tile {
  label: string;
  value: number;
  valueClassName?: string;
}

/**
 * The portfolio at a glance, above the per-unit cards.
 *
 * A `<dl>` rather than four styled `<div>`s: each tile genuinely is a term and its value,
 * so the markup says so and a screen reader reads "Occupied, 2" instead of two loose
 * numbers.
 */
export function DashboardSummary({ counts }: DashboardSummaryProps) {
  const tiles: Tile[] = [
    { label: 'Rental units', value: counts.units },
    { label: 'Occupied', value: counts.occupied, valueClassName: 'text-success-600' },
    { label: 'Vacant', value: counts.vacant },
    { label: 'Upcoming arrivals', value: counts.arrivalsBooked },
  ];

  return (
    <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Portfolio summary">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardBody className="py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">
              {tile.label}
            </dt>
            <dd className={cn('mt-1 text-2xl font-semibold text-ink-900', tile.valueClassName)}>
              {tile.value}
            </dd>
          </CardBody>
        </Card>
      ))}
    </dl>
  );
}
