import { describe, expect, it } from 'vitest';

import {
  ERROR_CODES,
  ERROR_STATUS,
  bookingConflictDetailsSchema,
  errorResponseSchema,
  validationIssueSchema,
} from './errors';

describe('errorResponseSchema', () => {
  it('accepts the envelope without details', () => {
    const envelope = { error: 'Rental unit not found', code: 'NOT_FOUND' };

    expect(errorResponseSchema.parse(envelope)).toEqual(envelope);
  });

  it('accepts a VALIDATION_ERROR with per-field details', () => {
    const envelope = {
      error: 'Request body failed validation',
      code: 'VALIDATION_ERROR',
      details: [{ path: 'endDate', message: 'End date must be after start date' }],
    };

    expect(errorResponseSchema.parse(envelope)).toEqual(envelope);
    expect(validationIssueSchema.parse(envelope.details[0])).toEqual(envelope.details[0]);
  });

  it('accepts a BOOKING_CONFLICT carrying the conflicting reservations', () => {
    const details = [
      {
        id: '9c858901-8a57-4791-81fe-4c455b099bc9',
        guestName: 'Jane Doe',
        startDate: '2026-03-12',
        endDate: '2026-03-15',
      },
    ];

    expect(errorResponseSchema.parse({ error: 'Overlaps an existing booking', code: 'BOOKING_CONFLICT', details }))
      .toEqual({ error: 'Overlaps an existing booking', code: 'BOOKING_CONFLICT', details });

    // The UI narrows `details` with this schema to name the guest and dates.
    expect(bookingConflictDetailsSchema.parse(details)[0]?.guestName).toBe('Jane Doe');
  });

  it('rejects an unknown code — the set is closed so clients can branch exhaustively', () => {
    expect(errorResponseSchema.safeParse({ error: 'Oops', code: 'TEAPOT' }).success).toBe(false);
  });

  it('requires a human-readable message alongside the machine code', () => {
    expect(errorResponseSchema.safeParse({ code: 'INTERNAL_ERROR' }).success).toBe(false);
  });
});

describe('ERROR_STATUS', () => {
  it('maps every code to the status in the contract', () => {
    expect(ERROR_STATUS).toEqual({
      VALIDATION_ERROR: 400,
      NOT_FOUND: 404,
      RENTAL_UNIT_NOT_FOUND: 404,
      BOOKING_CONFLICT: 409,
      UNIT_HAS_RESERVATIONS: 409,
      RATE_LIMITED: 429,
      INTERNAL_ERROR: 500,
    });
  });

  it('covers every declared code', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });
});
