// @vitest-environment node
// Regression tests for BUG-002: provider failures before the first streamed
// content chunk must produce a clean HTTP error status instead of an SSE error
// frame. The status itself is now the mapped one from BUG-014 (a connection
// failure is 504, an unclassified failure 500), and the body carries fixed
// client copy rather than the provider's own text.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "http://127.0.0.1:9";
process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef";

const { createChainMock, openaiCreateMock } = vi.hoisted(() => {
  const openaiCreateMock = vi.fn();
  // Minimal Drizzle-like chain: every builder resolves to [row]. Covers
  // select().from().where().orderBy() and insert().values() / update().set().where().
  const createChainMock = (row: unknown) => {
    const chain = {
      select: () => chain,
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: () => chain,
      values: () => chain,
      set: () => chain,
      then: (resolve: (v: unknown) => void) => resolve([row]),
    };
    return chain;
  };
  return { createChainMock, openaiCreateMock };
});

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
  conversations: { id: {}, title: {}, createdAt: {} },
  messages: { conversationId: {}, createdAt: {} },
}));
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: openaiCreateMock } } },
}));

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
  vi.mocked(db.select).mockImplementation(() => createChainMock({ id: 1, title: "New Chat", mode: "chat" }) as never);
  vi.mocked(db.insert).mockImplementation(() => createChainMock({}) as never);
  vi.mocked(db.update).mockImplementation(() => createChainMock({}) as never);
  openaiCreateMock.mockReset();
});

function postMessage(server: TestServer) {
  return server.request("POST", "/api/openai/conversations/1/messages", {
    headers: {
      "content-type": "application/json",
      cookie: `lumina_session=${createSessionToken(1)}`,
    },
    body: JSON.stringify({ content: "hello", mode: "chat" }),
  });
}

describe("BUG-002: provider failure before streaming starts", () => {
  it("returns JSON with a mapped status when the provider rejects before any content", async () => {
    openaiCreateMock.mockRejectedValue(new Error("connection refused"));

    const res = await postMessage(server);

    // A connection failure is the "provider did not respond" class (BUG-014).
    expect(res.status).toBe(504);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(res.body)).toEqual({
      error: "The AI service did not respond. Please try again.",
    });
    // The provider's own message is not forwarded.
    expect(res.body).not.toContain("connection refused");
  });

  it("does not emit an SSE error frame when streaming never started", async () => {
    openaiCreateMock.mockRejectedValue(new Error("boom"));

    const res = await postMessage(server);

    expect(res.body.startsWith("data:")).toBe(false);
    expect(res.headers["content-type"]).not.toContain("text/event-stream");
    // Unclassified failure: generic 500 copy, never the internal message.
    expect(res.status).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: "Internal server error" });
    expect(res.body).not.toContain("boom");
  });

  it("still streams SSE and completes when the provider succeeds", async () => {
    async function* okStream() {
      yield { choices: [{ delta: { content: "he" } }] };
      yield { choices: [{ delta: { content: "llo" } }] };
    }
    openaiCreateMock.mockResolvedValue(okStream());

    const res = await postMessage(server);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.body).toContain("he");
    expect(res.body).toContain("llo");
    expect(res.body).toContain('"done":true');
  });
});
