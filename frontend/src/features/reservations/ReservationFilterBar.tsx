import type { SelectOption } from '@/components/ui';
import { Button, Card, CardBody, Input, Select } from '@/components/ui';
import type { ReservationFilters, ReservationStatusFilter } from '@/store';

export interface ReservationFilterBarProps {
  filters: ReservationFilters;
  rentalUnits: SelectOption[];
  /** Set when the date window is inverted, so the list is not requested. */
  dateRangeError?: string;
  onRentalUnitChange: (rentalUnitId: string | null) => void;
  onDateRangeChange: (from: string | null, to: string | null) => void;
  onStatusChange: (status: ReservationStatusFilter) => void;
  onReset: () => void;
}

const STATUS_OPTIONS: SelectOption[] = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' },
];

/**
 * The filter controls, as pure markup.
 *
 * Every value comes from the Zustand `filtersSlice` through props and every change goes
 * back to it through a callback — the bar holds no state of its own. That is what keeps
 * the filters and the request in sync: there is one copy of "what is being filtered on",
 * and the query key is derived from it rather than from a second copy living in a
 * component.
 *
 * The empty string is the wire for "no filter" in a `<select>`/`<input>`, and it is
 * converted to `null` on the way out — the slice stores `null` because `from=''` would be
 * serialised into the query string and rejected as a malformed date.
 *
 * `status` has no "all" option on purpose: the API's `status` param takes one value
 * (§3.6), so offering "All" would promise a request the contract cannot express.
 */
export function ReservationFilterBar({
  filters,
  rentalUnits,
  dateRangeError,
  onRentalUnitChange,
  onDateRangeChange,
  onStatusChange,
  onReset,
}: ReservationFilterBarProps) {
  const isFiltered =
    filters.rentalUnitId !== null ||
    filters.from !== null ||
    filters.to !== null ||
    filters.status !== 'confirmed';

  return (
    <Card>
      <CardBody className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Select
          label="Rental unit"
          placeholder="All rental units"
          options={rentalUnits}
          value={filters.rentalUnitId ?? ''}
          onChange={(event) => onRentalUnitChange(event.target.value || null)}
        />

        {/*
          `type="date"` reads and writes `YYYY-MM-DD` verbatim, which is the same format
          the query string carries (§3.1) — the string is never parsed into a `Date`, so
          the window means the same days for every viewer.

          `from`/`to` select stays *overlapping* the window, not merely contained by it
          (§3.3), which is why the labels say "Overlapping" rather than "Between".
        */}
        <Input
          label="From"
          type="date"
          value={filters.from ?? ''}
          onChange={(event) => onDateRangeChange(event.target.value || null, filters.to)}
        />
        <Input
          label="To"
          type="date"
          value={filters.to ?? ''}
          error={dateRangeError}
          hint="Shows stays overlapping this window."
          onChange={(event) => onDateRangeChange(filters.from, event.target.value || null)}
        />

        <Select
          label="Status"
          options={STATUS_OPTIONS}
          value={filters.status}
          onChange={(event) => onStatusChange(event.target.value as ReservationStatusFilter)}
        />

        <div className="flex items-end justify-start pb-0.5 sm:h-full">
          <Button variant="secondary" onClick={onReset} disabled={!isFiltered}>
            Clear filters
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
