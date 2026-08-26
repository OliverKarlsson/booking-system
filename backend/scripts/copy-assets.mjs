import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// `tsc` only emits .ts files, so schema.sql would be missing from dist/. Copying it with
// node rather than `cp` keeps `npm run build` working on Windows as well as in the Linux
// container. (migrate.ts also falls back to reading it from src/, so a skipped copy
// degrades rather than breaks — but the built image should not depend on src/ existing.)
const backendRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const assets = [['src/db/schema.sql', 'dist/db/schema.sql']];

for (const [from, to] of assets) {
  const target = join(backendRoot, to);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(join(backendRoot, from), target);
  console.log(`copied ${from} -> ${to}`);
}
