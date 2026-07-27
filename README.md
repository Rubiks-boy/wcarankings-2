# WCA Rankings

CubeRanks is a fast, mobile-first browser for official [World Cube Association rankings](https://www.worldcubeassociation.org/results/rankings/333/single). It supports event and result-type filters, virtualized ranking pages, large rank jumps, WCA ID lookup, and optional WCA OAuth sign-in.

The app runs as a self-hosted Node service backed by PostgreSQL. The importer downloads the official WCA Results Export v2, projects only the ranking data needed by the browser, and swaps the completed projection into place inside one database transaction.

## Local development

Install dependencies and create a local environment:

```bash
npm ci
cp .env.example .env.local
```

For a local Node process, change `DATABASE_URL` in `.env.local` from the Compose hostname `db` to `localhost`, then start PostgreSQL:

```bash
docker compose up -d db
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. Until the first WCA import, ranking routes use clearly labeled preview rows. Import the current export with:

```bash
npm run sync:wca:local
```

The importer compares export dates before downloading, so repeated runs are safe. Use `--force` when an explicit re-import is needed.

Useful checks:

```bash
npm run build
npm test
npm run lint
```

## Docker Compose deployment

The production stack contains three services:

- `db`: PostgreSQL 16 with its data stored in the `postgres_data` named volume.
- `app`: the Node/Vinext application. Its entrypoint runs PostgreSQL migrations before starting the server.
- `proxy`: Caddy, which terminates HTTPS for `wcarankings.com` and `www.wcarankings.com` and forwards requests to `app`.

On the droplet, from `/srv/wcarankings`:

```bash
cp .env.example .env
openssl rand -hex 32
# Put the generated value in POSTGRES_PASSWORD and DATABASE_URL.
docker compose up -d --build
docker compose ps
docker compose logs -f app
```

The application listens on `127.0.0.1:3000` on the host, while Caddy publishes ports 80 and 443 and obtains certificates automatically. The PostgreSQL service has no public network port.

Run the initial WCA import from the app image:

```bash
docker compose run --rm app node /app/scripts/sync-wca-export.mjs
```

The import downloads the export into temporary storage, streams the TSV files in batches, and leaves the previous published ranking tables untouched if anything fails.

To keep the self-hosted database current, install the included systemd timer and failure alert as root after copying the repository to `/srv/wcarankings`:

```bash
install -m 0644 ops/wcarankings-sync.service /etc/systemd/system/
install -m 0644 ops/wcarankings-sync.timer /etc/systemd/system/
install -m 0644 ops/wcarankings-sync-alert.service /etc/systemd/system/
install -m 0755 ops/wcarankings-sync-alert.sh /usr/local/bin/wcarankings-sync-alert
install -d -m 0700 /etc/wcarankings
# Create /etc/wcarankings/ntfy.env with: NTFY_TOPIC=your-private-topic
chmod 600 /etc/wcarankings/ntfy.env
systemctl daemon-reload
systemctl enable --now wcarankings-sync.timer
```

The sync service triggers `wcarankings-sync-alert.service` on failure. The alert service reads the private topic from `/etc/wcarankings/ntfy.env` and publishes to ntfy.sh.

## WCA sign-in

Create an OAuth application in your [WCA account](https://www.worldcubeassociation.org/oauth/applications), using:

```text
https://YOUR_DOMAIN/api/auth/wca/callback
```

Set `WCA_CLIENT_ID`, `WCA_CLIENT_SECRET`, and `WCA_REDIRECT_URI` in the deployment `.env` file. The app requests only the `public` scope and stores a signed, HTTP-only profile cookie; it does not persist the WCA access token.

## Repository layout

```text
app/                         React UI and API routes
db/                          Drizzle PostgreSQL schema and connection pool
drizzle/                     Generated PostgreSQL migrations
scripts/sync-wca-export.mjs  WCA export downloader and projection importer
Dockerfile                   Multi-stage production image
docker-compose.yml           PostgreSQL + app services
```

CubeRanks is an independent community project and is not affiliated with or endorsed by the World Cube Association.
