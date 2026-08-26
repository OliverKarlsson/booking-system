import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common';

/**
 * Structured rather than a single free-text line — every field optional, because a
 * rental unit is useful long before someone fills in its postcode.
 */
export const addressSchema = z.object({
  street: z.string().max(200).optional(),
  city: z.string().max(120).optional(),
  postcode: z.string().max(20).optional(),
  country: z.string().max(120).optional(),
});

/**
 * Matches a fixed UTC offset in any of the shapes people reach for when they think
 * "timezone": `+01:00`, `-0500`, `UTC+2`, `GMT-3`, `Etc/GMT+5`.
 */
const FIXED_OFFSET_PATTERN = /^(?:(?:utc|gmt|etc\/gmt)?\s*[+-]\d{1,2}(?::?\d{2})?|z|utc|gmt)$/i;

/**
 * The set of IANA identifiers this runtime's tz database knows about.
 *
 * Computed once at module load: `supportedValuesOf` allocates a 400+ element array on
 * every call, and this schema runs on every write to a rental unit.
 */
const SUPPORTED_TIME_ZONES: ReadonlySet<string> = new Set(Intl.supportedValuesOf('timeZone'));

/**
 * A required IANA timezone identifier — `Europe/Stockholm`, never `+01:00`.
 *
 * Fixed offsets are rejected explicitly and with their own message because they are the
 * plausible-looking wrong answer: an offset cannot express DST, so a unit stored as
 * `+01:00` reports the wrong local date for half the year, and it cannot follow a
 * political timezone change at all. The identifier delegates both to the tz database.
 *
 * Validated here rather than by a `CHECK` constraint because Postgres forbids
 * subqueries in `CHECK`, so `pg_timezone_names` cannot be referenced from one. Unlike
 * the overlap rule — where moving enforcement out of the database would surrender a
 * concurrency guarantee — this is a plain value-domain check with no race to lose, so
 * nothing is given up by validating it in the application. (The stricter alternative is
 * a foreign key to a lookup table synced from `pg_timezone_names`, at the cost of
 * restating the tz database in our schema and owning its refresh.)
 *
 * Membership is tested against `Intl.supportedValuesOf('timeZone')`, which contains
 * canonical identifiers only. That is deliberately stricter than
 * `new Intl.DateTimeFormat(undefined, { timeZone })`, which also accepts aliases,
 * mixed case, and `Etc/GMT+5` — precisely the inputs worth refusing.
 */
export const timezoneSchema = z
  .string()
  .min(1, { message: 'Timezone is required' })
  .refine((value) => !FIXED_OFFSET_PATTERN.test(value.trim()), {
    message: 'Must be an IANA timezone identifier (e.g. Europe/Stockholm), not a fixed UTC offset',
  })
  .refine((value) => SUPPORTED_TIME_ZONES.has(value), {
    message: 'Must be a known IANA timezone identifier (e.g. Europe/Stockholm)',
  });

export const rentalUnitStatusSchema = z.enum(['active', 'deleted']);

const rentalUnitNameSchema = z
  .string()
  .trim()
  .min(1, { message: 'Name is required' })
  .max(120, { message: 'Name must be at most 120 characters' });

export const rentalUnitSchema = z.object({
  id: uuidSchema,
  name: rentalUnitNameSchema,
  timezone: timezoneSchema,
  address: addressSchema.optional(),
  status: rentalUnitStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

/**
 * `status` is absent by design: a unit is born `active` and only `DELETE` moves it to
 * `deleted`, so exposing it as a writable field would create a second, unguarded route
 * around the "no deleting a unit that still has reservations" rule.
 */
export const createRentalUnitSchema = z.object({
  name: rentalUnitNameSchema,
  timezone: timezoneSchema,
  address: addressSchema.optional(),
});

/**
 * `timezone` is editable (§3.7). Because reservation dates are calendar dates, the
 * timezone never participates in interpreting stored data — changing it reinterprets
 * nothing and only affects the dashboard's derived `localDate`. Freezing it would
 * protect nothing while making a mis-picked zone permanently uncorrectable, since a
 * unit with reservations cannot be deleted either.
 *
 * The `refine` rejects an empty patch: `PATCH {}` is far more likely to be a client bug
 * than an intentional no-op, and a 400 says so where a 200 hides it.
 */
export const updateRentalUnitSchema = z
  .object({
    name: rentalUnitNameSchema,
    timezone: timezoneSchema,
    address: addressSchema,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'At least one field must be provided',
  });
