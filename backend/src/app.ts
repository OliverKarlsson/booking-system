import express, { type Express, type Request, type Response } from 'express';

import { checkDatabase } from './db/pool';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestId } from './middleware/requestId';
import { rateLimiter, securityMiddleware } from './middleware/security';
import { createV1Router } from './routes/v1';

/**
 * Builds the Express app without starting a server.
 *
 * Keeping construction separate from `listen()` (which lives in server.ts) is what lets
 * integration tests drive the real app through supertest on an ephemeral port, with the
 * same middleware stack the deployed process runs. A module that binds a port on import
 * cannot be tested that way.
 */
export function createApp(): Express {
  const app = express();

  // helmet also removes this, but not before an error thrown earlier in the stack could
  // have been served by Express's defaults.
  app.disable('x-powered-by');

  // First, so that everything downstream — including the error log — has a correlation
  // id to attach.
  app.use(requestId);
  app.use(...securityMiddleware());

  // A hard body cap. Reservations and rental units are a few hundred bytes; anything
  // approaching 100kB is a mistake or an attempt, and rejecting it at the parser is
  // cheaper than at the validator.
  app.use(express.json({ limit: '100kb' }));

  /**
   * Liveness/readiness.
   *
   * The check runs `SELECT 1` rather than just returning 200, because "the process is
   * up" is not the question an orchestrator is asking. An API whose database is gone
   * answers every real request with a 500 while a process-only health check reports
   * healthy, so the container is never restarted and never pulled out of the load
   * balancer — the check actively prevents the recovery it exists to trigger.
   *
   * Deliberately outside `/v1` and outside the §3.4 envelope: this is an infrastructure
   * endpoint for Docker and orchestrators, not part of the client-facing API contract,
   * so it is not versioned and its 503 body is a status document rather than an error.
   */
  app.get('/health', async (_req: Request, res: Response) => {
    try {
      await checkDatabase();
      res.status(200).json({ status: 'ok', database: 'up' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down' });
    }
  });

  // Rate limiting covers /v1 only. Health checks fire on a fixed interval from the
  // container runtime and must never be throttled — a 429 there reads as an unhealthy
  // container and triggers a restart loop.
  app.use('/v1', rateLimiter, createV1Router());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
