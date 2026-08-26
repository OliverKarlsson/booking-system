import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';
import type { ErrorResponse } from '@booking/shared';

import { isAppError } from '../errors/AppError';

/**
 * The envelope from §3.4, taken from the shared contract rather than restated here — the
 * frontend parses responses with the same schema `ErrorResponse` is inferred from, so the
 * two cannot disagree about the shape.
 */
type ErrorEnvelope = ErrorResponse;

interface ZodErrorShape {
  name: string;
  issues: Array<{ path: PropertyKey[]; message: string }>;
}

/**
 * Duck-typed instead of `instanceof ZodError`.
 *
 * The schemas live in @booking/shared and are compiled against that workspace's copy of
 * zod. If npm ever resolves a second copy into backend/node_modules, `instanceof` starts
 * returning false and every validation failure silently becomes a 500. Matching on shape
 * is immune to that, and the shape here is stable.
 */
function asZodError(err: unknown): ZodErrorShape | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const candidate = err as Partial<ZodErrorShape>;
  return candidate.name === 'ZodError' && Array.isArray(candidate.issues)
    ? (candidate as ZodErrorShape)
    : undefined;
}

/** `express.json()` rejects malformed JSON before any route sees it. */
function isBodyParseError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { type?: string }).type === 'entity.parse.failed'
  );
}

function isPayloadTooLarge(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { type?: string }).type === 'entity.too.large'
  );
}

function send(res: Response, status: number, envelope: ErrorEnvelope): void {
  res.status(status).json(envelope);
}

/**
 * Terminal error middleware. Maps every failure to the §3.4 envelope.
 *
 * The rule that matters here is the last branch: an unrecognised error yields a fixed,
 * generic message and nothing else. No stack trace, no `err.message`, no SQL, no
 * constraint or table name. Two reasons, and the security one is only the second:
 *
 *  1. A driver error message is a free schema map — table names, column names, and the
 *     text of the failing query are exactly what an attacker probing the API wants.
 *  2. The client can do nothing with it anyway. An error the API did not anticipate is
 *     by definition not one the caller can handle, so the only useful artefact is the
 *     request id, which lets a human find the full detail in the log.
 *
 * Recognised errors are the opposite case: their messages are written for the client and
 * are safe by construction.
 */
export const errorHandler: ErrorRequestHandler = (
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Once the response has started, Express's default handler must take over — it aborts
  // the connection. Trying to write a second body here corrupts the first one.
  if (res.headersSent) {
    next(err);
    return;
  }

  const zodError = asZodError(err);
  if (zodError) {
    send(res, 400, {
      error: 'Request validation failed',
      code: 'VALIDATION_ERROR',
      details: zodError.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    });
    return;
  }

  if (isBodyParseError(err)) {
    send(res, 400, {
      error: 'Request body is not valid JSON',
      code: 'VALIDATION_ERROR',
      details: [],
    });
    return;
  }

  if (isPayloadTooLarge(err)) {
    send(res, 400, {
      error: 'Request body is too large',
      code: 'VALIDATION_ERROR',
      details: [],
    });
    return;
  }

  if (isAppError(err)) {
    send(res, err.status, {
      error: err.message,
      code: err.code,
      ...(err.details !== undefined ? { details: err.details } : {}),
    });
    return;
  }

  console.error('[error] unhandled', {
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
  });

  send(res, 500, {
    error: 'An unexpected error occurred',
    code: 'INTERNAL_ERROR',
    details: [],
  });
};

/** 404 for unmatched routes, in the same envelope as everything else. */
export function notFoundHandler(req: Request, res: Response): void {
  send(res, 404, {
    error: `Cannot ${req.method} ${req.path}`,
    code: 'NOT_FOUND',
    details: [],
  });
}
