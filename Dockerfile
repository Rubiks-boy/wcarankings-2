FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist/standalone ./dist/standalone
COPY --from=build /app/dist/client ./dist/client
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/migrate.mjs ./scripts/migrate.mjs
COPY --from=build /app/scripts/sync-wca-export.mjs ./scripts/sync-wca-export.mjs
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN useradd --system --uid 10001 --create-home app \
  && chown -R app:app /app
USER app

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/standalone/server.js"]
