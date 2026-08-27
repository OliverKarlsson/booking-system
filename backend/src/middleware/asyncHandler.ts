import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Adapts an `async` route handler to Express 4's synchronous error convention.
 *
 * Express 4 does not await handlers, so a rejected promise from an `async` route is an
 * unhandled rejection: `errorHandler` never runs, nothing is logged, and the request
 * hangs until the client times out. That failure mode is silent in development, where
 * handlers rarely reject, and total in production. This adapter forwards the rejection to
 * `next()` so an async throw lands in `errorHandler` exactly like a synchronous one — and
 * therefore comes back as the §3.4 envelope rather than as nothing at all.
 *
 * Express 5 does this natively; the wrapper is the cost of staying on 4. Keeping it in one
 * place means "did this route remember to catch?" is answered by looking at whether it is
 * wrapped, rather than by reading each handler.
 */
export function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}
