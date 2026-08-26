import type { Address, DashboardEntry, Occupancy } from '@booking/shared';
import type { BadgeTone } from '@/components/ui';
import { nightsBetween } from '@/lib/formatDate';

/**
 * The pure, testable half of the dashboard: counting the portfolio, labelling occupancy,
 * and the two short strings the cards render around a date.
 *
 * Kept out of the components so the rules can be asserted directly rather than through a
 * rendered card — and so the one place that does arithmetic on dates (`relativeDayLabel`)
 * is visible on its own instead of buried in JSX.
 */

export interface OccupancyBadge {
  label: string;
  tone: BadgeTone;
}

/**
 * Colour never carries the meaning on its own — the badge always spells the state out,
 * so it survives greyscale, colour-blindness, and a screen reader.
 */
export function occupancyBadge(occupancy: Occupancy): OccupancyBadge {
  return occupancy === 'occupied'
    ? { label: 'Occupied', tone: 'success' }
    : { label: 'Vacant', tone: 'neutral' };
}

export interface DashboardSummaryCounts {
  units: number;
  occupied: number;
  vacant: number;
  /** Units with a known next arrival, whether they are occupied right now or not. */
  arrivalsBooked: number;
}

/**
 * Counts are derived from the entries rather than requested separately: the dashboard
 * response is already the complete set of active units (§3.6 has no pagination on it),
 * so a second source for the same numbers could only ever disagree with the cards below
 * them.
 */
export function summarizeDashboard(entries: DashboardEntry[]): DashboardSummaryCounts {
  let occupied = 0;
  let arrivalsBooked = 0;

  for (const entry of entries) {
    if (entry.occupancy === 'occupied') occupied += 1;
    if (entry.nextCheckIn !== null) arrivalsBooked += 1;
  }

  return {
    units: entries.length,
    occupied,
    vacant: entries.length - occupied,
    arrivalsBooked,
  };
}

/**
 * A short "where is this" line for the card subtitle — `city, country`, falling back to
 * the street when there is no city.
 *
 * Deliberately shorter than a full postal address: on a card grid the subtitle is there
 * to tell two properties apart at a glance, not to be copied into an envelope. Returns
 * `undefined` when there is nothing to show so the caller can omit the line rather than
 * render an empty one.
 */
export function formatLocality(address: Address | undefined): string | undefined {
  if (!address) return undefined;
  const place = address.city?.trim() || address.street?.trim();
  const parts = [place, address.country?.trim()].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(', ') : undefined;
}

/**
 * How far `date` is from `from`, in days, as a phrase: `'today'`, `'tomorrow'`, or
 * `'in 4 days'`. `null` for a date in the past or an unparseable one, so the caller
 * simply omits the phrase.
 *
 * **Both arguments must be dates for the same unit** — its `localDate` and one of its
 * reservation dates. That is what makes this arithmetic legitimate under §3.7: it
 * compares two property-local calendar dates against each other, never a property's date
 * against the viewer's clock. Nothing here reads the browser's timezone, and
 * `nightsBetween` builds its `Date`s in UTC purely to subtract them (see its own
 * comment), so no local offset can enter.
 */
export function relativeDayLabel(from: string, date: string): string | null {
  const days = nightsBetween(from, date);
  if (days === null || days < 0) return null;
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}
