# Deployment

CubeRanks is deployed as a Docker Compose stack on a managed Linux host. The
production stack contains three services:

- `db`: MariaDB 11.8 with raw WCA export data and indexed ranking projections in the `mariadb_data` named volume.
- `app`: the Node/Vinext application and WCA SQL importer. Export archives are retained in the `wca_export_cache` named volume.
- `proxy`: Caddy, which terminates HTTPS and forwards requests to `app`.

## Server setup

The production host needs Docker Engine with the Compose plugin, a dedicated
non-interactive deploy account, SSH access for GitHub Actions, and a writable
deployment directory. The deploy account must be allowed to run Docker commands.

Configure DNS and firewall access for the production site, allowing HTTP and HTTPS.
Caddy stores its certificates in a persistent volume. The server's `.env` file is
created manually and is not replaced by deployments; keep its credentials out of
source control.

From the deployment directory on the production host:

```bash
cp .env.example .env
openssl rand -hex 32
# Put the generated value in the database environment configuration.
docker compose up -d db
docker compose ps
```

The application image is built by GitHub Actions and transferred to the host;
the production host does not build application images. The first deployment
starts the application and proxy after loading that image.

The app listens on `127.0.0.1:3000` on the host. Caddy publishes ports 80 and 443
and obtains certificates automatically. MariaDB has no public network port.

Run the initial WCA import from the app image:

```bash
docker compose run --rm app node /app/scripts/sync-wca-export.mjs
```

The import downloads one SQL archive per export date into the persistent cache,
streams the SQL dump into MariaDB, and then creates the indexed ranking tables and
competition-name lookups. Use `--force` to re-import an already recorded export.
For a manually downloaded archive, set `WCA_SQL_EXPORT_PATH` in the environment or
pass `--sql-path=/path/to/WCA_export.sql.zip`.

App migrations and ranking projection refreshes are separate operations. To apply
app-owned migrations without importing WCA data, run `node /app/scripts/migrate.mjs`.
To rebuild ranking projections from raw WCA tables already present in MariaDB, run
`node /app/scripts/refresh-rankings.mjs`.

To keep the self-hosted database current, install the included systemd timer and
failure alert as root after copying the repository to the deployment directory:

```bash
install -m 0644 ops/wcarankings-sync.service /etc/systemd/system/
install -m 0644 ops/wcarankings-sync.timer /etc/systemd/system/
install -m 0644 ops/wcarankings-sync-alert.service /etc/systemd/system/
install -m 0755 ops/wcarankings-sync-alert.sh /usr/local/bin/wcarankings-sync-alert
# Create a root-owned, mode-0700 directory for server-only notification settings.
# Store the notification environment file there with mode 0600.
systemctl daemon-reload
systemctl enable --now wcarankings-sync.timer
```

The sync service triggers the alert service on failure. Its notification destination
is configured only on the server.

## GitHub Actions deployment

`.github/workflows/deploy.yml` deploys automatically after pushes to `main`; it can
also be started with `workflow_dispatch`. Deploys are serialized so two production
deploys do not overlap.

The workflow does the following:

1. Checks out the commit, runs `npm ci`, `npm run lint`, and `npm test`.
2. Builds `wcarankings-app:${{ github.sha }}` with Docker Buildx on the GitHub runner.
3. Uses repository-configured SSH credentials and host verification to establish
   non-interactive access to the production host.
4. Copies `docker-compose.yml` and `ops/Caddyfile` to the deployment directory.
5. Preserves the current image as `wcarankings-app:previous`.
6. Streams the new image directly to the server with
   `docker save | gzip | ssh ... 'gzip -d | docker load'`. There is no container
   registry involved.
7. Tags the loaded image as `wcarankings-app:latest` and runs
   `docker compose up -d --no-build --remove-orphans app proxy`.
8. Verifies the app locally on the server and through the configured public host.
9. Runs pending app-owned migrations only.
10. Rolls back to `wcarankings-app:previous` if deployment health checks or
    migrations fail; otherwise removes the previous image after success.

The deployment server needs the Compose file, Caddyfile, and `.env`, but does not
need a checkout of the application source. Deployments do not download or import
WCA data and do not rebuild ranking projections. The daily systemd sync owns that
slower data operation. The app entrypoint only starts the server, so a fresh host
should be imported before it is considered ready for ranking traffic.

The GitHub Actions workflow expects these repository secrets:

- `SERVER_IP`: SSH address for the deployment host.
- `SERVER_HOST`: public HTTPS hostname used for the post-deploy check.
- `DEPLOY_SSH_KEY`: private key for the deployment account.
- `DEPLOY_KNOWN_HOSTS`: SSH host verification entries.

The workflow replaces the app container after loading the new image, while keeping
the previous image available until health checks and migrations succeed. MariaDB,
the export cache, Caddy certificates, and their data survive because they are stored
in named Docker volumes.
