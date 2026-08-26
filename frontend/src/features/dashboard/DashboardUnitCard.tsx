import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { DashboardEntry } from '@booking/shared';
import { Badge, Card, CardBody, CardFooter, CardHeader } from '@/components/ui';
import { formatDate, formatNights } from '@/lib/formatDate';
import { formatLocality, occupancyBadge, relativeDayLabel } from './dashboardModel';

export interface DashboardUnitCardProps {
  entry: DashboardEntry;
}

interface FieldProps {
  label: string;
  children: ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

/** A guest's name over one line of detail — the same shape for both reservation slots. */
function Guest({ name, detail }: { name: string; detail: string }) {
  return (
    <>
      <p className="truncate text-sm font-medium text-ink-900">{name}</p>
      <p className="text-sm text-ink-500">{detail}</p>
    </>
  );
}

function Nothing({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-500">{children}</p>;
}

/**
 * One rental unit's occupancy, as pure markup.
 *
 * Every date on this card is rendered straight from the `YYYY-MM-DD` string by
 * `formatDate` — no `Date` is constructed, so `2026-03-26` reads as 26 Mar 2026 for a
 * viewer in Los Angeles exactly as it does for one in Stockholm (§3.7). The checkout date
 * is shown as stored: the interval is half-open, so it is the day the guest leaves rather
 * than their last night.
 *
 * The "in 3 days" phrasing next to each date is arithmetic between two dates *of this
 * unit* — its own `localDate` and its own reservation — which is the only comparison §3.7
 * permits. The viewer's clock is never consulted, here or anywhere else on this page.
 */
export function DashboardUnitCard({ entry }: DashboardUnitCardProps) {
  const { rentalUnit, localDate, occupancy, currentReservation, nextCheckIn } = entry;
  const badge = occupancyBadge(occupancy);
  const locality = formatLocality(rentalUnit.address);

  const checkoutIn = currentReservation
    ? relativeDayLabel(localDate, currentReservation.endDate)
    : null;
  const arrivalIn = nextCheckIn ? relativeDayLabel(localDate, nextCheckIn.startDate) : null;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title={
          <Link to={`/units/${rentalUnit.id}`} className="text-ink-900 hover:text-accent-600 hover:underline">
            {rentalUnit.name}
          </Link>
        }
        subtitle={locality ?? 'No address recorded'}
        actions={<Badge tone={badge.tone}>{badge.label}</Badge>}
      />

      <CardBody className="flex-1">
        <dl className="divide-y divide-ink-200">
          <Field label="Current guest">
            {currentReservation ? (
              <Guest
                name={currentReservation.guestName}
                detail={[
                  `Checking out ${formatDate(currentReservation.endDate)}`,
                  checkoutIn,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ) : (
              <Nothing>Nobody staying right now</Nothing>
            )}
          </Field>

          <Field label="Next check-in">
            {nextCheckIn ? (
              <Guest
                name={nextCheckIn.guestName}
                detail={[
                  `Arriving ${formatDate(nextCheckIn.startDate)}`,
                  arrivalIn,
                  formatNights(nextCheckIn.startDate, nextCheckIn.endDate),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              />
            ) : (
              <Nothing>No upcoming reservation</Nothing>
            )}
          </Field>
        </dl>
      </CardBody>

      {/* `localDate` is printed, never compared. It is the date the server evaluated this
          unit against, in the unit's own zone — showing it makes the badge above
          inspectable rather than opaque (§3.6). Reconciling it with the viewer's date is
          exactly the affordance §3.7 forbids. */}
      <CardFooter className="justify-start text-xs text-ink-500">
        As of {formatDate(localDate)} · {rentalUnit.timezone}
      </CardFooter>
    </Card>
  );
}
