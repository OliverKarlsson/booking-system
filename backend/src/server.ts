import type { Server } from 'node:http';

import { createApp } from './app';
import { env } from './config/env';
import { migrate } from './db/migrate';
import { closePool } from './db/pool';
import { seedIfEmpty } from './seed/seed';

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

  // A static import, deliberately. This was a dynamic `import(specifier)` guarded by a
  // try/catch while `src/seed/**` was still an unwritten task — and that shape had a
  // failure mode worth recording: under CommonJS output, a dynamic import of an
  // extensionless relative specifier goes through Node's *ESM* resolver, which does not
  // guess extensions. It threw ERR_MODULE_NOT_FOUND, the catch swallowed it, and the
  // compiled image booted with an empty database while `tsx` and Vitest — which transform
  // the call — seeded correctly. Nothing failed; the dashboard was simply blank.
  //
  // Now that the module exists, importing it normally makes that unrepresentable: a broken
  // path is a compile error rather than a silent skip.
  await seedIfEmpty();

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
