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
 * A terminated backend connection (database restart, `pg_ctl stop`, idle
 * timeout, network blip) is reported as an 'error' event on the pool. With no
 * listener Node treats it as an unhandled 'error' event and **kills the
 * process** — verified in BUG-013: stopping PostgreSQL took the whole API down,
 * so every later request failed at the socket instead of answering a 500 / 503.
 * Keep the server alive (the next query reconnects) and report the error.
 */
let reportPoolError: (error: unknown) => void = (error) => {
  console.error("[db] connection error:", error instanceof Error ? error.message : error);
};

/** Route pool-level errors through the caller's logger (the API uses pino). */
export function setPoolErrorHandler(handler: (error: unknown) => void): void {
  reportPoolError = handler;
}

pool.on("error", (error) => reportPoolError(error));

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
