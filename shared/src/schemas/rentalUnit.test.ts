import { describe, expect, it } from 'vitest';

import {
  addressSchema,
  createRentalUnitSchema,
  rentalUnitSchema,
  timezoneSchema,
  updateRentalUnitSchema,
} from './rentalUnit';

const validUnit = {
  id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  name: 'Sunny flat',
  timezone: 'Europe/Stockholm',
  address: { street: 'Storgatan 1', city: 'Stockholm', postcode: '111 22', country: 'SE' },
  status: 'active' as const,
  createdAt: '2026-03-26T09:15:00Z',
  updatedAt: '2026-03-26T09:15:00Z',
};

describe('timezoneSchema', () => {
  it.each(['Europe/Stockholm', 'America/Los_Angeles', 'Pacific/Auckland', 'Asia/Tokyo'])(
    'accepts the IANA identifier %s',
    (value) => {
      expect(timezoneSchema.parse(value)).toBe(value);
    },
  );

  it.each(['+01:00', '-05:00', '+0100', 'UTC+2', 'GMT-3', 'Etc/GMT+5', 'UTC', 'GMT', 'Z'])(
    'rejects the fixed offset %s with a message pointing at IANA identifiers',
    (value) => {
      const result = timezoneSchema.safeParse(value);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/IANA/);
      }
    },
  );

  it.each(['Mars/Phobos', 'Europe/Atlantis', 'Not A Zone', ''])('rejects the unknown zone %s', (value) => {
    expect(timezoneSchema.safeParse(value).success).toBe(false);
  });

  it('is case-sensitive — only canonical identifiers pass', () => {
    expect(timezoneSchema.safeParse('europe/stockholm').success).toBe(false);
    expect(timezoneSchema.safeParse('EUROPE/STOCKHOLM').success).toBe(false);
  });

  it('rejects a missing value rather than defaulting one', () => {
    expect(timezoneSchema.safeParse(undefined).success).toBe(false);
    expect(timezoneSchema.safeParse(null).success).toBe(false);
  });
});

describe('addressSchema', () => {
  it('accepts an empty object — every field is optional', () => {
    expect(addressSchema.parse({})).toEqual({});
  });

  it('accepts a partial address', () => {
    expect(addressSchema.parse({ city: 'Malmö' })).toEqual({ city: 'Malmö' });
  });

  it('rejects a non-string field', () => {
    expect(addressSchema.safeParse({ postcode: 11122 }).success).toBe(false);
  });
});

describe('rentalUnitSchema', () => {
  it('accepts a complete unit', () => {
    expect(rentalUnitSchema.parse(validUnit)).toEqual(validUnit);
  });

  it('accepts a unit with no address', () => {
    const { address: _address, ...withoutAddress } = validUnit;

    expect(rentalUnitSchema.safeParse(withoutAddress).success).toBe(true);
  });

  it.each(['id', 'name', 'timezone', 'status', 'createdAt', 'updatedAt'])('requires %s', (field) => {
    const { [field]: _omitted, ...rest } = validUnit as Record<string, unknown>;

    expect(rentalUnitSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an unknown status', () => {
    expect(rentalUnitSchema.safeParse({ ...validUnit, status: 'archived' }).success).toBe(false);
  });

  it('rejects a calendar date where an instant is expected', () => {
    expect(rentalUnitSchema.safeParse({ ...validUnit, createdAt: '2026-03-26' }).success).toBe(false);
  });
});

describe('createRentalUnitSchema', () => {
  it('accepts the minimum payload', () => {
    expect(createRentalUnitSchema.parse({ name: 'Flat', timezone: 'Europe/Stockholm' })).toEqual({
      name: 'Flat',
      timezone: 'Europe/Stockholm',
    });
  });

  it('requires a timezone', () => {
    const result = createRentalUnitSchema.safeParse({ name: 'Flat' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === 'timezone')).toBe(true);
    }
  });

  it('requires a name of 1–120 characters', () => {
    expect(createRentalUnitSchema.safeParse({ name: '', timezone: 'Europe/Stockholm' }).success).toBe(false);
    expect(createRentalUnitSchema.safeParse({ name: '   ', timezone: 'Europe/Stockholm' }).success).toBe(false);
    expect(createRentalUnitSchema.safeParse({ name: 'x'.repeat(120), timezone: 'Europe/Stockholm' }).success).toBe(
      true,
    );
    expect(createRentalUnitSchema.safeParse({ name: 'x'.repeat(121), timezone: 'Europe/Stockholm' }).success).toBe(
      false,
    );
  });

  it('trims the name', () => {
    expect(createRentalUnitSchema.parse({ name: '  Flat  ', timezone: 'Europe/Stockholm' }).name).toBe('Flat');
  });

  it('ignores client-supplied server-owned fields', () => {
    const parsed = createRentalUnitSchema.parse({
      name: 'Flat',
      timezone: 'Europe/Stockholm',
      id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      status: 'deleted',
    });

    expect(parsed).not.toHaveProperty('id');
    expect(parsed).not.toHaveProperty('status');
  });
});

describe('updateRentalUnitSchema', () => {
  it('accepts a single-field patch', () => {
    expect(updateRentalUnitSchema.parse({ name: 'Renamed' })).toEqual({ name: 'Renamed' });
  });

  it('accepts a timezone correction — the field is editable after creation', () => {
    expect(updateRentalUnitSchema.parse({ timezone: 'America/Los_Angeles' })).toEqual({
      timezone: 'America/Los_Angeles',
    });
  });

  it('accepts an address-only patch', () => {
    expect(updateRentalUnitSchema.parse({ address: { city: 'Göteborg' } })).toEqual({
      address: { city: 'Göteborg' },
    });
  });

  it('rejects an empty patch', () => {
    expect(updateRentalUnitSchema.safeParse({}).success).toBe(false);
  });

  it('still validates the fields that are present', () => {
    expect(updateRentalUnitSchema.safeParse({ timezone: '+01:00' }).success).toBe(false);
    expect(updateRentalUnitSchema.safeParse({ name: '' }).success).toBe(false);
  });
});
