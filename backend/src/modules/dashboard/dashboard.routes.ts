import { dashboardQuerySchema, type DashboardQuery } from '@booking/shared';
import { Router, type NextFunction, type Request, type Response } from 'express';

import { validateQuery } from '../../middleware/validate';
import { getDashboard } from './dashboard.service';

/**
 * Dashboard routes — mounted at `/v1/dashboard` by src/routes/v1.ts, so the endpoint
 * itself is `router.get('/', …)` here. Do not rename the export: `v1.ts` imports it by
 * name and is not owned by this task.
 */
export const dashboardRouter = Router();

/**
 * `GET /v1/dashboard` (§3.6).
 *
 * **The client sends no date.** This is the part of the API worth defending: a
 * `?date=` parameter would look more flexible and would be wrong, because the caller
 * does not know what day it is at the property. Occupancy is a fact about the flat —
 * whether someone is asleep in it right now — so the only date that answers the question
 * is the one in force at that address. The server resolves it per unit from the unit's
 * own IANA timezone (§3.7), and echoes it back as `localDate` so the answer is
 * inspectable rather than opaque.
 *
 * `?now=` is the sole exception and is **test-only**, not part of the client-facing
 * contract: it overrides the server clock so boundary cases can be asserted
 * deterministically. Note that it is an *instant*, not a date — it is still converted to
 * a calendar date per unit, in that unit's zone, so even this escape hatch cannot smuggle
 * a viewer's timezone into the calculation.
 *
 * There is no pagination here. Unlike the reservation list this is one row per active
 * unit, it is the landing page, and a partial dashboard is a worse answer than a slow
 * one; if a portfolio ever grew large enough to need it, the §3.5 envelope is already
 * defined and this endpoint would adopt it rather than invent something.
 */
dashboardRouter.get(
  '/',
  validateQuery(dashboardQuerySchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Safe by construction: `validateQuery` writes the parsed value back onto
      // `req.query`, so this is the schema's output type, not the raw string map.
      const { now } = req.query as unknown as DashboardQuery;
      res.status(200).json(await getDashboard({ now }));
    } catch (err) {
      // Express 4 does not catch rejections from async handlers — an unforwarded one
      // hangs the request until it times out instead of producing a 500.
      next(err);
    }
  },
);
