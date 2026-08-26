import { Router } from 'express';

/**
 * Reservation routes — mounted at `/v1/reservations` by src/routes/v1.ts.
 *
 * Stub created in Wave 1 and already wired up, so T2.2 can implement §3.6 by editing
 * this file alone. Do not rename the export: `v1.ts` imports it by name and is not owned
 * by that task.
 *
 * Read §4 before implementing: overlap prevention belongs to the exclusion constraint in
 * src/db/schema.sql. The pre-flight SELECT exists only to build a useful 409 payload.
 */
export const reservationsRouter = Router();
