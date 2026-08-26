import { defineWorkspace } from 'vitest/config';

/**
 * Two projects, split by whether a test needs a real database.
 *
 * `unit` is fast and has no external dependency, so it runs anywhere — including on a
 * machine with no Docker. `integration` talks to the Postgres from docker-compose. The
 * split exists so that "these tests need a database" is a property of a named subset
 * rather than of the whole suite, and so a failure is unambiguous about which kind of
 * thing broke.
 *
 * Integration tests are NOT run against a mock or an in-memory Postgres substitute. The
 * exclusion constraint *is* the booking rule, so testing it against something that only
 * pretends to be Postgres would assert nothing worth knowing.
 *
 *   npm run test:unit          # no database required
 *   npm run test:integration   # needs `docker compose up -d db`
 */
const INTEGRATION_GLOB = 'src/**/*.integration.test.ts';

/** Matches the host port published by docker-compose's `db` service. */
const DEFAULT_DATABASE_URL = 'postgres://booking:booking@localhost:5433/booking';

export default defineWorkspace([
  {
    test: {
      name: 'unit',
      environment: 'node',
      include: ['src/**/*.test.ts'],
      exclude: ['**/node_modules/**', 'dist/**', INTEGRATION_GLOB],
      env: {
        NODE_ENV: 'test',
        // Never connected to by this project — present only because config/env.ts
        // refuses to load without it, which is the behaviour we want in production.
        DATABASE_URL: DEFAULT_DATABASE_URL,
      },
    },
  },
  {
    test: {
      name: 'integration',
      environment: 'node',
      include: [INTEGRATION_GLOB],
      setupFiles: ['src/test/setup.integration.ts'],
      // One database, and `truncateAll` wipes it between tests — two test files running
      // concurrently delete each other's fixtures mid-assertion (observed as deadlocks,
      // FK violations, and length assertions seeing another file's rows).
      //
      // NOTE: `fileParallelism` is a ROOT-level option in Vitest 2 and is NOT honoured
      // here inside a workspace project — it is kept for intent, but the setting that
      // actually takes effect is `--no-file-parallelism` in the `test:integration` and
      // `test` scripts. Run integration tests via those scripts, not a bare
      // `vitest run --project integration`, or they will race.
      //
      // Serialising files is the cheap correct answer at this suite size; the scalable
      // one is a schema (or database) per worker, which would let this run in parallel.
      fileParallelism: false,
      testTimeout: 30_000,
      hookTimeout: 30_000,
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
      },
    },
  },
]);
