// @vitest-environment node
// Regression tests for Audit 3 F-02 / BUG-007. Two halves:
// 1. With TRUST_PROXY_HOPS=1, Express trusts one proxy hop, so clients behind
//    it are keyed by their X-Forwarded-For address instead of all sharing the
//    proxy's socket IP.
// 2. The cost-bearing chat limiter keys on the signed-in user id (composite
//    with IP), so authenticated clients can't exhaust one another by sharing
//    an egress IP.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "http://127.0.0.1:9";
process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.TRUST_PROXY_HOPS = "1";

const { createChainMock } = vi.hoisted(() => {
  const createChainMock = (result: unknown) => {
    const chain = {
      select: () => chain,
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      values: () => chain,
      set: () => chain,
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    return chain;
  };
  return { createChainMock };
});

vi.mock("@workspace/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
  users: { id: {}, email: {}, name: {}, passwordHash: {} },
  conversations: { id: {}, userId: {}, title: {}, mode: {}, createdAt: {} },
  messages: { conversationId: {}, createdAt: {}, id: {} },
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: {
    chat: {
      completions: {
        create: vi.fn(async () => ({
          async *[Symbol.asyncIterator]() {
            yield { choices: [{ delta: { content: "ok" } }] };
          },
        })),
      },
    },
  },
}));

vi.resetModules();

const { startTestServer } = await import("./helpers/server");
const { default: app } = await import("../src/app");
const { createSessionToken } = await import("../src/lib/session");
const { db } = await import("@workspace/db");

type TestServer = Awaited<ReturnType<typeof startTestServer>>;
let server: TestServer;

beforeAll(async () => {
  server = await startTestServer(app);
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.select).mockImplementation(
    () => createChainMock([{ id: 1, userId: 1, title: "T", mode: "chat" }]) as never,
  );
  vi.mocked(db.insert).mockImplementation(() => createChainMock(undefined) as never);
});

const authHeaders = {
  "content-type": "application/json",
  cookie: `lumina_session=${createSessionToken(1)}`,
};

function sendMessage(xff?: string) {
  return server.request("POST", "/api/openai/conversations/1/messages", {
    headers: { ...authHeaders, ...(xff ? { "x-forwarded-for": xff } : {}) },
    body: JSON.stringify({ content: "hi", mode: "chat" }),
  });
}

describe("rate limiter keying (Audit 3 F-02 / BUG-007)", () => {
  it("trusts one proxy hop when TRUST_PROXY_HOPS=1 (X-Forwarded-For becomes req.ip)", async () => {
    // 34 requests: above the 30/min chatLimiter. Clients behind a trusted
    // proxy are keyed on their X-Forwarded-For address, so each distinct
    // address gets its own bucket and no request should be limited here.
    const statuses: number[] = [];
    for (let i = 0; i < 34; i++) {
      const res = await sendMessage(i < 30 ? "10.0.0.1" : "10.0.0.2");
      statuses.push(res.status);
    }
    // The first 30 from 10.0.0.1 may consume that bucket, but the distinct
    // 10.0.0.2 client must keep its own.
    expect(statuses.slice(30).every((s) => s === 200)).toBe(true);
  });

  it("keys the chat limiter on the signed-in user, not just the shared IP", async () => {
    // Same socket IP (no XFF): one user burns the 30/min bucket…
    for (let i = 0; i < 30; i++) {
      await sendMessage();
    }
    // …but a different signed-in user on the same IP keeps their own bucket.
    const other = {
      "content-type": "application/json",
      cookie: `lumina_session=${createSessionToken(2)}`,
    };
    const res = await server.request("POST", "/api/openai/conversations/1/messages", {
      headers: other,
      body: JSON.stringify({ content: "hi", mode: "chat" }),
    });
    expect(res.status).toBe(200);
  });

  it("still limits a single user who exceeds their own bucket", async () => {
    let sawLimited = false;
    for (let i = 0; i < 34; i++) {
      const res = await sendMessage("203.0.113.9");
      if (res.status === 429) {
        sawLimited = true;
        break;
      }
    }
    expect(sawLimited).toBe(true);
  });
});
