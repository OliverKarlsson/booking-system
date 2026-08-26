import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { pool } from './pool';

/**
 * Applies src/db/schema.sql on boot.
 *
 * A real deployment would use versioned, ordered migrations — node-pg-migrate, Flyway,
 * sqitch — with an `applied_migrations` table, so every schema change is reviewable,
 * replayable and reversible. That toolchain is deliberately out of scope for a four-hour
 * build. Applying one idempotent schema file wholesale is correct only while the schema
 * moves forward from empty and nothing is ever altered; the first `ALTER TABLE` makes
 * this the wrong tool, and that is the moment to introduce the real one.
 */

/**
 * A fixed, arbitrary key for `pg_advisory_lock`. Two API replicas booting simultaneously
 * would otherwise both run `CREATE TABLE IF NOT EXISTS`, and Postgres's DDL is not
 * race-free under that pattern — the losing transaction fails with a duplicate key error
 * on a catalog table rather than politely no-opping. The lock serialises boot-time
 * migration across every process pointed at this database.
 */
const MIGRATION_ADVISORY_LOCK_ID = 8_472_019;

function resolveSchemaPath(): string {
  const candidates = [
    // Compiled: `npm run build` copies schema.sql next to the emitted JS.
    path.join(__dirname, 'schema.sql'),
    // Running from source (tsx, vitest) — and the fallback if the copy step is skipped.
    path.join(__dirname, '..', '..', 'src', 'db', 'schema.sql'),
  ];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    throw new Error(`Could not locate schema.sql. Looked in:\n${candidates.join('\n')}`);
  }
  return found;
}

export function readSchemaSql(): string {
  return readFileSync(resolveSchemaPath(), 'utf8');
}

export async function migrate(): Promise<void> {
  const sql = readSchemaSql();
  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_ADVISORY_LOCK_ID]);
    try {
      await client.query(sql);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_ADVISORY_LOCK_ID]);
    }
  } finally {
    client.release();
  }
}
