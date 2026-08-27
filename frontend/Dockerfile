# Build context is the REPOSITORY ROOT, not frontend/ — same reason as backend/Dockerfile.
# The app imports @booking/shared (the Zod schemas drive its form validation, so this is a
# runtime dependency, not just types), which resolves only through the root workspace link.

FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY frontend/package.json ./frontend/

# Copied in full before the install: @booking/shared's `prepare` script compiles it during
# `npm install`, so its source has to be present. See backend/Dockerfile for the failure
# mode this avoids.
COPY shared ./shared

RUN npm install --include-workspace-root \
      --workspace @booking/shared \
      --workspace @booking/frontend

COPY frontend ./frontend

# `tsc --noEmit && vite build`. The typecheck is kept in the image build deliberately: a
# type error should fail the build here rather than ship.
RUN npm run build --workspace @booking/frontend

# --- runtime -----------------------------------------------------------------
# Static files plus a reverse proxy for /v1, so the browser only ever talks to one origin.
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/frontend/dist /usr/share/nginx/html

# Opt-in flag for the image's own 15-local-resolvers.envsh, which otherwise returns
# early and does nothing:
#
#   [ "${NGINX_ENTRYPOINT_LOCAL_RESOLVERS:-}" ] || return 0
#
# Without it NGINX_LOCAL_RESOLVERS is never set, envsubst leaves the placeholder in
# place, and nginx dies at boot with: host not found in resolver
# "${NGINX_LOCAL_RESOLVERS}". Set here rather than in compose so the image works standalone.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

# Into templates/, not conf.d/: the entrypoint runs envsubst over this directory at boot,
# which is how ${NGINX_LOCAL_RESOLVERS} becomes the container's real DNS server. Copied
# straight to conf.d/ it would reach nginx with the placeholder unsubstituted.
COPY frontend/default.conf.template /etc/nginx/templates/default.conf.template

EXPOSE 80
