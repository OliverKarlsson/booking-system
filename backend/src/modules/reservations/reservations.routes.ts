import { Router } from 'express';
import {
  createReservationSchema,
  reservationQuerySchema,
  updateReservationSchema,
  uuidSchema,
  type CreateReservationInput,
  type ReservationQuery,
  type UpdateReservationInput,
} from '@booking/shared';
import { z } from 'zod';

import { asyncHandler } from '../../middleware/asyncHandler';
import { validate } from '../../middleware/validate';
import * as service from './reservations.service';

/**
 * Reservation routes — mounted at `/v1/reservations` by src/routes/v1.ts.
 *
 * Deliberately thin: parse and validate the request, call the service, serialise the
 * result. No SQL, no branching on business rules, and no error formatting — thrown
 * `AppError`s are translated into the §3.4 envelope by `errorHandler`, so there is one
 * place that decides what a failure looks like on the wire.
 *
 * Overlap prevention lives in neither this file nor the service; it is the exclusion
 * constraint in db/schema.sql. See the header comment in reservations.service.ts.
 */
export const reservationsRouter = Router();

/** A malformed id is a bad request, not a missing resource — it could never identify one. */
const idParamsSchema = z.object({ id: uuidSchema });

reservationsRouter.post(
  '/',
  validate({ body: createReservationSchema }),
  asyncHandler(async (req, res) => {
    const reservation = await service.createReservation(req.body as CreateReservationInput);
    res.status(201).json(reservation);
  }),
);

reservationsRouter.get(
  '/',
  validate({ query: reservationQuerySchema }),
  asyncHandler(async (req, res) => {
    // `validate` writes the parsed value back onto `req.query`, so `page`/`limit` are
    // numbers here and `status` carries its default — the raw strings never reach a
    // handler.
    const page = await service.listReservations(req.query as unknown as ReservationQuery);
    res.status(200).json(page);
  }),
);

reservationsRouter.get(
  '/:id',
  validate({ params: idParamsSchema }),
  asyncHandler(async (req, res) => {
    const reservation = await service.getReservation(req.params.id!);
    res.status(200).json(reservation);
  }),
);

reservationsRouter.patch(
  '/:id',
  validate({ params: idParamsSchema, body: updateReservationSchema }),
  asyncHandler(async (req, res) => {
    const reservation = await service.updateReservation(
      req.params.id!,
      req.body as UpdateReservationInput,
    );
    res.status(200).json(reservation);
  }),
);

reservationsRouter.delete(
  '/:id',
  validate({ params: idParamsSchema }),
  asyncHandler(async (req, res) => {
    // Cancels rather than removes (§3.6). 204 because there is nothing useful to return:
    // the client already knows the id and the only state change is one it requested.
    await service.cancelReservation(req.params.id!);
    res.status(204).end();
  }),
);
