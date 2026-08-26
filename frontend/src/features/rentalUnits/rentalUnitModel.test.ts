import { describe, expect, it } from 'vitest';
import type { RentalUnit } from '@booking/shared';
import {
  buildRentalUnitPatch,
  emptyFormValues,
  formatAddress,
  formValuesFromUnit,
  normalizeAddress,
  toCreateInput,
} from './rentalUnitModel';

const unit: RentalUnit = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Seaside flat',
  timezone: 'Europe/Lisbon',
  address: { street: 'Rua do Mar 4', city: 'Lisbon', postcode: '1100-001', country: 'Portugal' },
  status: 'active',
  createdAt: '2026-01-05T09:30:00.000Z',
  updatedAt: '2026-01-05T09:30:00.000Z',
};

describe('normalizeAddress', () => {
  it('drops blank fields and trims the rest', () => {
    expect(normalizeAddress({ street: '  Rua do Mar 4 ', city: '', postcode: '   ', country: 'PT' })).toEqual(
      { street: 'Rua do Mar 4', country: 'PT' },
    );
  });

  it('collapses an entirely blank address to undefined', () => {
    // Otherwise a unit with no address is stored as four empty strings, which then
    // renders as a blank line and compares unequal to "no address".
    expect(normalizeAddress({ street: '', city: '', postcode: '', country: '' })).toBeUndefined();
  });
});

describe('toCreateInput', () => {
  it('trims the name and omits an empty address', () => {
    const input = toCreateInput({ ...emptyFormValues('Europe/Stockholm'), name: '  Loft  ' });
    expect(input).toEqual({ name: 'Loft', timezone: 'Europe/Stockholm', address: undefined });
  });
});

describe('buildRentalUnitPatch', () => {
  it('returns null when nothing changed, so no empty PATCH is ever sent', () => {
    // `PATCH {}` is a deliberate 400 in the contract; an untouched form must produce no
    // request at all rather than an error the user cannot act on.
    expect(buildRentalUnitPatch(unit, formValuesFromUnit(unit))).toBeNull();
  });

  it('includes only the fields that actually changed', () => {
    const values = { ...formValuesFromUnit(unit), name: 'Seaside apartment' };
    expect(buildRentalUnitPatch(unit, values)).toEqual({ name: 'Seaside apartment' });
  });

  it('treats the timezone as an ordinary editable field', () => {
    const values = { ...formValuesFromUnit(unit), timezone: 'Pacific/Auckland' };
    expect(buildRentalUnitPatch(unit, values)).toEqual({ timezone: 'Pacific/Auckland' });
  });

  it('ignores whitespace-only edits to the name', () => {
    const values = { ...formValuesFromUnit(unit), name: '  Seaside flat  ' };
    expect(buildRentalUnitPatch(unit, values)).toBeNull();
  });

  it('sends the whole address when any part of it changes', () => {
    const values = formValuesFromUnit(unit);
    const patch = buildRentalUnitPatch(unit, {
      ...values,
      address: { ...values.address, city: 'Cascais' },
    });
    expect(patch).toEqual({
      address: {
        street: 'Rua do Mar 4',
        city: 'Cascais',
        postcode: '1100-001',
        country: 'Portugal',
      },
    });
  });

  it('sends an empty address object when the user clears every field', () => {
    const patch = buildRentalUnitPatch(unit, {
      ...formValuesFromUnit(unit),
      address: { street: '', city: '', postcode: '', country: '' },
    });
    expect(patch).toEqual({ address: {} });
  });

  it('does not report a change when the stored unit has no address and the form is blank', () => {
    const addressless: RentalUnit = { ...unit, address: undefined };
    expect(buildRentalUnitPatch(addressless, formValuesFromUnit(addressless))).toBeNull();
  });
});

describe('formatAddress', () => {
  it('joins the parts that are present', () => {
    expect(formatAddress(unit.address)).toBe('Rua do Mar 4, 1100-001 Lisbon, Portugal');
  });

  it('returns undefined when there is nothing to show', () => {
    expect(formatAddress(undefined)).toBeUndefined();
    expect(formatAddress({})).toBeUndefined();
  });
});
