/**
 * `@booking/shared` — the API contract, imported by both the backend and the frontend.
 *
 * Sharing the Zod schemas rather than duplicating validation on each side is the point
 * of the package: the request the browser validates before sending is validated by the
 * identical schema on the server, and the OpenAPI document is generated from the same
 * objects, so the three cannot disagree.
 */
export * from './dates';
export * from './errors';
export * from './types';
export * from './schemas/common';
export * from './schemas/rentalUnit';
export * from './schemas/reservation';
export * from './schemas/dashboard';
