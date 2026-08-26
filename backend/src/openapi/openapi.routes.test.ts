import express, { type Express } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { securityMiddleware } from '../middleware/security';
import { openapiRouter } from './openapi.routes';

/**
 * The router is not mounted by `routes/v1.ts` yet — that file belongs to another task and
 * needs a one-line addition. This suite mounts it exactly as that line will, under the
 * real security middleware, so the mount is the only unverified step.
 *
 * `securityMiddleware()` is included on purpose rather than for realism's sake: helmet's
 * default CSP is aimed at HTML responses, and `/docs` is the one HTML response this API
 * serves. Asserting the headers here is what turns "the CSP probably allows swagger-ui"
 * into something that fails loudly if a helmet upgrade tightens a directive.
 */
function appWithDocs(): Express {
  const app = express();
  app.use(...securityMiddleware());
  app.use('/v1', openapiRouter);
  return app;
}

describe('GET /v1/openapi.json', () => {
  it('serves the document as JSON', async () => {
    const response = await request(appWithDocs()).get('/v1/openapi.json');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body.openapi).toBe('3.1.0');
    expect(response.body.info.title).toBe('Booking System API');
  });

  /**
   * A minimal structural check that the response is a usable OpenAPI 3.1 document and not
   * merely valid JSON: version, info, at least one path, and components.
   */
  it('is a structurally valid OpenAPI 3.1 document', async () => {
    const { body } = await request(appWithDocs()).get('/v1/openapi.json');

    expect(body).toMatchObject({
      openapi: expect.stringMatching(/^3\.1\./),
      info: { title: expect.any(String), version: expect.any(String) },
    });
    expect(Object.keys(body.paths).length).toBeGreaterThan(0);
    expect(Object.keys(body.components.schemas)).toContain('BookingConflictResponse');

    // Every $ref in the document must resolve, or a generated client breaks on a schema
    // that was referenced but never registered.
    const refs = [...JSON.stringify(body).matchAll(/"\$ref":"(#[^"]+)"/g)].map(([, ref]) => ref);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of new Set(refs)) {
      const resolved = ref
        .replace(/^#\//, '')
        .split('/')
        .reduce<unknown>((node, key) => (node as Record<string, unknown>)?.[key], body);
      expect(resolved, `unresolved $ref ${ref}`).toBeDefined();
    }
  });
});

describe('GET /v1/docs', () => {
  it('renders the Swagger UI page', async () => {
    const response = await request(appWithDocs()).get('/v1/docs/');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/html/);
    expect(response.text).toContain('swagger-ui');
  });

  it('serves the init script with the document embedded, not a fetch URL', async () => {
    const response = await request(appWithDocs()).get('/v1/docs/swagger-ui-init.js');

    expect(response.status).toBe(200);
    // Embedding means the page needs no second round trip and this module never has to
    // know which path it was mounted at.
    expect(response.text).toContain('"openapi": "3.1.0"');
  });

  it('is served under a CSP that permits swagger-ui to load', async () => {
    const response = await request(appWithDocs()).get('/v1/docs/');
    const csp = response.headers['content-security-policy'];

    expect(csp).toBeDefined();
    // Same-origin bundles, and the template's one inline <style> block.
    expect(csp).toMatch(/script-src[^;]*'self'/);
    expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/);
  });
});
