import { migrate } from '../db/migrate';
import { closePool } from '../db/pool';
import { runSeed } from './seed';

/**
 * `npm run seed [-- --force]`
 *
 * The manual counterpart to the boot-time seed. It calls `runSeed` rather than
 * `seedIfEmpty`, so `SEED_ON_STARTUP=false` does not suppress it: that flag exists to stop
 * the *server* writing fixtures into a database on boot, and a developer who typed this
 * command has already said what they want.
 */

const USAGE = `Usage: npm run seed [-- --force]

  --force, -f   Delete all rental units and reservations, then seed from scratch.
                Without it, seeding is skipped when the database already has rows.
  --help,  -h   Show this message.
`;

interface Args {
  force: boolean;
  help: boolean;
}

/**
 * Unknown flags are a hard error rather than being ignored.
 *
 * A typo'd `--fore` that silently ran the non-destructive path would look like the seed
 * failing to reset, and the natural next step — running it again — would not help either.
 * Refusing is the shorter route to understanding what happened.
 */
function parseArgs(argv: string[]): Args {
  const args: Args = { force: false, help: false };

  for (const arg of argv) {
    if (arg === '--force' || arg === '-f') args.force = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}\n\n${USAGE}`);
  }

  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.info(USAGE);
    return;
  }

  // The schema is applied first so this works against a database that has never had the
  // server pointed at it — `docker compose up -d db && npm run seed` is a reasonable thing
  // to type, and it should not fail with "relation rental_units does not exist".
  await migrate();
  await runSeed({ force: args.force });
}

main()
  .then(() => closePool())
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error('[seed] failed', err);
    // The pool is closed on the failure path too, otherwise the open connection keeps the
    // event loop alive and the process hangs instead of reporting the error and exiting.
    void closePool()
      .catch(() => undefined)
      .finally(() => process.exit(1));
  });
