import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import * as unzipper from "unzipper";

const EXPORT_API = "https://www.worldcubeassociation.org/api/v0/export/public";
const BATCH_SIZE = 300;
const dryRun = process.argv.includes("--dry-run");
const force = process.argv.includes("--force");

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function readValue(row, ...keys) {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key];
  }
  return "";
}

function sqlString(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

async function writeChunk(stream, chunk) {
  if (!stream.write(chunk)) await once(stream, "drain");
}

async function getLatestExport() {
  const response = await fetch(EXPORT_API, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`WCA export API returned ${response.status}.`);
  const payload = await response.json();
  const exportDate = payload.export_date ?? payload.exportDate;
  const tsvUrl = payload.tsv_url ?? payload.tsvUrl;
  const version = payload.export_format_version ?? payload.exportFormatVersion ?? "2";
  if (!exportDate || !tsvUrl) throw new Error("The WCA export API response is missing export_date or tsv_url.");
  if (!String(version).startsWith("2")) {
    throw new Error(`Unsupported WCA export major version: ${version}. Review the importer before continuing.`);
  }
  return { exportDate, tsvUrl, version };
}

async function d1Query(sql) {
  const accountId = requiredEnvironment("CLOUDFLARE_ACCOUNT_ID");
  const databaseId = requiredEnvironment("D1_DATABASE_ID");
  const token = requiredEnvironment("CLOUDFLARE_API_TOKEN");
  const response = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql }),
    },
  );
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(`D1 query failed: ${JSON.stringify(body.errors ?? body)}`);
  }
  return body.result?.[0]?.results ?? [];
}

