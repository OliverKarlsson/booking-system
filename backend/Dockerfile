# Build context is the REPOSITORY ROOT, not backend/ — see docker-compose.yml.
# The API imports @booking/shared, which exists only as an npm workspace link created at
# the root, so a backend-only context could not resolve it.

FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
# The compiler settings both workspace tsconfigs `extend`. It sits at the repository root,
# outside either workspace directory, so it has to be copied on its own — a build without
# it fails with `File '../tsconfig.base.json' not found`.
COPY tsconfig.base.json ./
COPY backend/package.json ./backend/

# @booking/shared is copied in full *before* the install, and that ordering is load-bearing.
#
# The package declares a `prepare` script (`tsc -p tsconfig.build.json`), and npm runs
# `prepare` for every workspace as part of `npm install` — so the source tsc needs must
# already be on disk. Copying only `shared/package.json` here, the way the backend's
# manifest is copied above, fails the install outright with
# `TS5058: The specified path does not exist: 'tsconfig.build.json'`.
#
# (`--ignore-scripts` does *not* rescue this: npm 10 still runs a workspace's `prepare`.)
#
# This is invisible outside Docker, because a local install always has the whole tree
# present. The cost is that editing shared/ invalidates the install layer; shared is four
# hundred lines of schemas and changes far less often than the backend, so the backend's
# own source still gets a clean cached install below.
COPY shared ./shared

# Only the two workspaces the API needs. Installing the whole root would also pull in the
# frontend's toolchain, which this image never runs. This also builds shared, via `prepare`.
RUN npm install --include-workspace-root \
      --workspace @booking/shared \
      --workspace @booking/backend

COPY backend ./backend

# `tsc -p tsconfig.build.json` plus scripts/copy-assets.mjs, which puts schema.sql next to
# the emitted JS — tsc emits only .ts, and migrate.ts reads that file on boot.
RUN npm run build --workspace @booking/backend

# --- runtime -----------------------------------------------------------------
FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/shared ./shared
COPY --from=build /app/backend ./backend

# Drop root. The API never writes to the filesystem, so it has no reason to hold
# privileges the container runtime would otherwise leave it with.
USER node

WORKDIR /app/backend
EXPOSE 5006
CMD ["node", "dist/server.js"]
