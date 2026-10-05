// @vitest-environment node
// Coverage for Audit 3 F-10: GET /openai/stats and the GET /auth/me
// deleted-user path had no tests at all. These verify the stats payload shape
// (per-user counts + recent conversations, 401 without a session) and that
// /auth/me validates softly — 401 once the user row is gone even though the
// session cookie still carries a valid signature.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "http://127.0.0.1:9";
process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef";

const { createChainMock } = vi.hoisted(() => {
  const createChainMock = (result: unknown) => {
    const chain = {
      select: () => chain,
      from: () => chain,
      where: () => chain,
      innerJoin: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      values: () => chain,
      set: () => chain,
      returning: () => chain,
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    return chain;
  };
  return { createChainMock };
});

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  users: { id: {}, email: {}, name: {}, passwordHash: {} },
  conversations: { id: {}, userId: {}, title: {}, mode: {}, createdAt: {} },
  messages: { conversationId: {}, createdAt: {}, id: {} },
}));

vi.resetModules();

const { startTestServer } = await import("./helpers/server");
const { default: app } = await import("../src/app");
const { createSessionToken } = await import("../src/lib/session");
const { db } = await import("@workspace/db");

type TestServer = Awaited<ReturnType<typeof startTestServer>>;
let server: TestServer;

// GET /openai/stats issues three sequential selects: conversation count,
// message count, then the 5 most recent conversations.
let statsSelectCall = 0;
function mockStatsSelects(convCount: number, msgCount: number, recent: unknown[]) {
  statsSelectCall = 0;
  vi.mocked(db.select).mockImplementation(((..._args: unknown[]) => {
    statsSelectCall += 1;
    if (statsSelectCall === 1) return createChainMock([{ value: convCount }]) as never;
    if (statsSelectCall === 2) return createChainMock([{ value: msgCount }]) as never;
    return createChainMock(recent) as never;
  }) as never);
}

beforeAll(async () => {
  server = await startTestServer(app);
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /openai/stats (Audit 3 F-10)", () => {
  it("returns per-user counts and recent conversations", async () => {
    const recent = [
      { id: 9, title: "Recent chat", mode: "chat", createdAt: new Date("2026-10-05T00:00:00Z") },
    ];
    mockStatsSelects(3, 7, recent);

    const res = await server.request("GET", "/api/openai/stats", {
      headers: { cookie: `lumina_session=${createSessionToken(1)}` },
    });

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      totalConversations: 3,
      totalMessages: 7,
      // createdAt serializes to an ISO string over JSON.
      recentConversations: [
        { id: 9, title: "Recent chat", mode: "chat", createdAt: "2026-10-05T00:00:00.000Z" },
      ],
    });
    expect(statsSelectCall).toBe(3);
  });

  it("returns zeroed counts when the user has no rows", async () => {
    mockStatsSelects(0, 0, []);

    const res = await server.request("GET", "/api/openai/stats", {
      headers: { cookie: `lumina_session=${createSessionToken(1)}` },
    });

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      totalConversations: 0,
      totalMessages: 0,
      recentConversations: [],
    });
  });

  it("requires a session", async () => {
    const res = await server.request("GET", "/api/openai/stats");
    expect(res.status).toBe(401);
    expect(db.select).not.toHaveBeenCalled();
  });
});

describe("GET /auth/me (Audit 3 F-10)", () => {
  it("returns the signed-in user", async () => {
    vi.mocked(db.select).mockImplementation(
      () =>
        createChainMock([
          { id: 1, email: "user@example.com", name: "User", passwordHash: "h" },
        ]) as never,
    );

    const res = await server.request("GET", "/api/auth/me", {
      headers: { cookie: `lumina_session=${createSessionToken(1)}` },
    });

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ id: 1, email: "user@example.com", name: "User" });
  });

  it("returns 401 when the user no longer exists (deleted after sign-in)", async () => {
    vi.mocked(db.select).mockImplementation(() => createChainMock([]) as never);

    const res = await server.request("GET", "/api/auth/me", {
      headers: { cookie: `lumina_session=${createSessionToken(1)}` },
    });

    expect(res.status).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ error: "Authentication required" });
  });

  it("requires a session", async () => {
    const res = await server.request("GET", "/api/auth/me");
    expect(res.status).toBe(401);
  });
});
