// @vitest-environment node
// Regression tests for Audit 3 F-08: message `content` had no max length, so a
// 1 MB request was persisted verbatim and replayed into the provider context on
// later turns. The OpenapiMessageInput contract now caps content at 100,000
// characters; oversized messages must be rejected with 400 before any side
// effect (no provider call, no persist), while a message exactly at the limit
// must still be accepted.
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
const openaiModule = await import("@workspace/integrations-openai-ai-server");

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
  // findOwnedConversation + history lookups resolve to a real-ish conversation.
  vi.mocked(db.select).mockImplementation(
    () => createChainMock([{ id: 1, userId: 1, title: "T", mode: "chat" }]) as never,
  );
  vi.mocked(db.insert).mockImplementation(() => createChainMock(undefined) as never);
});

function postMessage(content: string) {
  return server.request("POST", "/api/openai/conversations/1/messages", {
    headers: {
      "content-type": "application/json",
      cookie: `lumina_session=${createSessionToken(1)}`,
    },
    body: JSON.stringify({ content, mode: "chat" }),
  });
}

describe("POST /messages content length limit (Audit 3 F-08)", () => {
  it("rejects content beyond the 100,000-character contract limit with 400 and no side effects", async () => {
    const res = await postMessage("x".repeat(100_001));

    expect(res.status).toBe(400);
    const createMock = openaiModule.openai.chat.completions.create as ReturnType<typeof vi.fn>;
    expect(createMock).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("accepts content exactly at the 100,000-character limit and streams normally", async () => {
    const res = await postMessage("y".repeat(100_000));

    expect(res.status).toBe(200);
    expect(res.body).toContain("ok");
    const createMock = openaiModule.openai.chat.completions.create as ReturnType<typeof vi.fn>;
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
