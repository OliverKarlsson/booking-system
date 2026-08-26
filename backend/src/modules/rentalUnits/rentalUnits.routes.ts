import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import {
  createRentalUnitSchema,
  paginationQuerySchema,
  updateRentalUnitSchema,
  uuidSchema,
  type CreateRentalUnitInput,
  type PaginationQuery,
  type UpdateRentalUnitInput,
} from '@booking/shared';
import { z } from 'zod';

import { validate, validateBody, validateQuery } from '../../middleware/validate';
import { rentalUnitsService } from './rentalUnits.service';

/**
 * Rental unit routes — mounted at `/v1/rental-units` by src/routes/v1.ts.
 *
 * Handlers do three things and nothing else: hand the validated input to the service, pick
 * the success status, and serialise. Every failure path is a thrown `AppError` that
 * `errorHandler` translates into the §3.4 envelope, so no route here formats an error
 * response and none of them can drift from the contract.
 *
 * Do not rename the export: `v1.ts` imports it by name and is owned by another task.
 */
export const rentalUnitsRouter = Router();

/**
 * Express 4 does not await handlers, so a rejected promise from an `async` route is an
 * unhandled rejection that hangs the request until the client times out — the error
 * middleware is never reached. This adapter forwards the rejection to `next()`.
 *
 * (Express 5 does this natively. It is kept local to this module rather than added to
 * `middleware/` because that directory belongs to another task in this build; hoisting it
 * to a shared helper is a Wave 4 cleanup, not a behaviour change.)
 */
function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

/**
 * A malformed id is a 400, not a 404.
 *
 * `/rental-units/not-a-uuid` cannot identify a resource in any state of the database, so
 * "does not exist" would be a guess dressed as a fact. 400 tells the caller the request
 * itself is wrong, which is the actionable answer — and it keeps a garbage path parameter
 * from reaching Postgres as a failed `uuid` cast that surfaces as a 500.
 */
const idParamsSchema = z.object({ id: uuidSchema });

rentalUnitsRouter.post(
  '/',
  validateBody(createRentalUnitSchema),
  asyncHandler(async (req, res) => {
    const unit = await rentalUnitsService.create(req.body as CreateRentalUnitInput);
    res.status(201).json(unit);
  }),
);

rentalUnitsRouter.get(
  '/',
  validateQuery(paginationQuerySchema),
  asyncHandler(async (req, res) => {
    // `validate` writes the parsed result back onto the request, so `page`/`limit` are
    // numbers with defaults applied by the time they arrive here — not the raw strings
    // Express parsed out of the query string.
    const result = await rentalUnitsService.list(req.query as unknown as PaginationQuery);
    res.status(200).json(result);
  }),
);

rentalUnitsRouter.get(
  '/:id',
  validate({ params: idParamsSchema }),
  asyncHandler(async (req, res) => {
    const unit = await rentalUnitsService.getById(req.params.id as string);
    res.status(200).json(unit);
  }),
);

rentalUnitsRouter.patch(
  '/:id',
  validate({ params: idParamsSchema, body: updateRentalUnitSchema }),
  asyncHandler(async (req, res) => {
    const unit = await rentalUnitsService.update(
      req.params.id as string,
      req.body as UpdateRentalUnitInput,
    );
    res.status(200).json(unit);
  }),
);

/**
 * 204 with no body. The resource is gone from the client's point of view, so there is
 * nothing meaningful to return; the two interesting answers on this route are the
 * failures, 404 and 409 `UNIT_HAS_RESERVATIONS`.
 */
rentalUnitsRouter.delete(
  '/:id',
  validate({ params: idParamsSchema }),
  asyncHandler(async (req, res) => {
    await rentalUnitsService.remove(req.params.id as string);
    res.status(204).send();
  }),
);
