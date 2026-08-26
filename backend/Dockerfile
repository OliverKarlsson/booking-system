# Build context is the REPOSITORY ROOT, not backend/ — see docker-compose.yml.
# The API imports @booking/shared, which exists only as an npm workspace link created at
# the root, so a backend-only context could not resolve it.

FROM node:20-alpine AS build

WORKDIR /app

# Manifests first: this layer is cached until a dependency actually changes, so an
# ordinary source edit does not re-run npm install.
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/

# Only the two workspaces the API needs. Installing the whole root would also pull in the
# frontend's toolchain, which this image never runs.
RUN npm install --include-workspace-root \
      --workspace @booking/shared \
      --workspace @booking/backend

COPY shared ./shared
COPY backend ./backend

RUN npm run build --workspace @booking/shared --if-present \
 && npm run build --workspace @booking/backend

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
