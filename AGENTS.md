# Project UI conventions

- On mobile widths up to 759px, keep the event, ranking-type, and region controls in one row when possible.
- Those mobile controls must retain a minimum height of 40px as touch targets, even when their padding or font size changes.
- Sub-rank is an internal ordering concept and must never be shown or exposed in the user-facing UI, labels, search results, or other copy.
- Any future user-facing link to an external web page must open in a new tab.

## Local database development

- Treat the local MariaDB database and its WCA export data as persistent developer state. Never drop, recreate, import into, or rebuild its raw tables during normal development.
- Do not run ranking imports or projection refreshes merely to start or test the app. Inspect the existing database first and report what is missing.
- Only run `sync:wca`, `sync:wca:local`, `db:refresh-rankings`, schema-refresh scripts, destructive SQL, or Docker volume/database recreation after the user explicitly authorizes that exact operation.
- When local data is incomplete, prefer a clear readiness/error response and ask whether the user wants a targeted repair; state which tables or metadata would be changed before proceeding.

## Pre-launch compatibility

- This app has not launched. Do not preserve legacy URLs, APIs, data shapes, flags, or behavior by default.
- Before adding compatibility code, ask the user whether the change needs to be backwards compatible. Remove superseded behavior when compatibility is not explicitly requested.
