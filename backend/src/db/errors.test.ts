import { describe, expect, it } from 'vitest';

import {
  isCheckViolation,
  isExclusionViolation,
  isForeignKeyViolation,
  pgConstraintName,
  pgErrorCode,
} from './errors';

/** Shaped like a `pg` DatabaseError, which is all the classifiers look at. */
const pgError = (code: string, constraint?: string): unknown =>
  Object.assign(new Error('db error'), { code, constraint });

describe('SQLSTATE classification', () => {
  it('recognises an exclusion violation (23P01)', () => {
    expect(isExclusionViolation(pgError('23P01', 'reservation_no_overlap'))).toBe(true);
    expect(isExclusionViolation(pgError('23505'))).toBe(false);
  });

  it('recognises a foreign key violation (23503)', () => {
    expect(isForeignKeyViolation(pgError('23503'))).toBe(true);
  });

  it('recognises a check violation (23514)', () => {
    expect(isCheckViolation(pgError('23514', 'reservation_valid_range'))).toBe(true);
  });

  it('exposes the constraint name so a handler can tell two checks apart', () => {
    expect(pgConstraintName(pgError('23514', 'reservation_valid_range'))).toBe(
      'reservation_valid_range',
    );
  });

  it.each([undefined, null, 'a string', 42, new Error('plain'), {}])(
    'treats a non-database error (%s) as unclassified',
    (value) => {
      expect(pgErrorCode(value)).toBeUndefined();
      expect(isExclusionViolation(value)).toBe(false);
    },
  );
});
