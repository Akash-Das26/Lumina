import { pool } from "@workspace/db";
import { errorMessage, redactSecrets } from "./safe-error";

/**
 * BUG-013: database readiness.
 *
 * A database that is unreachable or not initialized used to be invisible until
 * the first request that touched it — which answered a generic 500 and left the
 * UI showing "Unable to create your account. Please try again." with no clue.
 * These helpers turn that into a startup failure and a health endpoint, both
 * with actionable copy and no credentials in the output.
 */

export type DatabaseHealth =
  | { ok: true }
  | {
      ok: false;
      reason: "unreachable" | "schema-missing";
      /** Safe, actionable guidance for the developer. */
      message: string;
      /** The real driver error, redacted — for logs only. */
      detail: string;
    };

// pg has no connect timeout by default, so a black-holed host would hang a probe.
const CHECK_TIMEOUT_MS = 5_000;

const UNREACHABLE_MESSAGE =
  "Cannot reach the database. Check that PostgreSQL is running and that DATABASE_URL in .env has the right host, port, user and password (see README → Run locally).";

const SCHEMA_MISSING_MESSAGE =
  "The database is reachable but its schema is missing. Run `pnpm db:push` from the project root, then start the API again.";

type Query = (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`database check timed out after ${ms}ms`)), ms);
    timer.unref?.();
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function unreachable(error: unknown): DatabaseHealth {
  return {
    ok: false,
    reason: "unreachable",
    message: UNREACHABLE_MESSAGE,
    detail: redactSecrets(errorMessage(error)),
  };
}

/**
 * Probes the configured database: first that it answers at all, then that the
 * `users` table exists (the schema was pushed). Never throws, so callers can use
 * it on a health route and at startup.
 */
export async function checkDatabase(query: Query = (sql) => pool.query(sql)): Promise<DatabaseHealth> {
  try {
    await withTimeout(query("select 1"), CHECK_TIMEOUT_MS);
  } catch (error) {
    return unreachable(error);
  }

  try {
    const { rows } = await withTimeout(
      query("select to_regclass('public.users') as users_table"),
      CHECK_TIMEOUT_MS,
    );
    if (rows[0]?.users_table == null) {
      return {
        ok: false,
        reason: "schema-missing",
        message: SCHEMA_MISSING_MESSAGE,
        detail: "the users table does not exist",
      };
    }
  } catch (error) {
    return unreachable(error);
  }

  return { ok: true };
}

/**
 * True for a PostgreSQL unique-constraint violation (SQLSTATE 23505), looking
 * through the wrapper errors Drizzle may add.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 5; depth += 1) {
    if ((current as { code?: unknown }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
