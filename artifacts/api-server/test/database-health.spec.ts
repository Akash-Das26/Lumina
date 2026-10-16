// @vitest-environment node
// Unit tests for BUG-013's diagnostics helpers: the readiness probe must
// distinguish "unreachable" from "reachable but not migrated", and every message
// it produces (guidance and log detail alike) must be free of connection strings.
import { describe, expect, it } from "vitest";

// Imports of the module under test are dynamic: `@workspace/db` refuses to load
// without DATABASE_URL, and the probe below is always given a fake query anyway.
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef";

const { checkDatabase, isUniqueViolation } = await import("../src/lib/database");
const { redactSecrets, toLoggableError } = await import("../src/lib/safe-error");

type Result = { rows: Array<Record<string, unknown>> };
type Query = (sql: string) => Promise<Result>;

const userTable = (value: string | null): Result => ({ rows: [{ users_table: value }] });

/** Answers `select 1` then the schema probe. */
function healthyQuery(): Query {
  return async (sql) => (sql.includes("to_regclass") ? userTable("users") : { rows: [] });
}

describe("checkDatabase", () => {
  it("reports ok when the database answers and the users table exists", async () => {
    await expect(checkDatabase(healthyQuery())).resolves.toEqual({ ok: true });
  });

  it("reports unreachable when the connection fails, with actionable guidance", async () => {
    const failing: Query = async () => {
      throw new Error('password authentication failed for user "lumina_user"');
    };

    const health = await checkDatabase(failing);

    expect(health.ok).toBe(false);
    if (health.ok) return;
    expect(health.reason).toBe("unreachable");
    expect(health.message).toContain("DATABASE_URL");
    expect(health.message).toContain(".env");
    // The real driver error is kept for the logs.
    expect(health.detail).toContain("password authentication failed");
  });

  it("reports schema-missing when the database is reachable but not migrated", async () => {
    const unmigrated: Query = async (sql) =>
      sql.includes("to_regclass") ? userTable(null) : { rows: [] };

    const health = await checkDatabase(unmigrated);

    expect(health.ok).toBe(false);
    if (health.ok) return;
    expect(health.reason).toBe("schema-missing");
    expect(health.message).toContain("pnpm db:push");
    expect(health.detail).toBe("the users table does not exist");
  });

  it("treats a schema-probe failure as unreachable rather than ready", async () => {
    let calls = 0;
    const flaky: Query = async () => {
      calls += 1;
      if (calls === 1) return { rows: [] };
      throw new Error("connection terminated unexpectedly");
    };

    const health = await checkDatabase(flaky);

    expect(health.ok).toBe(false);
    expect(health.ok ? null : health.reason).toBe("unreachable");
  });

  it("never echoes a connection string in its guidance or detail", async () => {
    const failing: Query = async () => {
      throw new Error("connect ECONNREFUSED postgresql://lumina_user:hunter2@localhost:5432/lumina");
    };

    const health = await checkDatabase(failing);
    const serialised = JSON.stringify(health);

    expect(serialised).not.toContain("hunter2");
    expect(serialised).not.toContain("lumina_user");
    expect(health.ok ? "" : health.detail).toContain("<redacted-url>");
  });
});

describe("isUniqueViolation", () => {
  it("recognises a PostgreSQL 23505, including when wrapped by a driver", () => {
    expect(isUniqueViolation(Object.assign(new Error("duplicate key"), { code: "23505" }))).toBe(true);

    const wrapped = new Error("Failed query: insert into users");
    (wrapped as { cause?: unknown }).cause = Object.assign(new Error("duplicate key value"), {
      code: "23505",
    });
    expect(isUniqueViolation(wrapped)).toBe(true);
  });

  it("ignores any other error", () => {
    expect(isUniqueViolation(new Error("connection refused"))).toBe(false);
    expect(isUniqueViolation(Object.assign(new Error("deadlock"), { code: "40P01" }))).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
  });
});

describe("safe error logging", () => {
  it("redacts every URL-shaped token", () => {
    expect(redactSecrets("failed: postgresql://u:p@host/db")).toBe("failed: <redacted-url>");
    expect(redactSecrets("see https://api.example.com/v1?key=abc")).toBe("see <redacted-url>");
    expect(redactSecrets("no urls here")).toBe("no urls here");
  });

  it("keeps the message and stack, minus secrets", () => {
    const cause = new Error("password authentication failed for postgresql://u:secret@host/db");
    const error = new Error("Failed query: select 1 from users");
    (error as { cause?: unknown }).cause = cause;

    const logged = toLoggableError(error);

    expect(logged.message).toBe("Failed query: select 1 from users");
    expect(logged.stack).toContain("Failed query: select 1 from users");
    expect(logged.stack).toContain("Caused by:");
    expect(logged.stack).toContain("password authentication failed");
    expect(logged.stack).not.toContain("secret");
  });

  it("logs a non-Error value without throwing", () => {
    expect(toLoggableError("boom").message).toBe("boom");
    expect(toLoggableError({ weird: true }).message).toBe("Unknown error");
  });
});
