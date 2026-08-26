import type { z } from 'zod';
import type { Address, CreateRentalUnitInput, RentalUnit, UpdateRentalUnitInput } from '@booking/shared';
import { createRentalUnitSchema } from '@booking/shared';

/**
 * The pure, testable half of the rental-unit form: what the fields hold, and how those
 * values become the two different request bodies the API accepts.
 *
 * Kept out of the components so the interesting rules — dropping blank address fields,
 * and never sending an empty `PATCH` — can be asserted directly instead of through a
 * rendered form.
 */

/**
 * Field values are the *input* type of the create schema rather than a hand-written
 * interface, so a change to the contract shows up here as a type error rather than as a
 * form that silently stops matching it.
 */
export type RentalUnitFormValues = z.input<typeof createRentalUnitSchema>;

export const ADDRESS_FIELDS = ['street', 'city', 'postcode', 'country'] as const;
export type AddressField = (typeof ADDRESS_FIELDS)[number];

/**
 * A blank form. Every address field is present as `''` rather than absent: react-hook-form
 * treats a field that starts out `undefined` as uncontrolled, and React then logs the
 * "changing an uncontrolled input to be controlled" warning the first time it is typed in.
 */
export function emptyFormValues(timezone = ''): RentalUnitFormValues {
  return {
    name: '',
    timezone,
    address: { street: '', city: '', postcode: '', country: '' },
  };
}

/** Fills the form from an existing unit, for the edit case. */
export function formValuesFromUnit(unit: RentalUnit): RentalUnitFormValues {
  return {
    name: unit.name,
    timezone: unit.timezone,
    address: {
      street: unit.address?.street ?? '',
      city: unit.address?.city ?? '',
      postcode: unit.address?.postcode ?? '',
      country: unit.address?.country ?? '',
    },
  };
}

/**
 * Trims each address field and drops the empty ones, returning `undefined` when nothing
 * is left.
 *
 * Sending `{ street: '', city: '' }` would store four empty strings that then render as
 * a blank address line and compare unequal to "no address at all". Absent and empty mean
 * the same thing to a user, so they are collapsed to the absent one on the way out.
 */
export function normalizeAddress(address: RentalUnitFormValues['address']): Address | undefined {
  if (!address) return undefined;

  const normalized: Address = {};
  for (const field of ADDRESS_FIELDS) {
    const value = address[field]?.trim();
    if (value) normalized[field] = value;
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function toCreateInput(values: RentalUnitFormValues): CreateRentalUnitInput {
  return {
    name: values.name.trim(),
    timezone: values.timezone,
    address: normalizeAddress(values.address),
  };
}

function addressesEqual(a: Address | undefined, b: Address | undefined): boolean {
  if (!a || !b) return !a && !b;
  return ADDRESS_FIELDS.every((field) => (a[field] ?? '') === (b[field] ?? ''));
}

/**
 * Diffs the submitted values against the stored unit and returns only what changed, or
 * `null` when nothing did.
 *
 * The form always holds every field, so submitting it verbatim would send a full object
 * on every edit. Two reasons not to: `PATCH {}` is a 400 by design (the shared
 * `updateRentalUnitSchema` rejects an empty patch as a probable client bug), so an
 * untouched form must not be sent at all; and a patch that names only the fields the
 * user actually touched is the one that behaves correctly if someone else edits the same
 * unit concurrently — it overwrites their change only where the two genuinely collide.
 *
 * `address` is diffed as a unit and sent whole, because the API models it as one nested
 * object rather than four independent columns; sending a partial address would read as
 * "clear the fields I omitted".
 */
export function buildRentalUnitPatch(
  unit: RentalUnit,
  values: RentalUnitFormValues,
): UpdateRentalUnitInput | null {
  const patch: UpdateRentalUnitInput = {};

  const name = values.name.trim();
  if (name !== unit.name) patch.name = name;

  if (values.timezone !== unit.timezone) patch.timezone = values.timezone;

  const address = normalizeAddress(values.address);
  if (!addressesEqual(address, normalizeAddress(unit.address))) {
    // `{}` rather than `undefined`: the update schema has no way to express "unset", and
    // an empty object is how the API is told the address is now blank.
    patch.address = address ?? {};
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

/**
 * One-line address for list rows and card subtitles. `undefined` when there is nothing to
 * show, so the caller can omit the line entirely rather than render an empty one.
 */
export function formatAddress(address: Address | undefined): string | undefined {
  if (!address) return undefined;
  const locality = [address.postcode, address.city].filter(Boolean).join(' ');
  const parts = [address.street, locality, address.country].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  return parts.length > 0 ? parts.join(', ') : undefined;
}
