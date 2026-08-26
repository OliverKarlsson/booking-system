import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { BookingConflictError, NotFoundError } from '../errors/AppError';
import { errorHandler, notFoundHandler } from './errorHandler';

/** A minimal app whose only job is to throw the error under test. */
function appThrowing(err: unknown) {
  const app = express();
  app.use(express.json());
  app.get('/boom', (_req, _res, next) => next(err));
  app.post('/boom', (_req, _res, next) => next(err));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

describe('errorHandler', () => {
  it('maps an AppError to its status, code and message', async () => {
    const res = await request(appThrowing(new NotFoundError('Rental unit not found'))).get('/boom');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Rental unit not found', code: 'NOT_FOUND' });
  });

  it('carries BOOKING_CONFLICT details through to the client', async () => {
    const conflict = {
      id: '11111111-1111-4111-8111-111111111111',
      guestName: 'Jane Doe',
      startDate: '2026-03-12',
      endDate: '2026-03-15',
    };
    const res = await request(appThrowing(new BookingConflictError([conflict]))).get('/boom');

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('BOOKING_CONFLICT');
    // This payload is the entire reason the racy pre-check exists — see §4.
    expect(res.body.details).toEqual([conflict]);
  });

  it('maps a ZodError to VALIDATION_ERROR with path/message details', async () => {
    const schema = z.object({ guestName: z.string().min(1), startDate: z.string() });
    let zodError: unknown;
    try {
      schema.parse({ guestName: '' });
    } catch (err) {
      zodError = err;
    }

    const res = await request(appThrowing(zodError)).get('/boom');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'guestName' }),
        expect.objectContaining({ path: 'startDate' }),
      ]),
    );
  });

  it('rejects malformed JSON as VALIDATION_ERROR rather than a 500', async () => {
    const res = await request(appThrowing(new Error('unused')))
      .post('/boom')
      .set('Content-Type', 'application/json')
      .send('{ not json');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  /**
   * The one that matters for security: an unrecognised failure must reveal nothing about
   * the internals. A leaked constraint name or query text is a free schema map.
   */
  it('leaks nothing from an unexpected error', async () => {
    const dbError = Object.assign(
      new Error('duplicate key value violates unique constraint "reservations_pkey"'),
      {
        code: '23505',
        constraint: 'reservations_pkey',
        table: 'reservations',
        query: 'INSERT INTO reservations (id, guest_name) VALUES ($1, $2)',
      },
    );

    const res = await request(appThrowing(dbError)).get('/boom');
    const body = JSON.stringify(res.body);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
      details: [],
    });
    for (const secret of ['reservations_pkey', 'INSERT INTO', '23505', 'duplicate key', 'at ']) {
      expect(body).not.toContain(secret);
    }
  });

  it('answers an unmatched route with the same envelope', async () => {
    const res = await request(appThrowing(new Error('unused'))).get('/nope');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });
});
