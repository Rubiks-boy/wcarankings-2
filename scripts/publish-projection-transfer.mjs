import mysql from "mysql2/promise";
import {
  PUBLISHED_PROJECTION_TABLES,
  dropManagedObject,
  promoteProjectionTables,
} from "./mysql-schema.mjs";

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

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT 1
       FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?
      LIMIT 1`,
    [table],
  );
  return rows.length > 0;
}

const connection = await mysql.createConnection(databaseOptions());
try {
  if (!await tableExists(connection, "projection_transfer_manifest")) {
    throw new Error("The projection transfer manifest is missing.");
  }

  const [[manifest], [published]] = await Promise.all([
    connection.query("SELECT export_date FROM projection_transfer_manifest LIMIT 1"),
    connection.query("SELECT value AS export_date FROM export_metadata WHERE `key` = 'export_date' LIMIT 1"),
  ]);
  const transferDate = manifest[0]?.export_date;
  const publishedDate = published[0]?.export_date;
  if (!transferDate || transferDate !== publishedDate) {
    throw new Error(
      `Projection export date ${transferDate || "(missing)"} does not match production raw export date ${publishedDate || "(missing)"}.`,
    );
  }

  for (const table of PUBLISHED_PROJECTION_TABLES) {
    const transfer = `${table}_transfer`;
    if (!await tableExists(connection, transfer)) {
      throw new Error(`Transferred projection table ${transfer} is missing.`);
    }
    const [rows] = await connection.query(`SELECT COUNT(*) AS count FROM \`${transfer}\``);
    if (Number(rows[0]?.count ?? 0) === 0) {
      throw new Error(`Transferred projection table ${transfer} is empty.`);
    }
  }

  const [deferredIndexes] = await connection.query(
    `SELECT table_name, index_name, index_sql
       FROM projection_transfer_indexes
      ORDER BY table_name, index_name`,
  );
  process.stdout.write(`Building ${deferredIndexes.length} deferred projection indexes…\n`);
  const indexesByTable = new Map();
  for (const index of deferredIndexes) {
    const indexes = indexesByTable.get(index.table_name) ?? [];
    indexes.push(index);
    indexesByTable.set(index.table_name, indexes);
  }
  let builtIndexCount = 0;
  for (const [table, indexes] of indexesByTable) {
    const startedAt = performance.now();
    await connection.query(
      `ALTER TABLE \`${table}\` ${indexes.map((index) => index.index_sql).join(", ")}`,
    );
    builtIndexCount += indexes.length;
    process.stdout.write(
      `Built ${indexes.length} indexes on ${table} in ${Math.round(performance.now() - startedAt)}ms (${builtIndexCount}/${deferredIndexes.length}).\n`,
    );
  }

  const renames = [];
  for (const table of PUBLISHED_PROJECTION_TABLES) {
    const staging = `${table}_staging`;
    await dropManagedObject(connection, staging);
    renames.push(`\`${table}_transfer\` TO \`${staging}\``);
  }
  await connection.query(`RENAME TABLE ${renames.join(", ")}`);
  await promoteProjectionTables(connection);
  await dropManagedObject(connection, "projection_transfer_indexes");
  await dropManagedObject(connection, "projection_transfer_manifest");
  process.stdout.write(`Published transferred projection generation for ${transferDate}.\n`);
} finally {
  await connection.end();
}
