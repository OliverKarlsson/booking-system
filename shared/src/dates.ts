/**
 * Calendar-date helpers.
 *
 * Reservation dates are calendar facts ("the guest has the flat on the 26th"), not
 * instants on a timeline, so they are `YYYY-MM-DD` strings from the database column
 * all the way to the rendered pixel. **No function in this module constructs a
 * `Date` from a reservation date**, and neither should any caller: `new Date('2026-03-26')`
 * parses as UTC midnight while `new Date(2026, 2, 26)` parses as local midnight, which
 * is how a stay silently renders a day early for anyone west of Greenwich.
 *
 * `Date` appears exactly twice below, in `todayUtc` and `todayLocal`, and in both cases
 * it represents *now* — a genuine instant — which is then projected onto a calendar.
 */

/** Strict shape check. Deliberately anchored, and deliberately not tolerant of `2026-3-1`. */
const DATE_STRING_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  return month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1];
}

/**
 * `YYYY-MM-DD` that also exists on the calendar.
 *
 * The regex alone accepts `2026-02-31` and `2026-13-01`, and round-tripping through
 * `new Date()` to catch those is the trap this whole module avoids — JS silently rolls
 * `2026-02-31` over to 3 March rather than rejecting it. So the day-of-month bound is
 * computed arithmetically instead.
 */
export function isValidDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_STRING_PATTERN.test(value)) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));

  if (month < 1 || month > 12) return false;
  if (day < 1 || day > daysInMonth(year, month)) return false;
  return true;
}

/**
 * Chronological comparison, returning the usual -1 / 0 / 1 so it drops straight into
 * `Array.prototype.sort`.
 *
 * Plain string comparison is correct here, not a shortcut: for zero-padded ISO dates
 * lexicographic order *is* chronological order, so there is nothing to parse and
 * therefore no timezone for a parse to apply.
 */
export function compareDates(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function assertDateString(value: string, argument: string): void {
  if (!isValidDateString(value)) {
    throw new RangeError(`${argument} must be a valid YYYY-MM-DD date, received ${JSON.stringify(value)}`);
  }
}

/*
 * Civil-date <-> days-since-epoch conversion (Howard Hinnant's algorithm).
 *
 * This exists so `addDays` can do real calendar arithmetic — leap years, month lengths —
 * without a `Date` object. Adding 86_400_000 milliseconds to a timestamp is the
 * tempting alternative and it is wrong on the two days a year a DST transition makes
 * the local day 23 or 25 hours long.
 */
function toEpochDay(year: number, month: number, day: number): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

function fromEpochDay(epochDay: number): string {
  const z = epochDay + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365,
  );
  const y = yearOfEra + era * 400;
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const mp = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  const year = y + (month <= 2 ? 1 : 0);

  return formatDateParts(year, month, day);
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Shift a calendar date by whole days. Negative values move backwards.
 *
 * Throws on malformed input rather than returning a nonsense date, because every caller
 * is downstream of a Zod-validated boundary — reaching here with garbage means a bug,
 * not user error.
 */
export function addDays(date: string, days: number): string {
  assertDateString(date, 'date');
  if (!Number.isInteger(days)) {
    throw new RangeError(`days must be an integer, received ${JSON.stringify(days)}`);
  }

  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));

  return fromEpochDay(toEpochDay(year, month, day) + days);
}

/**
 * Today in UTC, as `YYYY-MM-DD`.
 *
 * Note what this is *not* good for: the dashboard's occupied/vacant badge. "What day is
 * it?" there means "what day is it at the property", which only the unit's own IANA
 * timezone can answer, and the server resolves it in SQL (§3.7). This helper is for
 * places where UTC is genuinely the intended frame, such as a stable default in a test
 * fixture or a log line.
 */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Today as `YYYY-MM-DD` in `timeZone`, defaulting to the runtime's own zone.
 *
 * Frontend display logic only — pre-filling a date picker with "today", disabling
 * past dates in a calendar widget. It must never be compared against a rental unit's
 * `localDate` or against a reservation date to decide anything: per §3.7 every date in
 * this system belongs to the property, so the viewer's date has no meaning in that
 * comparison and reconciling the two is the bug, not the feature.
 */
export function todayLocal(timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const partValue = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  return formatDateParts(Number(partValue('year')), Number(partValue('month')), Number(partValue('day')));
}

/**
 * Do the half-open intervals `[aStart, aEnd)` and `[bStart, bEnd)` intersect?
 *
 * ⚠ **The backend must not use this to enforce the booking rule.** Overlap prevention
 * belongs to the `EXCLUDE USING gist` constraint in `db/schema.sql` (§4): a check in
 * application code races with concurrent requests no matter how it is wrapped, whereas
 * the constraint cannot be raced and cannot be routed around by a future code path that
 * forgets to call it. There is exactly one authoritative definition of "overlap" in
 * this system and it is in the schema.
 *
 * What this *is* for:
 *   - the frontend, warning the user before a request is sent (a UX affordance that is
 *     allowed to be racy, because the server still decides);
 *   - tests, as a readable statement of the rule the constraint implements.
 *
 * Same-day turnover is not a conflict: `aEnd === bStart` leaves the intervals touching
 * but disjoint, which is the standard checkout/check-in changeover.
 *
 * Inputs are assumed to be valid `YYYY-MM-DD` strings with `start < end`; the
 * comparison is lexicographic (see `compareDates`).
 */
export function datesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart < bEnd && bStart < aEnd;
}
