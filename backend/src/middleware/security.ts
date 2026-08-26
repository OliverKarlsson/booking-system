import cors from 'cors';
import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { env } from '../config/env';
import { RateLimitedError } from '../errors/AppError';

/**
 * `CORS_ORIGIN` is either '*' or a comma-separated allow-list.
 *
 * The default is '*' because this is a demo API with no credentials and no cookies —
 * there is no session for a hostile page to ride. With auth added (the design is in the
 * FAQ), '*' would have to go: `credentials: true` and a wildcard origin are mutually
 * exclusive in the CORS spec precisely because that combination is the vulnerability.
 */
function corsOptions(): cors.CorsOptions {
  if (env.CORS_ORIGIN.trim() === '*') {
    return { origin: true, credentials: false };
  }

  const allowed = env.CORS_ORIGIN.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    origin: allowed,
    credentials: false,
  };
}

/**
 * helmet + CORS, applied to everything.
 *
 * helmet's defaults are the right baseline for a JSON API: it removes `X-Powered-By`,
 * sets `nosniff`, and disables framing. Its CSP default is aimed at HTML responses and
 * is harmless here — but Swagger UI (T3.3) serves HTML from this app, so if that route
 * breaks, the fix is a route-scoped CSP override rather than turning helmet off.
 */
export function securityMiddleware(): RequestHandler[] {
  return [helmet(), cors(corsOptions())];
}

/**
 * Rate limiting for /v1.
 *
 * In-memory, therefore per-process: with more than one API replica the effective limit
 * is the configured value times the replica count. That is a knowingly accepted
 * limitation for a single-container deployment; a real one uses the Redis store so the
 * budget is shared, and the code change is one option.
 *
 * The handler throws instead of writing its own response, so a 429 arrives at the client
 * in the same §3.4 envelope as every other error rather than as express-rate-limit's
 * plain-text default.
 */
export const rateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(new RateLimitedError());
  },
});
