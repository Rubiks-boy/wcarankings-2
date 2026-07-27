import { basename, join } from "node:path";
import { createInterface } from "node:readline";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { Client } from "pg";
import * as unzipper from "unzipper";

const EXPORT_API = "https://www.worldcubeassociation.org/api/v0/export/public";
const BATCH_SIZE = 500;
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

async function download(url, destination) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Export download returned ${response.status}.`);
  const output = createWriteStream(destination);
  for await (const chunk of response.body) {
    if (!output.write(chunk)) await new Promise((resolve) => output.once("drain", resolve));
  }
  const finished = new Promise((resolve, reject) => {
    output.once("finish", resolve);
    output.once("error", reject);
  });
  output.end();
  await finished;
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

async function readReferenceData(directory) {
  const people = new Map();
  const countries = new Map();

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
  return { people, countries };
}

const rankingColumns = [
  "event_id",
  "ranking_type",
  "person_id",
  "person_name",
  "country_id",
  "country_name",
  "country_iso2",
  "continent_id",
  "best",
  "world_rank",
  "continent_rank",
  "country_rank",
];

async function insertBatch(client, batch) {
  if (!batch.length) return;
  const values = batch.flat();
  let parameterIndex = 0;
  const placeholders = batch.map((row) => `(${row.map(() => `$${++parameterIndex}`).join(",")})`);
  await client.query(
    `INSERT INTO ranking_entries_next (${rankingColumns.join(",")}) VALUES ${placeholders.join(",")}`,
    values,
  );
}

async function writeRankTable({ entry, rankingType, people, countries, client }) {
  let batch = [];
  let processed = 0;

  const flush = async () => {
    await insertBatch(client, batch);
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
    batch.push([
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
    ]);
    processed += 1;
    if (batch.length >= BATCH_SIZE) await flush();
    if (processed % 250_000 === 0) process.stdout.write(`  ${rankingType}: ${processed.toLocaleString()} rows\n`);
  });
  await flush();
  process.stdout.write(`  ${rankingType}: ${processed.toLocaleString()} rows complete\n`);
  return processed;
}

async function createProjectionTables(client) {
  await client.query(`
    DROP TABLE IF EXISTS ranking_entries_next;
    CREATE TABLE ranking_entries_next (
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
    )
  `);
}

async function finishProjection(client, exportInfo) {
  const indexSuffix = `${String(exportInfo.exportDate).replace(/[^0-9]/g, "").slice(-8) || "export"}_${Date.now()}`;
  await client.query(`
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
    CREATE TABLE IF NOT EXISTS ranking_entries AS SELECT * FROM ranking_entries_next WITH NO DATA;
    CREATE TABLE IF NOT EXISTS ranking_counts AS SELECT * FROM ranking_counts_next WITH NO DATA;
    CREATE TABLE IF NOT EXISTS export_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    DROP TABLE IF EXISTS ranking_entries_old;
    ALTER TABLE ranking_entries RENAME TO ranking_entries_old;
    ALTER TABLE ranking_entries_next RENAME TO ranking_entries;
    DROP TABLE ranking_entries_old;
    DROP TABLE IF EXISTS ranking_counts_old;
    ALTER TABLE ranking_counts RENAME TO ranking_counts_old;
    ALTER TABLE ranking_counts_next RENAME TO ranking_counts;
    DROP TABLE ranking_counts_old;
  `);
  await client.query(`
    INSERT INTO export_metadata (key, value) VALUES
      ('export_date', $1), ('export_format_version', $2)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `, [String(exportInfo.exportDate), String(exportInfo.version)]);
}

async function alreadyImported(client, exportDate) {
  if (force || dryRun) return false;
  try {
    const result = await client.query("SELECT value FROM export_metadata WHERE key = 'export_date' LIMIT 1");
    return result.rows[0]?.value === String(exportDate);
  } catch (error) {
    if (error?.code === "42P01") return false;
    throw error;
  }
}

async function main() {
  const latest = await getLatestExport();
  process.stdout.write(`Latest WCA export: ${latest.exportDate} (v${latest.version})\n`);

  const connectionString = requiredEnvironment("DATABASE_URL");
  const client = new Client({ connectionString });
  await client.connect();
  const workingDirectory = await mkdtemp(join(tmpdir(), "wcarankings-sync-"));
  try {
    if (await alreadyImported(client, latest.exportDate)) {
      process.stdout.write("Database is already current. Nothing to do.\n");
      return;
    }

    const zipPath = join(workingDirectory, basename(new URL(latest.tsvUrl).pathname) || "wca-export.tsv.zip");
    process.stdout.write("Downloading the WCA TSV export…\n");
    await download(latest.tsvUrl, zipPath);
    const directory = await unzipper.Open.file(zipPath);
    if (dryRun) {
      const { people } = await readReferenceData(directory);
      process.stdout.write(`Dry run complete. Found ${people.size.toLocaleString()} current competitor profiles.\n`);
      return;
    }

    const { people, countries } = await readReferenceData(directory);
    await client.query("BEGIN");
    try {
      await createProjectionTables(client);
      process.stdout.write("Projecting rank tables…\n");
      await writeRankTable({ entry: findEntry(directory, "ranks_single"), rankingType: "single", people, countries, client });
      await writeRankTable({ entry: findEntry(directory, "ranks_average"), rankingType: "average", people, countries, client });
      await finishProjection(client, latest);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
    process.stdout.write(`WCA rankings are current through ${latest.exportDate}.\n`);
  } finally {
    await client.end();
    await rm(workingDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : error}\n`);
  process.exitCode = 1;
});
