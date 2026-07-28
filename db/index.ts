import { createRequire } from "node:module";
import type { Pool } from "mysql2/promise";

const require = createRequire(import.meta.url);
const { createPool } = require("mysql2/promise") as typeof import("mysql2/promise");

const globalForDb = globalThis as typeof globalThis & {
  __cubeRanksPool?: Pool;
};

function getDatabaseOptions() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, "")),
    waitForConnections: true,
    connectionLimit: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeout: 30_000,
    enableKeepAlive: true,
  } as const;
}

export function getPool() {
  if (globalForDb.__cubeRanksPool) return globalForDb.__cubeRanksPool;
  globalForDb.__cubeRanksPool = createPool(getDatabaseOptions());
  return globalForDb.__cubeRanksPool;
}

export async function query<T extends Record<string, unknown>>(text: string, values: unknown[] = []) {
  const [rows] = await getPool().query(text, values) as [T[], unknown];
  return { rows, rowCount: rows.length };
}
