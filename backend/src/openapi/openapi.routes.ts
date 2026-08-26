import { Router, type Request, type Response } from 'express';
import swaggerUi, { type SwaggerUiOptions } from 'swagger-ui-express';

import { openApiDocument } from './document';

/**
 * The documentation routes: `GET /v1/openapi.json` and `GET /v1/docs`.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 *  MOUNTING: this router is not mounted yet. One line is needed elsewhere.
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * `src/routes/v1.ts` mounts the three feature routers under path prefixes and is owned by
 * another task in this build, so there is no seam this router can reach through and it
 * cannot mount itself. It needs one line added there:
 *
 *     router.use(openapiRouter);   // import { openapiRouter } from '../openapi/openapi.routes'
 *
 * Mounted without a prefix, because the two paths it serves are siblings of the feature
 * resources rather than children of one. Order is irrelevant: neither `/openapi.json` nor
 * `/docs` collides with a resource prefix.
 *
 * Everything below is exercised by openapi.routes.test.ts through a router mounted exactly
 * that way, so the mount is the only outstanding step rather than an untested one.
 */
export const openapiRouter = Router();

/**
 * Generated once, here, rather than per request: generation walks every registered Zod
 * schema, and the result cannot change while the process is running.
 */
const document = openApiDocument();

/**
 * The machine-readable contract, at a stable versioned URL.
 *
 * Served from the running instance rather than shipped as a file, so a client generator —
 * or the MCP wrapper this makes cheap — reads the spec belonging to the deployment it is
 * actually talking to, instead of one that may be older.
 */
openapiRouter.get('/openapi.json', (_req: Request, res: Response): void => {
  res.status(200).json(document);
});

/**
 * Swagger UI.
 *
 * `serveFiles(document, …)` rather than the more commonly seen `serve`: `serve` keeps the
 * generated init script in a module-level variable shared by every mount in the process,
 * which is fine for exactly one mount and a latent bug the moment there are two (a v2
 * document, or a test mounting a second app). `serveFiles` closes over its own document.
 *
 * The document is embedded rather than fetched by URL. That renders the page without a
 * second round trip and, more usefully, means this module never has to know which path it
 * was mounted at — a `swaggerUrl` would hard-code `/v1/openapi.json` here and give the
 * mount two places to go wrong instead of one.
 *
 * No CSP override is needed despite helmet's defaults applying to this HTML: swagger-ui
 * loads its bundles as same-origin `<script src>` (covered by `script-src 'self'`) and its
 * only inline CSS is a `<style>` block, which helmet's default `style-src` permits through
 * `'unsafe-inline'`. If a future helmet default tightens that, the fix is a route-scoped
 * `helmet.contentSecurityPolicy()` on this router — not relaxing it for the whole API.
 */
const swaggerOptions: SwaggerUiOptions = {
  customSiteTitle: 'Booking System API',
  swaggerOptions: { displayRequestDuration: true },
};

openapiRouter.use(
  '/docs',
  swaggerUi.serveFiles(document, swaggerOptions),
  swaggerUi.setup(document, swaggerOptions),
);