async function alreadyImported(exportDate) {
  if (force || dryRun) return false;
  try {
    const rows = await d1Query("SELECT value FROM export_metadata WHERE key = 'export_date' LIMIT 1");
    return rows[0]?.value === exportDate;
  } catch {
    return false;
  }
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Export download returned ${response.status}.`);
  const output = createWriteStream(destination);
  for await (const chunk of response.body) {
    if (!output.write(chunk)) await once(output, "drain");
  }
  output.end();
  await once(output, "finish");
}

function findEntry(directory, tableName) {
  const expected = `${tableName.toLowerCase()}.tsv`;
  const entry = directory.files.find((file) => file.path.toLowerCase().endsWith(expected));
  if (!entry) throw new Error(`Could not find ${tableName}.tsv in the WCA export.`);
  return entry;
}

async function forEachTsvRow(entry, callback) {
  const lines = createInterface({ input: entry.stream(), crlfDelay: Infinity });
  let headers;
  for await (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, "");
    if (!headers) {
      headers = line.split("\t");
      continue;
    }
    if (!line) continue;
    const values = line.split("\t");
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    await callback(row);
  }
}

async function writeRankTable({ entry, rankingType, people, countries, output }) {
  let batch = [];
  let processed = 0;

  const flush = async () => {
    if (!batch.length) return;
    await writeChunk(
      output,
      `INSERT INTO ranking_entries_next VALUES\n${batch.join(",\n")};\n`,
    );
    batch = [];
  };

  await forEachTsvRow(entry, async (row) => {
    const personId = readValue(row, "person_id", "personId");
    const eventId = readValue(row, "event_id", "eventId");
    const person = people.get(personId);
    if (!person || !eventId) return;
    const country = countries.get(person.countryId) ?? {
      name: person.countryId,
      iso2: "",
      continentId: "",
    };
    const values = [
      eventId,
      rankingType,
      personId,
      person.name,
      person.countryId,
      country.name,
      country.iso2,
      country.continentId,
      Number(readValue(row, "best")) || 0,
      Number(readValue(row, "world_rank", "worldRank")) || 0,
      Number(readValue(row, "continent_rank", "continentRank")) || 0,
      Number(readValue(row, "country_rank", "countryRank")) || 0,
    ];
    batch.push(`(${values.map((value) => typeof value === "number" ? value : sqlString(value)).join(",")})`);
    processed += 1;
    if (batch.length >= BATCH_SIZE) await flush();
    if (processed % 250_000 === 0) process.stdout.write(`  ${rankingType}: ${processed.toLocaleString()} rows\n`);
  });
  await flush();
  process.stdout.write(`  ${rankingType}: ${processed.toLocaleString()} rows complete\n`);
  return processed;
}

async function generateProjectionSql(zipPath, sqlPath, latest) {
  const directory = await unzipper.Open.file(zipPath);
  const people = new Map();
  const countries = new Map();
  const indexSuffix = String(latest.exportDate).replace(/[^0-9]/g, "").slice(-14) || Date.now();

  process.stdout.write("Reading countries and current competitor profiles…\n");
  await forEachTsvRow(findEntry(directory, "countries"), async (row) => {
    const id = readValue(row, "id");
    countries.set(id, {
      name: readValue(row, "name") || id,
      iso2: readValue(row, "iso2"),
      continentId: readValue(row, "continent_id", "continentId"),
    });
  });
  await forEachTsvRow(findEntry(directory, "persons"), async (row) => {
    const personId = readValue(row, "wca_id", "id");
    const subId = Number(readValue(row, "sub_id", "subid")) || 1;
    const existing = people.get(personId);
    if (!existing || subId < existing.subId) {
      people.set(personId, {
        subId,
        name: readValue(row, "name"),
        countryId: readValue(row, "country_id", "countryId"),
      });
    }
  });

  const output = createWriteStream(sqlPath, { encoding: "utf8" });
  await writeChunk(output, `-- CubeRanks projection generated from WCA export ${latest.exportDate}\n`);
  await writeChunk(output, `DROP TABLE IF EXISTS ranking_entries_next;\n`);
  await writeChunk(output, `CREATE TABLE ranking_entries_next (
event_id TEXT NOT NULL,
ranking_type TEXT NOT NULL,
person_id TEXT NOT NULL,
person_name TEXT NOT NULL,
country_id TEXT NOT NULL,
country_name TEXT NOT NULL,
country_iso2 TEXT NOT NULL,
continent_id TEXT NOT NULL,
best INTEGER NOT NULL,
world_rank INTEGER NOT NULL,
continent_rank INTEGER NOT NULL,
country_rank INTEGER NOT NULL,
PRIMARY KEY (event_id, ranking_type, person_id)
);\n`);

  process.stdout.write("Projecting rank tables…\n");
  await writeRankTable({
    entry: findEntry(directory, "ranks_single"),
    rankingType: "single",
    people,
    countries,
    output,
  });
  await writeRankTable({
    entry: findEntry(directory, "ranks_average"),
    rankingType: "average",
    people,
    countries,
    output,
  });

  await writeChunk(output, `
CREATE INDEX ranking_world_${indexSuffix}_idx ON ranking_entries_next (event_id, ranking_type, world_rank, person_id);
CREATE INDEX ranking_continent_${indexSuffix}_idx ON ranking_entries_next (event_id, ranking_type, continent_id, continent_rank, person_id);
CREATE INDEX ranking_country_${indexSuffix}_idx ON ranking_entries_next (event_id, ranking_type, country_id, country_rank, person_id);
CREATE INDEX ranking_person_${indexSuffix}_idx ON ranking_entries_next (person_id, event_id, ranking_type);
DROP TABLE IF EXISTS ranking_counts_next;
CREATE TABLE ranking_counts_next (
event_id TEXT NOT NULL,
ranking_type TEXT NOT NULL,
scope TEXT NOT NULL,
region_id TEXT NOT NULL DEFAULT '',
count INTEGER NOT NULL,
PRIMARY KEY (event_id, ranking_type, scope, region_id)
);
INSERT INTO ranking_counts_next
SELECT event_id, ranking_type, 'world', '', COUNT(*) FROM ranking_entries_next GROUP BY event_id, ranking_type;
INSERT INTO ranking_counts_next
SELECT event_id, ranking_type, 'continent', continent_id, COUNT(*) FROM ranking_entries_next GROUP BY event_id, ranking_type, continent_id;
INSERT INTO ranking_counts_next
SELECT event_id, ranking_type, 'country', country_id, COUNT(*) FROM ranking_entries_next GROUP BY event_id, ranking_type, country_id;
CREATE TABLE IF NOT EXISTS ranking_entries AS SELECT * FROM ranking_entries_next WHERE 0;
CREATE TABLE IF NOT EXISTS ranking_counts AS SELECT * FROM ranking_counts_next WHERE 0;
DROP TABLE IF EXISTS ranking_entries_old;
ALTER TABLE ranking_entries RENAME TO ranking_entries_old;
ALTER TABLE ranking_entries_next RENAME TO ranking_entries;
DROP TABLE ranking_entries_old;
DROP TABLE IF EXISTS ranking_counts_old;
ALTER TABLE ranking_counts RENAME TO ranking_counts_old;
ALTER TABLE ranking_counts_next RENAME TO ranking_counts;
DROP TABLE ranking_counts_old;
CREATE TABLE IF NOT EXISTS export_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
INSERT INTO export_metadata (key, value) VALUES ('export_date', ${sqlString(latest.exportDate)})
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
INSERT INTO export_metadata (key, value) VALUES ('export_format_version', ${sqlString(latest.version)})
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
`);
  output.end();
  await once(output, "finish");
}

async function importWithWrangler(sqlPath, workingDirectory) {
  const databaseId = requiredEnvironment("D1_DATABASE_ID");
  const configPath = join(workingDirectory, "wrangler.sync.jsonc");
  const config = `{
    "name": "wcarankings-sync",
    "compatibility_date": "2026-07-01",
    "d1_databases": [{
      "binding": "DB",
      "database_name": "wcarankings",
      "database_id": "${databaseId}"
    }]
  }`;
  await import("node:fs/promises").then(({ writeFile }) => writeFile(configPath, config));

  await new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["wrangler", "d1", "execute", "DB", "--remote", `--file=${sqlPath}`, `--config=${configPath}`],
      { stdio: "inherit", env: process.env },
    );
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`Wrangler exited with ${code}.`)));
  });
}

async function main() {
  const latest = await getLatestExport();
  process.stdout.write(`Latest WCA export: ${latest.exportDate} (v${latest.version})\n`);
  if (await alreadyImported(latest.exportDate)) {
    process.stdout.write("Database is already current. Nothing to do.\n");
    return;
  }

  const workingDirectory = await mkdtemp(join(tmpdir(), "wcarankings-sync-"));
  const zipPath = join(workingDirectory, basename(new URL(latest.tsvUrl).pathname) || "wca-export.tsv.zip");
  const sqlPath = join(workingDirectory, "wcarankings-projection.sql");
  try {
    process.stdout.write("Downloading the WCA TSV export…\n");
    await download(latest.tsvUrl, zipPath);
    await generateProjectionSql(zipPath, sqlPath, latest);
    const sqlSize = (await stat(sqlPath)).size;
    process.stdout.write(`Projection ready (${(sqlSize / 1024 / 1024).toFixed(1)} MB).\n`);

    if (dryRun) {
      process.stdout.write(`Dry run complete. SQL was generated at ${sqlPath}\n`);
      return;
    }

    process.stdout.write("Importing the new projection into D1…\n");
    await importWithWrangler(sqlPath, workingDirectory);
    process.stdout.write(`WCA rankings are current through ${latest.exportDate}.\n`);
  } finally {
    if (!dryRun) await rm(workingDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
