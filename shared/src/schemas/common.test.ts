import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  dateStringSchema,
  isoDateTimeSchema,
  paginatedSchema,
  paginationMetaSchema,
  paginationQuerySchema,
  uuidSchema,
} from './common';

describe('dateStringSchema', () => {
  it.each(['2026-03-26', '2024-02-29', '2000-02-29', '2026-12-31'])('accepts %s', (value) => {
    expect(dateStringSchema.parse(value)).toBe(value);
  });

  it.each(['2026-3-26', '26-03-26', '2026/03/26', '2026-03-26T00:00:00Z', '', 'tomorrow'])(
    'rejects the malformed %s with a format message',
    (value) => {
      const result = dateStringSchema.safeParse(value);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/YYYY-MM-DD/);
      }
    },
  );

  it.each(['2026-02-31', '2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31', '2026-01-32', '2026-03-00'])(
    'rejects the impossible calendar date %s',
    (value) => {
      const result = dateStringSchema.safeParse(value);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toMatch(/real calendar date/);
      }
    },
  );

  it('rejects 29 February in a common year but accepts it in a leap year', () => {
    expect(dateStringSchema.safeParse('2026-02-29').success).toBe(false);
    expect(dateStringSchema.safeParse('1900-02-29').success).toBe(false);
    expect(dateStringSchema.safeParse('2024-02-29').success).toBe(true);
  });

  it('rejects non-strings', () => {
    expect(dateStringSchema.safeParse(20260326).success).toBe(false);
    expect(dateStringSchema.safeParse(new Date()).success).toBe(false);
    expect(dateStringSchema.safeParse(null).success).toBe(false);
  });
});

describe('uuidSchema', () => {
  it('accepts a v4 uuid', () => {
    expect(uuidSchema.safeParse('3f2504e0-4f89-41d3-9a0c-0305e82c3301').success).toBe(true);
  });

  it.each(['', 'not-a-uuid', '3f2504e0-4f89-41d3-9a0c', '3f2504e04f8941d39a0c0305e82c3301'])(
    'rejects %s',
    (value) => {
      expect(uuidSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('isoDateTimeSchema', () => {
  it.each(['2026-03-26T09:15:00Z', '2026-03-26T09:15:00.123Z', '2026-03-26T09:15:00+02:00'])(
    'accepts the instant %s',
    (value) => {
      expect(isoDateTimeSchema.safeParse(value).success).toBe(true);
    },
  );

  it('rejects a bare calendar date — timestamps and dates are not interchangeable', () => {
    expect(isoDateTimeSchema.safeParse('2026-03-26').success).toBe(false);
  });
});

describe('paginationQuerySchema', () => {
  it('defaults to page 1 and limit 20', () => {
    expect(paginationQuerySchema.parse({})).toEqual({ page: 1, limit: 20 });
  });

  it('coerces query strings to numbers', () => {
    expect(paginationQuerySchema.parse({ page: '3', limit: '50' })).toEqual({ page: 3, limit: 50 });
  });

  it('rejects a page below 1', () => {
    expect(paginationQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ page: '-1' }).success).toBe(false);
  });

  it('rejects non-integer values', () => {
    expect(paginationQuerySchema.safeParse({ page: '1.5' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ limit: 'twenty' }).success).toBe(false);
  });

  it('accepts the maximum limit and rejects anything above it', () => {
    expect(paginationQuerySchema.parse({ limit: '100' }).limit).toBe(100);
    expect(paginationQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(paginationQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });
});

describe('paginatedSchema', () => {
  const schema = paginatedSchema(z.object({ id: uuidSchema }));

  it('validates the list envelope', () => {
    const payload = {
      data: [{ id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' }],
      pagination: { page: 1, limit: 20, total: 57, totalPages: 3 },
    };

    expect(schema.parse(payload)).toEqual(payload);
  });

  it('accepts an empty page', () => {
    const payload = { data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } };

    expect(schema.parse(payload)).toEqual(payload);
  });

  it('rejects items that fail the item schema', () => {
    expect(
      schema.safeParse({
        data: [{ id: 'nope' }],
        pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
      }).success,
    ).toBe(false);
  });

  it('requires the pagination block', () => {
    expect(schema.safeParse({ data: [] }).success).toBe(false);
    expect(paginationMetaSchema.safeParse({ page: 1, limit: 20, total: 1 }).success).toBe(false);
  });
});
