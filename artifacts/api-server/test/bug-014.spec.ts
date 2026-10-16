// @vitest-environment node
// BUG-014: provider failures in *every* AI route answer with safe, mapped copy
// — never the provider's own message, never a key — while the server log keeps
// the real details, and a failing tool does not break the others.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "http://127.0.0.1:9";
process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef";

const { createChainMock, openaiCreateMock, generateImageBufferMock, insertValuesMock } =
  vi.hoisted(() => {
    const openaiCreateMock = vi.fn();
    const generateImageBufferMock = vi.fn();
    const insertValuesMock = vi.fn();
    // Minimal Drizzle-like chain whose builders resolve to the given rows.
    const createChainMock = (row: unknown) => {
      const chain = {
        select: () => chain,
        from: () => chain,
        where: () => chain,
        orderBy: () => chain,
        limit: () => chain,
        values: (value: unknown) => {
          insertValuesMock(value);
          return chain;
        },
        set: () => chain,
        returning: () => chain,
        then: (resolve: (v: unknown) => void) => resolve(row),
      };
      return chain;
    };
    return { createChainMock, openaiCreateMock, generateImageBufferMock, insertValuesMock };
  });

vi.mock("@workspace/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
  conversations: { id: {}, userId: {}, title: {}, mode: {}, createdAt: {} },
  messages: { conversationId: {}, createdAt: {}, id: {}, role: {}, content: {} },
  messageImages: { id: {}, messageId: {}, mediaType: {}, data: {} },
}));
vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: openaiCreateMock } } },
}));
vi.mock("@workspace/integrations-openai-ai-server/image", () => ({
  generateImageBuffer: generateImageBufferMock,
}));

const { startTestServer } = await import("./helpers/server");
const { default: app } = await import("../src/app");
const { createSessionToken } = await import("../src/lib/session");
const { logger } = await import("../src/lib/logger");
const { db } = await import("@workspace/db");

type TestServer = Awaited<ReturnType<typeof startTestServer>>;
let server: TestServer;

beforeAll(async () => {
  server = await startTestServer(app);
});

afterAll(async () => {
  await server.close();
});

const CONVERSATION = { id: 1, userId: 1, title: "New Chat", mode: "chat" };
const ASSISTANT_KEY = "sk-proj-7f3c9a21b45e8d06a1c2";

/** The reported toast, verbatim: provider text that echoes part of the key. */
const PROVIDER_401_MESSAGE = `401 Incorrect API key provided: replace-*********-key. You can find your API key at https://platform.openai.com/account/api-keys`;

/** Mimics the OpenAI SDK's APIError. */
function apiError(status: number, message: string, code = "provider_error"): Error {
  return Object.assign(new Error(message), { status, code });
}

beforeEach(() => {
  vi.clearAllMocks();
  generateImageBufferMock.mockReset();
  insertValuesMock.mockReset();
  // findOwnedConversation answers with the conversation; the history lookup
  // answers with previous rows (none by default, so sends behave as usual).
  let selectCall = 0;
  vi.mocked(db.select).mockImplementation(() => {
    selectCall += 1;
    return createChainMock(selectCall === 1 ? [CONVERSATION] : []) as never;
  });
  vi.mocked(db.insert).mockImplementation(() => createChainMock([]) as never);
  vi.mocked(db.update).mockImplementation(() => createChainMock([]) as never);
  vi.mocked(db.delete).mockImplementation(() => createChainMock([]) as never);
});

function postMessage(content = "hello", mode = "chat") {
  return server.request("POST", "/api/openai/conversations/1/messages", {
    headers: {
      "content-type": "application/json",
      cookie: `lumina_session=${createSessionToken(1)}`,
    },
    body: JSON.stringify({ content, mode }),
  });
}

function generateImage(prompt = "a red fox") {
  return server.request("POST", "/api/openai/generate-image", {
    headers: {
      "content-type": "application/json",
      cookie: `lumina_session=${createSessionToken(1)}`,
    },
    body: JSON.stringify({ prompt }),
  });
}

describe("chat: provider failures are mapped, never forwarded", () => {
  it("answers a provider 401 as 502 with administrator copy", async () => {
    const errorLog = vi.spyOn(logger, "error").mockImplementation(() => undefined as never);
    openaiCreateMock.mockRejectedValue(apiError(401, PROVIDER_401_MESSAGE, "invalid_api_key"));

    const res = await postMessage();

    expect(res.status).toBe(502);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(res.body)).toEqual({
      error: "The AI service is not configured correctly. Please contact the administrator.",
    });
    // No provider text, no key material, no provider URL in the response.
    expect(res.body).not.toContain("Incorrect API key");
    expect(res.body).not.toContain("replace-");
    expect(res.body).not.toContain(ASSISTANT_KEY);
    expect(res.body).not.toContain("platform.openai.com");
    // Nor in the log — but the provider's status, code and request id are there.
    const [record] = errorLog.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(record).toMatchObject({ providerStatus: 401, providerCode: "invalid_api_key" });
    expect(typeof record.reqId).toBe("string");
    expect(JSON.stringify(record)).not.toContain("replace-*********-key");
    errorLog.mockRestore();
  });

  it("answers a provider 429 as 503 'busy or over quota'", async () => {
    openaiCreateMock.mockRejectedValue(apiError(429, "Rate limit reached for openai/gpt-oss-120b"));

    const res = await postMessage();

    expect(res.status).toBe(503);
    expect(JSON.parse(res.body)).toEqual({
      error: "The AI service is busy or over quota. Please try again later.",
    });
    expect(res.body).not.toContain("Rate limit reached");
  });

  it("answers a provider timeout as 504", async () => {
    openaiCreateMock.mockRejectedValue(
      Object.assign(new Error("Connection error."), { name: "APIConnectionTimeoutError" }),
    );

    const res = await postMessage();

    expect(res.status).toBe(504);
    expect(JSON.parse(res.body)).toEqual({
      error: "The AI service did not respond. Please try again.",
    });
  });

  it("answers an unclassified provider failure as a generic 500", async () => {
    openaiCreateMock.mockRejectedValue(new Error("provider exploded: column images.bytes"));

    const res = await postMessage();

    expect(res.status).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: "Internal server error" });
    expect(res.body).not.toContain("provider exploded");
  });

  it("carries the mapped copy (not provider text) in a mid-stream error frame", async () => {
    openaiCreateMock.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: "Hello" } }] };
        throw apiError(429, "Rate limit reached: too many requests");
      },
    });

    const res = await postMessage();

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.body).toContain("Hello");
    expect(res.body).toContain("The AI service is busy or over quota. Please try again later.");
    expect(res.body).not.toContain("Rate limit reached");
  });
});

