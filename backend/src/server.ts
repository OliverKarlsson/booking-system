import type { Server } from 'node:http';

import { createApp } from './app';
import { env } from './config/env';
import { migrate } from './db/migrate';
import { closePool } from './db/pool';

/**
 * Seed data is owned by T3.4 (`src/seed/**`), which does not exist yet.
 *
 * It is loaded through a non-literal specifier so TypeScript does not try to resolve the
 * module at compile time and a missing seed module is simply a no-op. The alternative
 * would be for that task to edit this file, which is exactly the cross-file collision
 * Wave 1 exists to pre-empt.
 */
async function runSeedIfPresent(): Promise<void> {
  if (!env.SEED_ON_STARTUP) return;

  const candidates = ['./seed/seed', './seed/index'];

  for (const specifier of candidates) {
    let mod: Record<string, unknown>;
    try {
      mod = (await import(specifier)) as Record<string, unknown>;
    } catch {
      continue;
    }

    const seedFn = (mod.seedIfEmpty ?? mod.seed ?? mod.default) as
      | (() => Promise<void>)
      | undefined;

    if (typeof seedFn === 'function') {
      await seedFn();
      return;
    }
  }

  console.info('[seed] no seed module present, skipping');
}

/**
 * Shutdown order matters: stop accepting connections, let in-flight requests drain, then
 * close the pool. Ending the pool first would fail every request that is still running.
 */
function installShutdownHandlers(server: Server): void {
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[server] ${signal} received, shutting down`);

    server.close(() => {
      void closePool()
        .catch((err: unknown) => console.error('[server] error closing pool', err))
        .finally(() => process.exit(0));
    });

    // A client holding a keep-alive connection open would otherwise block `close()`
    // indefinitely and the orchestrator would SIGKILL us mid-write.
    setTimeout(() => {
      console.error('[server] shutdown timed out, forcing exit');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

async function main(): Promise<void> {
  // Before listening: an instance that accepts traffic against a schema-less database
  // would serve 500s for however long the migration takes.
  await migrate();
  await runSeedIfPresent();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.info(`[server] listening on http://localhost:${env.PORT} (${env.NODE_ENV})`);
  });

  installShutdownHandlers(server);
}

main().catch((err: unknown) => {
  console.error('[server] failed to start', err);
  process.exit(1);
});
