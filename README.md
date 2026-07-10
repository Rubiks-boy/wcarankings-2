# CubeRanks / wcarankings-2

A fast, mobile-first browser for official [World Cube Association rankings](https://www.worldcubeassociation.org/results/rankings/333/single). The React frontend supports event, result type, and region filters; virtualized infinite scrolling; animated ±10,000 jumps; direct WCA ID lookup; and optional WCA OAuth sign-in for a one-tap “my rank” jump.

> This information is based on competition results owned and maintained by the World Cube Association, published at https://worldcubeassociation.org/results.

## What is included

- React 19 / Vinext UI with window virtualization and cacheable 100-rank page requests
- Cloudflare Worker API routes backed by an indexed D1 ranking projection
- Preview data fallback, so the product is fully explorable before the first WCA import
- Streaming WCA Results Export v2 importer that keeps only the data required for rankings
- Daily GitHub Actions sync that checks the official export date before downloading anything
- WCA OAuth 2 authorization-code flow with a signed, HTTP-only profile cookie
- Drizzle schema and generated D1 migration

## Local development

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. Without a populated D1 binding, the app intentionally shows clearly labeled preview rows. Copy `.env.example` to `.env.local` only if you want to exercise WCA OAuth locally.

To download the latest official export and populate the same local D1 database used by the development server:

```bash
npm run sync:wca:local
```

The command compares export dates before downloading, so a second run exits immediately when the local database is current. The current projection occupies about 528 MB on disk.

Useful checks:

```bash
npm run build
npm test
npm run lint
```

## Data design

The public WCA v2 TSV export is currently hundreds of megabytes, but most of it is competition rounds, attempts, and scrambles that a ranking browser never queries. The importer projects only:

- `ranks_single`
- `ranks_average`
- the current row for each `person`
- `countries` and their continent mapping

Those are flattened into `ranking_entries`, with separate covering indexes for world, continent, country, and WCA-ID lookups. The React client requests fixed 100-rank buckets (1, 101, 201, and so on), caches recent buckets in memory, and never pays the cost of a large SQL `OFFSET`. WCA ties can make a bucket contain more or fewer than 100 people while keeping every official rank intact.

The importer builds `ranking_entries_next` beside the live table, creates its indexes and counts, and swaps it in only after the projection is complete. A failed download or transformation therefore leaves the currently published rankings intact.

## Scheduled export refresh

The workflow in `.github/workflows/sync-wca-export.yml` runs daily at 08:17 UTC. It calls the WCA-recommended endpoint at `https://www.worldcubeassociation.org/api/v0/export/public`, compares `export_date` with `export_metadata`, and exits immediately when the database is current.

Add these GitHub Actions repository secrets after the first deployment:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` with D1 read/write permission
- `D1_DATABASE_ID`

Run the workflow manually once to perform the initial import. The WCA normally publishes a new export after competition weekends, so the daily check does not imply a daily 349 MB download.

## WCA sign-in

Create an OAuth application in your [WCA account](https://www.worldcubeassociation.org/oauth/applications), using:

```text
https://YOUR_DOMAIN/api/auth/wca/callback
```

Then set these hosted runtime values:

- `WCA_CLIENT_ID`
- `WCA_CLIENT_SECRET`
- `WCA_REDIRECT_URI`

The app requests only the `public` scope, calls `/api/v0/me`, and retains the public profile fields needed for “my rank.” It does not store the WCA access token.

## Deployment recommendation

The lowest-friction target for this repository is Cloudflare Sites/Workers + D1. The code, database binding, runtime, and CDN stay in one deployment, and the scheduled import can run for free in GitHub Actions for this public repository.

| Option | Likely starting cost | Fit for this project |
| --- | ---: | --- |
| Cloudflare Workers + D1 | $0 if the projection stays inside the free 500 MB database limit; otherwise $5/month Workers Paid | Recommended. Already implemented, globally fast, scales to zero, no always-on server. |
| Railway app + PostgreSQL | $5/month minimum on Hobby, with $5 usage included; more if the always-on app/database exceeds that usage | Easiest conventional Postgres alternative, but less likely to remain exactly $5 once both services run continuously. |
| Neon + separate frontend | Free only up to 0.5 GB; paid usage is typically above the stated $5 target | Excellent serverless Postgres, but the full ranking projection is likely to outgrow the free storage ceiling. |
| Supabase | Free only up to 500 MB; Pro starts at $25/month | Comfortable managed Postgres, but not aligned with the preferred budget. |

If D1 storage is close to 500 MB after the first import, move directly to Workers Paid rather than trimming events or sacrificing indexes. The paid plan’s 10 GB per-database ceiling is ample for this ranking-only projection, and the minimum remains the target $5/month.

## Repository layout

```text
app/                         React UI and API routes
db/                          Drizzle D1 schema
drizzle/                     Generated SQL migrations
lib/                         WCA types, formatting, auth, preview data
scripts/sync-wca-export.mjs  Export checker, projection builder, D1 importer
.github/workflows/           Daily refresh automation
```

CubeRanks is an independent community project and is not affiliated with or endorsed by the World Cube Association.
