import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is missing. Copy .env.example to .env and set it to a reachable PostgreSQL database.",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

/**
 * Close the pool. Multiple calls are safe (Audit 2 F-08): the test suite
 * imports this module fresh per spec file under vi.resetModules(), so several
 * pools exist per worker; each must be endable without throwing.
 */
let poolClosed = false;
export async function closePool(): Promise<void> {
  if (poolClosed) return;
  poolClosed = true;
  await pool.end();
}

export * from "./schema";
