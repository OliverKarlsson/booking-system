import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Correlation id, set by the `requestId` middleware before anything else runs. */
      id: string;
    }
  }
}

/** Only accept an inbound id that looks like one. See below. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Attaches a correlation id to every request, echoes it in `X-Request-Id`, and makes it
 * available to the error log.
 *
 * This is what makes the deliberately opaque 500 body (see errorHandler.ts) workable: the
 * client gets an id, the log holds the stack trace, and support can join the two without
 * the response ever carrying anything sensitive.
 *
 * An inbound `X-Request-Id` is honoured so a trace survives across services, but only
 * after being pattern-checked. The value is written into log lines, and an unvalidated
 * client-controlled string there is a log-injection vector — a newline plus a fabricated
 * log entry is enough to make the logs lie.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.header('x-request-id');
  req.id = inbound && SAFE_REQUEST_ID.test(inbound) ? inbound : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
