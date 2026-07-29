import mysql from "mysql2/promise";
import { PUBLISHED_PROJECTION_TABLES, dropManagedObject } from "./mysql-schema.mjs";

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

const connection = await mysql.createConnection(databaseOptions());
try {
  const [metadata] = await connection.query(
    "SELECT value FROM export_metadata WHERE `key` = 'export_date' LIMIT 1",
  );
  const exportDate = metadata[0]?.value;
  if (!exportDate) throw new Error("The projection source has no WCA export date.");

  await dropManagedObject(connection, "projection_transfer_manifest");
  await connection.query(`
    CREATE TABLE projection_transfer_manifest (
      export_date VARCHAR(32) NOT NULL,
      created_at DATETIME(3) NOT NULL
    )
  `);
  await connection.query(
    "INSERT INTO projection_transfer_manifest (export_date, created_at) VALUES (?, UTC_TIMESTAMP(3))",
    [exportDate],
  );

  const renames = [];
  for (const table of PUBLISHED_PROJECTION_TABLES) {
    const transfer = `${table}_transfer`;
    await dropManagedObject(connection, transfer);
    renames.push(`\`${table}\` TO \`${transfer}\``);
  }
  await connection.query(`RENAME TABLE ${renames.join(", ")}`);

  process.stdout.write(`${JSON.stringify({
    exportDate,
    tables: [
      ...PUBLISHED_PROJECTION_TABLES.map((table) => `${table}_transfer`),
      "projection_transfer_manifest",
    ],
  })}\n`);
} finally {
  await connection.end();
}
