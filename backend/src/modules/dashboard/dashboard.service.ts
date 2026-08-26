import type { DashboardResponse } from '@booking/shared';

import { pool, type Queryable } from '../../db/pool';
import { findDashboardEntries, type DashboardQueryOptions } from './dashboard.repository';

/**
 * The dashboard's business rules are, deliberately, all in the query.
 *
 * That is not laziness about layering — it is the same principle as the exclusion
 * constraint. "Occupied" means `start_date <= D < end_date`, and the only place that
 * comparison can be made against the *right* D is next to the row that knows the unit's
 * timezone. Pulling every active unit and every reservation into TypeScript to redo the
 * comparison here would move the rule away from the data, add an N+1 or a large
 * in-memory join, and create a second definition of the half-open interval that could
 * drift from the constraint's.
 *
 * So this layer stays thin and honest rather than being padded out to look busy. It
 * exists because the route should not know SQL and the repository should not know about
 * the response envelope, and because a future "only units I manage" filter has an
 * obvious home.
 */
export async function getDashboard(
  options: DashboardQueryOptions = {},
  db: Queryable = pool,
): Promise<DashboardResponse> {
  const data = await findDashboardEntries(db, options);
  return { data };
}
