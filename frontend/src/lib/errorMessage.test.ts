import { describe, expect, it } from 'vitest';

import { ApiError } from './apiClient';
import { toErrorMessage } from './errorMessage';

const REQUEST_ID = 'c2a9f916-fd1d-46cb-90bf-4b10fc7fd511';

describe('toErrorMessage', () => {
  it('uses the API’s own sentence for an ordinary failure', () => {
    expect(toErrorMessage(new ApiError('Rental unit not found', 404, 'NOT_FOUND'))).toBe(
      'Rental unit not found',
    );
  });

  it('names the conflicting stay rather than the envelope’s generic sentence', () => {
    const error = new ApiError('Reservation overlaps an existing booking', 409, 'BOOKING_CONFLICT', [
      { id: 'a', guestName: 'Jane Doe', startDate: '2026-03-12', endDate: '2026-03-15' },
    ]);
    expect(toErrorMessage(error)).toContain('Jane Doe');
  });

  it('falls back for something that is not an error at all', () => {
    expect(toErrorMessage(undefined)).toBe('Something went wrong.');
  });
});

/**
 * The correlation id is what makes the deliberately opaque 500 body workable: the server
 * logs the stack against an id and returns nothing else, so the id has to reach the person
 * looking at the screen or the trade is a straight loss.
 */
describe('correlation id on unexpected failures', () => {
  it('appends the request id to an INTERNAL_ERROR so the user has something to quote', () => {
    const error = new ApiError(
      'An unexpected error occurred',
      500,
      'INTERNAL_ERROR',
      [],
      REQUEST_ID,
    );
    expect(toErrorMessage(error)).toBe(`An unexpected error occurred (reference: ${REQUEST_ID})`);
  });

  it('omits it when the response carried no id, rather than printing undefined', () => {
    const error = new ApiError('An unexpected error occurred', 500, 'INTERNAL_ERROR', []);
    expect(toErrorMessage(error)).toBe('An unexpected error occurred');
  });

  it('leaves an actionable error alone — a conflict needs no reference number', () => {
    const error = new ApiError(
      'Reservation overlaps an existing booking',
      409,
      'BOOKING_CONFLICT',
      undefined,
      REQUEST_ID,
    );
    expect(toErrorMessage(error)).toBe('Reservation overlaps an existing booking');
  });
});
