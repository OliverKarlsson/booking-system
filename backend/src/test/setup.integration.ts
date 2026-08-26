import { afterAll, afterEach, beforeAll } from 'vitest';

import { migrate } from '../db/migrate';
import { closePool } from '../db/pool';
import { truncateAll } from './db';

/**
 * Shared lifecycle for every integration test file.
 *
 * These run against the real Postgres from docker-compose, not a mock or an in-memory
 * substitute. That is not fussiness: the exclusion constraint *is* the booking rule, so a
 * test against a fake database would verify nothing that matters — it would confirm the
 * application code we already know is not the thing enforcing correctness.
 *
 * Vitest gives each test file its own worker and module registry, so each file gets its
 * own pool and closes it. Files do not run in parallel (see vitest.config.ts) because
 * they share one database and `truncateAll` is global.
 */
beforeAll(async () => {
  await migrate();
  await truncateAll();
}, 30_000);

afterEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closePool();
});
