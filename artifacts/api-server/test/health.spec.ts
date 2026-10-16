// @vitest-environment node
// BUG-013: `/api/health` reports database readiness so a broken local setup is
// diagnosable with one curl instead of a generic banner in the UI. `/api/healthz`
// stays a pure liveness probe that never touches the database.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "http://127.0.0.1:9";
process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef";

vi.mock("@workspace/db", () => ({
  pool: { query: vi.fn() },
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
  users: { id: {}, email: {}, name: {}, passwordHash: {} },
  conversations: {},
  messages: {},
  messageImages: {},
}));

const { startTestServer } = await import("./helpers/server");
const { default: app } = await import("../src/app");
const { pool } = await import("@workspace/db");

type TestServer = Awaited<ReturnType<typeof startTestServer>>;
let server: TestServer;

beforeAll(async () => {
  server = await startTestServer(app);
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  vi.mocked(pool.query).mockReset();
});

/** Reachable database whose schema is applied. */
function healthyDatabase() {
  vi.mocked(pool.query).mockImplementation((async (sql: string) =>
    String(sql).includes("to_regclass")
      ? { rows: [{ users_table: "users" }] }
      : { rows: [] }) as never);
}

describe("GET /api/health", () => {
  it("answers 200 with database: ok when the database is reachable and migrated", async () => {
    healthyDatabase();

    const res = await server.request("GET", "/api/health");

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: "ok", database: "ok" });
  });

  it("answers 503 with actionable guidance when the database cannot be reached", async () => {
    vi.mocked(pool.query).mockImplementation((async () => {
      throw new Error("connect ECONNREFUSED postgresql://lumina_user:hunter2@localhost:5432/lumina");
    }) as never);

    const res = await server.request("GET", "/api/health");

    expect(res.status).toBe(503);
    const body = JSON.parse(res.body) as { status: string; database: string; message: string };
    expect(body.status).toBe("degraded");
    expect(body.database).toBe("unreachable");
    expect(body.message).toContain("DATABASE_URL");
    // Diagnostics help the developer; credentials must not appear anywhere.
    expect(res.body).not.toContain("hunter2");
    expect(res.body).not.toContain("lumina_user");
  });

  it("answers 503 naming the missing migration when the schema was never pushed", async () => {
    vi.mocked(pool.query).mockImplementation((async (sql: string) =>
      String(sql).includes("to_regclass") ? { rows: [{ users_table: null }] } : { rows: [] }) as never);

    const res = await server.request("GET", "/api/health");

    expect(res.status).toBe(503);
    const body = JSON.parse(res.body) as { database: string; message: string };
    expect(body.database).toBe("schema-missing");
    expect(body.message).toContain("pnpm db:push");
  });
});

describe("GET /api/healthz", () => {
  it("stays a pure liveness probe (200, no database query)", async () => {
    const res = await server.request("GET", "/api/healthz");

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: "ok" });
    expect(pool.query).not.toHaveBeenCalled();
  });
});
