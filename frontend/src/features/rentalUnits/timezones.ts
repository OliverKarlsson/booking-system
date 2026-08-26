import type { SelectOption } from '@/components/ui';

/**
 * The options behind the required timezone select.
 *
 * A unit's timezone is the authority for "what day is it at this property" (§3.7), which
 * is the one place in the system where a zone is used at all. It is therefore chosen from
 * the tz database rather than typed, so nobody can enter `+01:00` — a fixed offset cannot
 * express DST and would report the wrong local date for half the year.
 */

/**
 * Identifiers this runtime offers that the API would nonetheless reject.
 *
 * The shared `timezoneSchema` validates against `Intl.supportedValuesOf('timeZone')`, but
 * that list is *per runtime*: browsers (per the ECMA-402 spec, which requires "UTC" to be
 * present) include `UTC`, while Node's ICU list does not. Offering it would produce a
 * select whose value the server answers with a 400 — a validation error the user has no
 * way to act on, since the control they were given is the one that produced it.
 *
 * `Etc/*` is excluded for the reason above it: those zones *are* fixed offsets wearing an
 * IANA name (and `Etc/GMT+5` is west of Greenwich, which is a trap in itself), so the
 * shared schema rejects them explicitly.
 */
function isSelectable(timeZone: string): boolean {
  return timeZone !== 'UTC' && !timeZone.startsWith('Etc/');
}

/**
 * Computed once at module load. `supportedValuesOf` allocates a 400+ element array on
 * every call, and the list cannot change while the tab is open.
 */
export const TIMEZONE_IDS: readonly string[] = Intl.supportedValuesOf('timeZone').filter(
  isSelectable,
);

const TIMEZONE_ID_SET: ReadonlySet<string> = new Set(TIMEZONE_IDS);

export const TIMEZONE_OPTIONS: readonly SelectOption[] = TIMEZONE_IDS.map((id) => ({
  value: id,
  // Rendered as the identifier itself: `Europe/Stockholm` is what is stored, what the API
  // validates, and what a manager recognises. A prettified label would hide the value.
  label: id,
}));

export function isSelectableTimezone(timeZone: string): boolean {
  return TIMEZONE_ID_SET.has(timeZone);
}

/**
 * The browser's own zone, offered as the initial value of the select.
 *
 * A *convenience the user is expected to confirm*, not an assumption — a manager in
 * Stockholm routinely lists a flat in Lisbon, and the field describes the flat. That is
 * also why it is a plain pre-filled value in a required field rather than a silent
 * fallback applied at submit time: the wrong zone is visible on screen before saving.
 *
 * Returns `''` when the resolved zone is not one we offer (notably `UTC`, which is what
 * jsdom and a container with no `TZ` set report). An empty required select then makes the
 * user pick, which is the correct outcome — better than pre-filling a value the API
 * would reject.
 */
export function detectTimezone(): string {
  const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return resolved && isSelectableTimezone(resolved) ? resolved : '';
}
