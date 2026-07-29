import { readFile } from "node:fs/promises";
import mysql from "mysql2/promise";

const TABLE = "person_sum_of_ranks_scores";
const STAGING_TABLE = `${TABLE}_staging`;
const PREVIOUS_TABLE = `${TABLE}_previous`;

function databaseOptions(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
  };
}

function statements(sql) {
  return sql
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

const startedAt = performance.now();
const connection = await mysql.createConnection(databaseOptions());

try {
  const source = await readFile(
    new URL("../sql/ranking-projections/person_sum_of_ranks_scores.sql", import.meta.url),
    "utf8",
  );
  await connection.query(`DROP TABLE IF EXISTS \`${STAGING_TABLE}\``);
  const stagingSql = source.replaceAll(TABLE, STAGING_TABLE);
  for (const statement of statements(stagingSql)) {
    await connection.query(statement);
  }

  const [[validation]] = await connection.query(
    `SELECT
       COUNT(*) AS row_count,
       COUNT(kinch_position) AS kinch_row_count,
       MAX(CASE WHEN result_type = 'single' AND scope = 'world' AND region_id = ''
         THEN kinch_position END) AS world_single_count,
       MAX(CASE WHEN result_type = 'average' AND scope = 'world' AND region_id = ''
         THEN kinch_position END) AS world_average_count
     FROM \`${STAGING_TABLE}\``,
  );
  if (
    Number(validation.row_count) === 0 ||
    Number(validation.kinch_row_count) !== Number(validation.row_count)
  ) {
    throw new Error(`Person metric score validation failed: ${JSON.stringify(validation)}`);
  }

  await connection.query(`DROP TABLE IF EXISTS \`${PREVIOUS_TABLE}\``);
  await connection.query(
    `RENAME TABLE
       \`${TABLE}\` TO \`${PREVIOUS_TABLE}\`,
       \`${STAGING_TABLE}\` TO \`${TABLE}\``,
  );
  await connection.query(`DROP TABLE \`${PREVIOUS_TABLE}\``);

  process.stdout.write(`${JSON.stringify({
    durationMs: Math.round(performance.now() - startedAt),
    rowCount: Number(validation.row_count),
    kinchRowCount: Number(validation.kinch_row_count),
    worldSingleCount: Number(validation.world_single_count),
    worldAverageCount: Number(validation.world_average_count),
  })}\n`);
} finally {
  await connection.end();
}
