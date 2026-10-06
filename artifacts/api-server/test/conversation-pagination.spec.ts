// @vitest-environment node
// Covers the bounded message window on GET /openai/conversations/:id
// (Audit 3 F-03 / BUG-008): the endpoint used to return every message, which
// shipped multi-megabyte image data URIs on every load. It now returns the
// newest `limit` messages (oldest-first in the payload) plus `nextCursor` when
// older history remains, and `?cursor` pages further back.
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
      orderBy: () => chain,
      limit: () => chain,
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    return chain;
  };
  return { createChainMock };
});

vi.mock("@workspace/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
  conversations: { id: {}, userId: {}, title: {}, mode: {}, createdAt: {} },
  messages: { id: {}, conversationId: {}, role: {}, content: {}, createdAt: {} },
  messageImages: { id: {}, messageId: {}, mediaType: {}, data: {} },
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: vi.fn() } } },
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

const CONVERSATION = { id: 1, userId: 1, title: "T", mode: "chat", createdAt: null };

function message(id: number) {
  return { id, conversationId: 1, role: "user", content: `m${id}`, createdAt: null };
}

beforeEach(() => {
  vi.clearAllMocks();
});

function get(path: string) {
  return server.request("GET", path, {
    headers: { cookie: `lumina_session=${createSessionToken(1)}` },
  });
}

/** Conversation lookup succeeds, then the messages query returns `rows`. */
function withConversationAndMessages(rows: unknown[]) {
  vi.mocked(db.select)
    .mockImplementationOnce(() => createChainMock([CONVERSATION]) as never)
    .mockImplementationOnce(() => createChainMock(rows) as never);
}

describe("GET /openai/conversations/:id windowed pagination (Audit 3 F-03)", () => {
  it("returns the newest window oldest-first with a nextCursor when older messages remain", async () => {
    // Newest-first over-fetch of limit+1 = 3 rows; the third is the "more" probe.
    withConversationAndMessages([message(7), message(6), message(5)]);

    const res = await get("/api/openai/conversations/1?limit=2");

    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.messages.map((m: { id: number }) => m.id)).toEqual([6, 7]);
    expect(body.nextCursor).toBe(6);
  });

  it("sets nextCursor to null when the window reaches the start of the history", async () => {
    withConversationAndMessages([message(7), message(6)]);

    const res = await get("/api/openai/conversations/1?limit=2");

    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.messages.map((m: { id: number }) => m.id)).toEqual([6, 7]);
    expect(body.nextCursor).toBeNull();
  });

  it("pages older history with ?cursor", async () => {
    withConversationAndMessages([message(5), message(4), message(3)]);

    const res = await get("/api/openai/conversations/1?limit=2&cursor=6");

    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.messages.map((m: { id: number }) => m.id)).toEqual([4, 5]);
    expect(body.nextCursor).toBe(4);
  });

  it("returns an empty window and null cursor for a conversation with no messages", async () => {
    withConversationAndMessages([]);

    const res = await get("/api/openai/conversations/1");

    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.messages).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  it("rejects an out-of-range limit before touching the database", async () => {
    const res = await get("/api/openai/conversations/1?limit=0");

    expect(res.status).toBe(400);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("404s a conversation the caller does not own", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => createChainMock([]) as never);

    const res = await get("/api/openai/conversations/1");

    expect(res.status).toBe(404);
  });
});
