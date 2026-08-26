import pg from 'pg';

import { env } from '../config/env';

/**
 * 1082 is the OID of Postgres `date`. Return the value verbatim as 'YYYY-MM-DD'.
 *
 * This one line is load-bearing. By default node-postgres parses a `date` column into a
 * JavaScript `Date`, which is an *instant* — it stamps the value with the process
 * timezone, and `2026-03-26` read on a server running UTC-5 becomes an object that
 * formats as 25 March for half the code that touches it. The whole reason reservation
 * dates are stored as `date` rather than `timestamptz` is that a calendar date has no
 * offset for anything to shift by; letting the driver reattach one puts back exactly the
 * bug the column type was chosen to eliminate.
 *
 * So dates stay strings from the driver all the way out to JSON, and comparisons happen
 * either in Postgres (`daterange`, the exclusion constraint) or as string comparisons in
 * TypeScript — for zero-padded ISO dates, lexicographic order is chronological order.
 *
 * Set before the pool is constructed, because the parser registry is consulted per
 * result, globally, for the whole `pg` module.
 */
pg.types.setTypeParser(1082, (value: string) => value);

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.PG_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

/**
 * An idle client that dies (database restart, network blip) emits 'error' on the pool.
 * Without a listener that is an unhandled 'error' event, which takes the process down —
 * a transient database hiccup should not be fatal to the API.
 */
pool.on('error', (err: Error) => {
  console.error('[db] idle client error', { message: err.message });
});

/**
 * Anything that can run a query: the pool itself, or a single client inside a
 * transaction. Repositories take this rather than the pool directly, so the same
 * function works standalone and as part of a larger transaction.
 */
export type Queryable = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    // Rollback is itself allowed to fail (a dead connection cannot roll back). Swallow
    // that failure so the original error — the one that explains what went wrong —
    // is what propagates, rather than being masked by the cleanup.
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Used by GET /health. Cheap, and it proves an actual round trip to Postgres. */
export async function checkDatabase(): Promise<void> {
  await pool.query('SELECT 1');
}

export async function closePool(): Promise<void> {
  await pool.end();
}
