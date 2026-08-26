/**
 * Display formatting for calendar dates.
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * THE RULE: a reservation date is never passed through `new Date()`.
 * ─────────────────────────────────────────────────────────────────────────────────
 *
 * `new Date('2026-03-26')` parses the string as **UTC midnight**. Rendered with any
 * local-time formatter (`toLocaleDateString`, `getDate()`, `Intl.DateTimeFormat`) it
 * comes out as the 25th for every viewer west of Greenwich. That is a one-line bug
 * that looks correct in Stockholm, in tests, and in review — and is wrong for a third
 * of the world for part of every day.
 *
 * Per contract §3.7 every date in this system is already local to the property, so
 * there is nothing to convert: the correct render of `'2026-03-26'` is "26 Mar 2026"
 * for everybody. These helpers therefore work on the `YYYY-MM-DD` string directly,
 * with no `Date` object involved.
 *
 * The one place a `Date` is correct is {@link formatTimestamp}: `createdAt`/`updatedAt`
 * genuinely are instants (§3.1), so converting them to the viewer's zone is the right
 * behaviour rather than a bug.
 */

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

interface DateParts {
  year: number;
  /** 1-based, as written in the string. */
  month: number;
  day: number;
}

/** Splits `YYYY-MM-DD` into numbers, or returns `null` if it is not that shape. */
export function parseDateParts(date: string): DateParts | null {
  const match = DATE_PATTERN.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/** `'2026-03-26'` → `'26 Mar 2026'`. Unrecognised input is rendered verbatim. */
export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  const parts = parseDateParts(date);
  if (!parts) return date;
  return `${parts.day} ${MONTHS_SHORT[parts.month - 1]} ${parts.year}`;
}

/** `'2026-03-26'` → `'26 March 2026'`. */
export function formatDateLong(date: string | null | undefined): string {
  if (!date) return '—';
  const parts = parseDateParts(date);
  if (!parts) return date;
  return `${parts.day} ${MONTHS_LONG[parts.month - 1]} ${parts.year}`;
}

/** `'2026-03-26'` → `'26 Mar'`, for ranges where the year is stated once at the end. */
export function formatDayMonth(date: string): string {
  const parts = parseDateParts(date);
  if (!parts) return date;
  return `${parts.day} ${MONTHS_SHORT[parts.month - 1]}`;
}

/**
 * Formats a stay as a range, collapsing whatever the two ends share:
 *
 * - same month  → `12–15 March 2026`
 * - same year   → `28 Mar – 3 Apr 2026`
 * - otherwise   → `28 Dec 2025 – 3 Jan 2026`
 *
 * Both arguments are rendered exactly as stored. `endDate` is the checkout date and is
 * shown as such (the contract's interval is half-open, §3.3) — this helper does not
 * silently subtract a night.
 */
export function formatDateRange(startDate: string, endDate: string): string {
  const start = parseDateParts(startDate);
  const end = parseDateParts(endDate);
  if (!start || !end) return `${formatDate(startDate)} – ${formatDate(endDate)}`;

  if (start.year === end.year && start.month === end.month) {
    return `${start.day}–${end.day} ${MONTHS_LONG[start.month - 1]} ${start.year}`;
  }
  if (start.year === end.year) {
    return `${formatDayMonth(startDate)} – ${formatDayMonth(endDate)} ${start.year}`;
  }
  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

/**
 * Number of nights in a half-open `[startDate, endDate)` stay.
 *
 * `Date.UTC` is used to turn both ends into day numbers. That is safe where
 * `new Date(string)` is not, because *both* endpoints are built in the same fixed
 * zone and only their difference is used — no local offset enters the calculation, and
 * no `Date` ever reaches a formatter. UTC also has no DST, so every day is exactly
 * 24 hours and the division is exact.
 */
export function nightsBetween(startDate: string, endDate: string): number | null {
  const start = parseDateParts(startDate);
  const end = parseDateParts(endDate);
  if (!start || !end) return null;
  const startMs = Date.UTC(start.year, start.month - 1, start.day);
  const endMs = Date.UTC(end.year, end.month - 1, end.day);
  return Math.round((endMs - startMs) / 86_400_000);
}

/** `2` → `'2 nights'`, `1` → `'1 night'`. */
export function formatNights(startDate: string, endDate: string): string {
  const nights = nightsBetween(startDate, endDate);
  if (nights === null) return '';
  return nights === 1 ? '1 night' : `${nights} nights`;
}

/**
 * Formats an `createdAt`/`updatedAt` ISO 8601 **instant** in the viewer's own zone.
 *
 * This is the deliberate exception to the rule at the top of this file: a timestamp is
 * a moment on a timeline, so showing it in local time is correct (§3.1). Never call
 * this with a reservation date.
 */
export function formatTimestamp(isoInstant: string | null | undefined): string {
  if (!isoInstant) return '—';
  const instant = new Date(isoInstant);
  if (Number.isNaN(instant.getTime())) return isoInstant;
  return instant.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
