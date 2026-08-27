import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { requestId } from './requestId';
import { securityMiddleware } from './security';

/** A minimal app carrying the real security stack. */
function app() {
  const instance = express();
  instance.use(requestId);
  instance.use(...securityMiddleware());
  instance.get('/thing', (_req, res) => {
    res.json({ ok: true });
  });
  return instance;
}

/**
 * The API is meant to serve a web app *and* a mobile app, so a caller on another origin is
 * a first-class consumer rather than an edge case.
 *
 * Browsers hide every response header from JavaScript except the seven CORS-safelisted
 * ones, and they do it silently — `response.headers.get(...)` returns null rather than
 * throwing, so an omission here looks exactly like a server that never sent the header.
 * These assertions exist because that failure is invisible from the client side.
 */
describe('CORS exposed headers', () => {
  it('exposes the correlation id, without which an opaque 500 is unreportable', async () => {
    const res = await request(app()).get('/thing').set('Origin', 'http://localhost:5173');

    const exposed = String(res.headers['access-control-expose-headers'] ?? '').toLowerCase();
    expect(exposed).toContain('x-request-id');
  });

  it('exposes the rate-limit headers, so a client can back off instead of guessing', async () => {
    const res = await request(app()).get('/thing').set('Origin', 'http://localhost:5173');

    const exposed = String(res.headers['access-control-expose-headers'] ?? '').toLowerCase();
    expect(exposed).toContain('retry-after');
    expect(exposed).toContain('ratelimit-remaining');
  });

  it('still sets X-Request-Id itself, which is what the exposure is for', async () => {
    const res = await request(app()).get('/thing').set('Origin', 'http://localhost:5173');

    expect(res.headers['x-request-id']).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
  });
});
