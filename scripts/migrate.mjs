import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { refreshMysqlSchema } from "./mysql-schema.mjs";

function databaseOptions(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    multipleStatements: false,
  };
}

export async function migrateDatabase(connectionString = process.env.DATABASE_URL) {
  const connection = await mysql.createConnection(databaseOptions(connectionString));
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(128) NOT NULL PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const migrationsDirectory = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations/mysql");
    const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith(".sql")).sort();
    for (const file of files) {
      const version = basename(file, ".sql");
      const [applied] = await connection.query("SELECT 1 FROM schema_migrations WHERE version = ? LIMIT 1", [version]);
      if (applied.length > 0) continue;
      const sql = await readFile(join(migrationsDirectory, file), "utf8");
      await connection.beginTransaction();
      try {
        for (const statement of sql.split(/;\s*(?:\n|$)/).map((item) => item.trim()).filter(Boolean)) {
          await connection.query(statement);
        }
        await connection.query("INSERT INTO schema_migrations (version) VALUES (?)", [version]);
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }

    await refreshMysqlSchema(connection);
  } finally {
    await connection.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await migrateDatabase();
}
