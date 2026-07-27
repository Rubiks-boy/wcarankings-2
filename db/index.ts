import { Pool, type QueryResultRow } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const globalForDb = globalThis as typeof globalThis & {
  __cubeRanksPool?: Pool;
};

export function getPool() {
  if (globalForDb.__cubeRanksPool) return globalForDb.__cubeRanksPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");

  globalForDb.__cubeRanksPool = new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
    idleTimeoutMillis: 30_000,
  });
  return globalForDb.__cubeRanksPool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  return getPool().query<T>(text, values);
}
