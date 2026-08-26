import { PAGINATION_DEFAULTS, paginationQuerySchema } from '@booking/shared';

import './registry';

/**
 * The shared pagination query with per-parameter documentation attached.
 *
 * Note what is *not* here: no bounds, no defaults, no types. `type: integer`,
 * `minimum: 1`, `maximum: 100` and `default: 20` are read straight off
 * `paginationQuerySchema.shape`, which is the object that actually validates the request.
 * Each field below is that exact schema instance with prose attached — rebuilding it with
 * a repeated `.min(1).max(100)` would be a second definition free to drift from the first,
 * which is the failure this whole module exists to prevent.
 *
 * The bare `./registry` import is load-bearing: that module is what extends zod with
 * `.openapi()`, and it has to have run before the calls below.
 */
export const paginationQuery = paginationQuerySchema.extend({
  page: paginationQuerySchema.shape.page.openapi({
    param: { description: '1-based page number. A page past the end is an empty `data` with honest metadata, not a 404 — the collection exists, the client simply asked for a slice beyond it.' },
  }),
  limit: paginationQuerySchema.shape.limit.openapi({
    param: {
      description: `Items per page (default ${PAGINATION_DEFAULTS.limit}, maximum ${PAGINATION_DEFAULTS.maxLimit}). An over-large value is rejected with a 400 rather than silently clamped: a client asking for 1000 rows and receiving ${PAGINATION_DEFAULTS.maxLimit} with no signal is a harder bug to notice than an error.`,
    },
  }),
});
