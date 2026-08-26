import { Router } from 'express';

import { dashboardRouter } from '../modules/dashboard/dashboard.routes';
import { rentalUnitsRouter } from '../modules/rentalUnits/rentalUnits.routes';
import { reservationsRouter } from '../modules/reservations/reservations.routes';
import { openapiRouter } from '../openapi/openapi.routes';

/**
 * The `/v1` router.
 *
 * All three feature routers are mounted here in Wave 1, while they are still empty
 * stubs. That is deliberate: a feature agent that had to add its own mount would be
 * editing this file at the same time as two others, which is the one merge conflict a
 * parallel build cannot absorb cheaply. Mounting an empty Router() costs nothing and
 * makes this file finished before any feature work starts.
 *
 * Versioning is a URI prefix (`/v1/...`) rather than a header. It is trivially visible in
 * logs, curl, and a browser address bar, and it lets a future v2 be a second mount on the
 * same process instead of a deployment event. Header-based versioning is more
 * REST-purist and buys nothing at this scale.
 */
export function createV1Router(): Router {
  const router = Router();

  router.use('/rental-units', rentalUnitsRouter);
  router.use('/reservations', reservationsRouter);
  router.use('/dashboard', dashboardRouter);

  // No prefix: this router owns `/openapi.json` and `/docs` itself, neither of which
  // collides with a resource prefix above. It must be mounted here rather than after
  // createApp() returns, because app.ts registers notFoundHandler immediately after
  // `/v1` — anything added later can never match.
  router.use(openapiRouter);

  return router;
}
