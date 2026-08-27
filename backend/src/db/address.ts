import type { Address } from '@booking/shared';

/**
 * The four address columns as Postgres returns them, from any table that carries them.
 *
 * Structural, not tied to one row interface, so both `RentalUnitRow` and the dashboard's
 * joined row satisfy it without either having to import the other's types.
 */
export interface AddressColumns {
  street: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
}

/**
 * The API nests the address (§3.2); the table stores it as four flat columns (§4).
 *
 * The columns are flat because a `jsonb` blob would make the fields unindexable in
 * practice and unavailable to a `CHECK`, for a value object whose shape is known and
 * fixed. That means the nesting is a presentation concern, and this is where it happens —
 * once, for every read path, so the rental-unit list and the dashboard cannot disagree
 * about what an empty address looks like.
 *
 * An address with every column NULL is reported as *absent*, not as `{}`. That makes the
 * round trip faithful — a unit created without an address reads back without one — and
 * `address` is optional in the contract precisely so "not provided" is representable.
 * `{}` would instead make a client's `if (unit.address)` check true for a unit that has
 * no address at all.
 */
export function toAddress(row: AddressColumns): Address | undefined {
  const address: Address = {};

  if (row.street !== null) address.street = row.street;
  if (row.city !== null) address.city = row.city;
  if (row.postcode !== null) address.postcode = row.postcode;
  if (row.country !== null) address.country = row.country;

  return Object.keys(address).length > 0 ? address : undefined;
}
