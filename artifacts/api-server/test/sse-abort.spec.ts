// @vitest-environment node
// Regression tests for Audit 3 F-04 / BUG-009: a client that disconnects
// mid-stream must abort the provider stream (no more billable tokens) instead
// of draining it to completion.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";

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

// Mirrors the real OpenAI SDK: the iterable rejects with an abort-style error
// when the signal passed in params fires, and yields chunks until then.
const { providerCalls } = vi.hoisted(() => {
  const providerCalls: Array<{ signal?: AbortSignal }> = [];
  return { providerCalls };
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
        create: vi.fn(async (_body: unknown, options: { signal?: AbortSignal }) => {
          providerCalls.push(options);
          const signal = options.signal;
          return {
            async *[Symbol.asyncIterator]() {
              // First chunk: delivered normally (SSE starts).
              yield { choices: [{ delta: { content: "Hello" } }] };
              // Then hang until aborted — like a real long completion.
              await new Promise<void>((resolve, reject) => {
                if (signal?.aborted) {
                  reject(new Error("Request was aborted."));
                  return;
                }
                signal?.addEventListener(
                  "abort",
                  () => reject(new Error("Request was aborted.")),
                  { once: true },
                );
              });
            },
          };
        }),
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
  providerCalls.length = 0;
  // findOwnedConversation + history lookups resolve to a real-ish conversation.
  vi.mocked(db.select).mockImplementation(
    () => createChainMock([{ id: 1, userId: 1, title: "T", mode: "chat" }]) as never,
  );
  vi.mocked(db.insert).mockImplementation(
    () => createChainMock(undefined) as never,
  );
});

/**
 * POSTs a message and destroys the client socket as soon as the first response
 * bytes arrive (i.e. mid-stream, after the provider's first chunk started the
 * SSE response). Resolves once the socket is destroyed.
 */
function postMessageAndDestroy(server: TestServer, body: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      `${server.url}/api/openai/conversations/1/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `lumina_session=${createSessionToken(1)}`,
        },
      },
      (res) => {
        res.once("data", () => {
          req.destroy();
          resolve();
        });
      },
    );
    req.on("error", () => resolve()); // destroy may surface as a client error
    req.end(JSON.stringify(body));
  });
}

function providerParams() {
  const createMock = openaiModule.openai.chat.completions.create as ReturnType<typeof vi.fn>;
  return (createMock.mock.calls[0]?.[1] ?? {}) as { signal?: AbortSignal };
}

describe("POST /messages aborts on client disconnect (Audit 3 F-04)", () => {
  it("aborts the provider stream when the client disconnects mid-stream", async () => {
    await postMessageAndDestroy(server, { content: "hi", mode: "chat" });

    await vi.waitFor(
      () => {
        expect(providerParams().signal).toBeInstanceOf(AbortSignal);
        expect(providerParams().signal?.aborted).toBe(true);
      },
      { timeout: 2000, interval: 50 },
    );
  });

  it("does not persist the assistant message when the stream is aborted mid-way", async () => {
    await postMessageAndDestroy(server, { content: "hi", mode: "chat" });

    await vi.waitFor(
      () => {
        expect(providerParams().signal?.aborted).toBe(true);
      },
      { timeout: 2000, interval: 50 },
    );

    // The user message insert happened before streaming; after the abort the
    // assistant message must NOT be inserted. Wait past the abort, then the
    // insert count must stay at exactly 1.
    await new Promise((r) => setTimeout(r, 200));
    expect(vi.mocked(db.insert)).toHaveBeenCalledTimes(1);
  });
});