describe("image generation: same mapping, and it does not break chat", () => {
  it("answers a provider 401 as 502 with the same administrator copy", async () => {
    generateImageBufferMock.mockRejectedValue(apiError(401, PROVIDER_401_MESSAGE));

    const res = await generateImage();

    expect(res.status).toBe(502);
    expect(JSON.parse(res.body)).toEqual({
      error: "The AI service is not configured correctly. Please contact the administrator.",
    });
    expect(res.body).not.toContain("Incorrect API key");
    expect(res.body).not.toContain("platform.openai.com");
  });

  it("leaves chat working after the image provider fails", async () => {
    generateImageBufferMock.mockRejectedValue(apiError(401, PROVIDER_401_MESSAGE));
    const failed = await generateImage();
    expect(failed.status).toBe(502);

    async function* okStream() {
      yield { choices: [{ delta: { content: "still here" } }] };
    }
    openaiCreateMock.mockResolvedValue(okStream());

    const chat = await postMessage();

    expect(chat.status).toBe(200);
    expect(chat.body).toContain("still here");
  });
});

describe("search: uses the shared mapping for its failure path", () => {
  function searchReq() {
    return server.request("GET", "/api/openai/search?q=ada+lovelace", {
      headers: { cookie: `lumina_session=${createSessionToken(1)}` },
    });
  }

  it("answers 504 with safe copy when the source fetch itself fails", async () => {
    // A synchronously throwing `fetch` (a broken global, a misconfigured
    // runtime) is the one way this route's own catch runs — the concurrent
    // source calls otherwise degrade to partial/empty results on purpose.
    vi.stubGlobal("fetch", () => {
      throw new Error("en.wikipedia.org unreachable: getaddrinfo ENOTFOUND");
    });
    try {
      const res = await searchReq();

      expect(res.status).toBe(504);
      expect(JSON.parse(res.body)).toEqual({
        error: "The AI service did not respond. Please try again.",
      });
      expect(res.body).not.toContain("unreachable");
      expect(res.body).not.toContain("ENOTFOUND");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("still degrades gracefully when both public sources are down", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("network down"))));
    try {
      const res = await searchReq();

      // Deliberate: Search falls back to the model's own knowledge rather than
      // failing the whole turn, and nothing from the failed fetch leaks.
      expect(res.status).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ query: "ada lovelace", sources: [] });
      expect(res.body).not.toContain("network down");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("retry after a failed message", () => {
  it("reuses the unanswered prompt instead of inserting a duplicate", async () => {
    // The previous attempt persisted this prompt and produced no assistant reply.
    vi.mocked(db.select)
      .mockImplementationOnce(() => createChainMock([CONVERSATION]) as never)
      .mockImplementationOnce(() =>
        createChainMock([{ role: "user", content: "hello", id: 7 }]) as never,
      );
    async function* okStream() {
      yield { choices: [{ delta: { content: "hi" } }] };
    }
    openaiCreateMock.mockResolvedValue(okStream());

    const res = await postMessage("hello");

    expect(res.status).toBe(200);
    // Only the assistant message is inserted: the prompt is already there.
    const insertedValues = insertValuesMock.mock.calls.map((call) => call[0]);
    expect(insertedValues.some((value) => (value as { role?: string })?.role === "user")).toBe(false);
    expect(insertedValues.some((value) => (value as { role?: string })?.role === "assistant")).toBe(true);
    // ...and the provider still receives the prompt it never answered.
    const createMock = openaiCreateMock as ReturnType<typeof vi.fn>;
    const body = createMock.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "hello" });
    expect(body.messages.filter((m) => m.role === "user")).toHaveLength(1);
  });

  it("still inserts a genuinely new message", async () => {
    vi.mocked(db.select)
      .mockImplementationOnce(() => createChainMock([CONVERSATION]) as never)
      .mockImplementationOnce(() =>
        createChainMock([
          { role: "user", content: "earlier", id: 6 },
          { role: "assistant", content: "answered", id: 7 },
        ]) as never,
      );
    async function* okStream() {
      yield { choices: [{ delta: { content: "hi" } }] };
    }
    openaiCreateMock.mockResolvedValue(okStream());

    const res = await postMessage("hello");

    expect(res.status).toBe(200);
    const insertedValues = insertValuesMock.mock.calls.map((call) => call[0]);
    expect(
      insertedValues.some(
        (value) => (value as { role?: string; content?: string })?.role === "user" &&
          (value as { content?: string }).content === "hello",
      ),
    ).toBe(true);
  });
});
