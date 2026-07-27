FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
  && npm prune --omit=dev \
  && npm cache clean --force

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

RUN useradd --system --uid 10001 --create-home app

COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/dist/standalone ./dist/standalone
COPY --from=build --chown=app:app /app/dist/client ./dist/client
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --from=build --chown=app:app /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build --chown=app:app /app/scripts/sync-wca-export.mjs ./scripts/sync-wca-export.mjs
COPY --chown=app:app docker-entrypoint.sh ./docker-entrypoint.sh

USER app

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/standalone/server.js"]
