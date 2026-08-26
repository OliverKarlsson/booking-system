import { describe, expect, it } from 'vitest';

import { openApiDocument } from './document';

/**
 * These assert that the document *describes the API that exists*, which is the only
 * property that makes generating it worthwhile.
 *
 * The schema shapes themselves are not re-asserted here — they come from the Zod objects
 * that validate every request, and @booking/shared already tests those. What is worth
 * pinning is everything the generator could silently drop: an endpoint, a query parameter,
 * a documented error code, or the `BOOKING_CONFLICT` example that is the reason `details`
 * exists at all.
 */

const document = openApiDocument();

const operation = (path: string, method: string): Record<string, unknown> => {
  const item = (document.paths ?? {})[path] as Record<string, Record<string, unknown>> | undefined;
  const op = item?.[method];
  if (!op) throw new Error(`No ${method.toUpperCase()} ${path} in the document`);
  return op;
};

const statusesOf = (path: string, method: string): string[] =>
  Object.keys(operation(path, method).responses as Record<string, unknown>).sort();

describe('OpenAPI document', () => {
  it('is OpenAPI 3.1 with the version pinned in the base URL, not a header', () => {
    expect(document.openapi).toBe('3.1.0');
    expect(document.servers).toEqual([expect.objectContaining({ url: '/v1' })]);
  });

  it('covers every endpoint in the contract, and nothing else', () => {
    const operations = Object.entries(document.paths ?? {})
      .flatMap(([path, item]) => Object.keys(item as object).map((method) => `${method.toUpperCase()} ${path}`))
      .sort();

    expect(operations).toEqual([
      'DELETE /rental-units/{id}',
      'DELETE /reservations/{id}',
      'GET /dashboard',
      'GET /rental-units',
      'GET /rental-units/{id}',
      'GET /reservations',
      'GET /reservations/{id}',
      'PATCH /rental-units/{id}',
      'PATCH /reservations/{id}',
      'POST /rental-units',
      'POST /reservations',
    ]);
  });

  /** Client generators name their methods after these, so a missing one is a worse API. */
  it('gives every operation a stable operationId', () => {
    const ids = Object.values(document.paths ?? {})
      .flatMap((item) => Object.values(item as Record<string, { operationId?: string }>))
      .map((op) => op.operationId);

    expect(ids).not.toContain(undefined);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe('response codes match what the routes actually return', () => {
    it.each([
      ['/rental-units', 'post', ['201', '400', '429', '500']],
      ['/rental-units', 'get', ['200', '400', '429', '500']],
      ['/rental-units/{id}', 'get', ['200', '400', '404', '429', '500']],
      ['/rental-units/{id}', 'patch', ['200', '400', '404', '429', '500']],
      // 409 UNIT_HAS_RESERVATIONS is unique to this operation.
      ['/rental-units/{id}', 'delete', ['204', '400', '404', '409', '429', '500']],
      // 404 here is RENTAL_UNIT_NOT_FOUND, 409 is BOOKING_CONFLICT.
      ['/reservations', 'post', ['201', '400', '404', '409', '429', '500']],
      ['/reservations', 'get', ['200', '400', '429', '500']],
      ['/reservations/{id}', 'get', ['200', '400', '404', '429', '500']],
      ['/reservations/{id}', 'patch', ['200', '400', '404', '409', '429', '500']],
      ['/reservations/{id}', 'delete', ['204', '400', '404', '429', '500']],
      ['/dashboard', 'get', ['200', '400', '429', '500']],
    ])('%s %s', (path, method, expected) => {
      expect(statusesOf(path, method)).toEqual(expected);
    });
  });

  it('documents a malformed path id as 400, not 404', () => {
    const example = (operation('/reservations/{id}', 'get').responses as Record<string, any>)['400']
      .content['application/json'].example;

    expect(example.code).toBe('VALIDATION_ERROR');
    expect(example.details).toEqual([{ path: 'id', message: 'Must be a UUID' }]);
  });

  it('keeps NOT_FOUND and RENTAL_UNIT_NOT_FOUND distinct', () => {
    const reservationNotFound = (
      operation('/reservations/{id}', 'get').responses as Record<string, any>
    )['404'].content['application/json'].example;
    const unitMissingOnCreate = (operation('/reservations', 'post').responses as Record<string, any>)[
      '404'
    ].content['application/json'].example;

    expect(reservationNotFound.code).toBe('NOT_FOUND');
    expect(unitMissingOnCreate.code).toBe('RENTAL_UNIT_NOT_FOUND');
  });

  /**
   * The payload the UI needs to say "conflicts with Jane Doe, 12–15 March". An example
   * with an empty `details` would document the field without showing what it is for, so
   * the population is asserted, not just the presence of the response.
   */
  it('gives BOOKING_CONFLICT a populated, realistic details example', () => {
    for (const [path, method] of [
      ['/reservations', 'post'],
      ['/reservations/{id}', 'patch'],
    ] as const) {
      const response = (operation(path, method).responses as Record<string, any>)['409'];
      const example = response.content['application/json'].example;

      expect(example.code).toBe('BOOKING_CONFLICT');
      expect(example.details).toHaveLength(1);
      expect(example.details[0]).toEqual({
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        guestName: expect.any(String),
        startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        endDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      });
      // The conflicting reservation's own dates must be a legal stay, or the example is
      // teaching a shape the API could never produce.
      expect(example.details[0].endDate > example.details[0].startDate).toBe(true);
      expect(response.content['application/json'].schema.$ref).toBe(
        '#/components/schemas/BookingConflictResponse',
      );
    }
  });

  it('documents every query parameter the routes accept', () => {
    const names = (path: string, method: string): string[] =>
      ((operation(path, method).parameters ?? []) as Array<{ in: string; name: string }>)
        .filter((parameter) => parameter.in === 'query')
        .map((parameter) => parameter.name)
        .sort();

    expect(names('/rental-units', 'get')).toEqual(['limit', 'page']);
    expect(names('/reservations', 'get')).toEqual([
      'from',
      'limit',
      'page',
      'rentalUnitId',
      'status',
      'to',
    ]);
    // The dashboard takes no date. `now` is the test-only clock override, and the
    // description has to say so — an undisclaimed parameter reads as a feature.
    expect(names('/dashboard', 'get')).toEqual(['now']);
    const now = ((operation('/dashboard', 'get').parameters ?? []) as Array<any>)[0];
    expect(now.description).toMatch(/test-only/i);
  });

  it('describes every query parameter at the parameter level, where tooling reads it', () => {
    for (const [path, method] of [
      ['/rental-units', 'get'],
      ['/reservations', 'get'],
      ['/dashboard', 'get'],
    ] as const) {
      const parameters = (operation(path, method).parameters ?? []) as Array<any>;
      for (const parameter of parameters.filter((p) => p.in === 'query')) {
        expect(parameter.description, `${method} ${path} ?${parameter.name}`).toEqual(
          expect.any(String),
        );
      }
    }
  });

  it('carries the defaults and bounds from the shared pagination schema', () => {
    const parameters = (operation('/reservations', 'get').parameters ?? []) as Array<any>;
    const limit = parameters.find((parameter) => parameter.name === 'limit');
    const status = parameters.find((parameter) => parameter.name === 'status');

    expect(limit.schema).toMatchObject({ type: 'integer', minimum: 1, maximum: 100, default: 20 });
    // Defaulting to `confirmed` is a contract detail a client would otherwise have to
    // discover by experiment.
    expect(status.schema).toMatchObject({ default: 'confirmed' });
  });

  it('generates schemas from the shared Zod objects rather than restating them', () => {
    const schemas = document.components?.schemas as Record<string, any>;

    // Dates are calendar strings, never date-time — the single most important thing a
    // client can read off this document.
    expect(schemas.Reservation.properties.startDate).toMatchObject({ type: 'string' });
    expect(schemas.Reservation.properties.startDate.format).toBeUndefined();
    // ...while the audit timestamps genuinely are instants.
    expect(schemas.Reservation.properties.createdAt).toMatchObject({ format: 'date-time' });

    expect(schemas.RentalUnit.required).toContain('timezone');
    expect(schemas.CreateRentalUnit.required).toEqual(
      expect.arrayContaining(['name', 'timezone']),
    );
    // `status` is not creatable: it would be an unguarded second route around the delete
    // rule.
    expect(Object.keys(schemas.CreateRentalUnit.properties)).not.toContain('status');
    expect(Object.keys(schemas.CreateReservation.properties)).not.toContain('status');
    // Moving a booking between properties is a cancel-and-rebook, not an edit.
    expect(Object.keys(schemas.UpdateReservation.properties)).not.toContain('rentalUnitId');
  });

  it('uses the list envelope for collections and returns single resources bare', () => {
    const schemas = document.components?.schemas as Record<string, any>;

    expect(Object.keys(schemas.PaginatedReservations.properties).sort()).toEqual([
      'data',
      'pagination',
    ]);
    expect(
      (operation('/reservations/{id}', 'get').responses as Record<string, any>)['200'].content[
        'application/json'
      ].schema.$ref,
    ).toBe('#/components/schemas/Reservation');
    // The dashboard is wrapped but deliberately not paginated.
    expect(Object.keys(schemas.DashboardResponse.properties)).toEqual(['data']);
  });

  it('parses as JSON with no undefined leaking into the served document', () => {
    const serialised = JSON.stringify(document);

    expect(serialised).not.toContain('undefined');
    expect(JSON.parse(serialised)).toMatchObject({ openapi: '3.1.0' });
  });
});
