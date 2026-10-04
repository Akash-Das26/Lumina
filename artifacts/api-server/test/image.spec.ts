// @vitest-environment node
// Covers POST /openai/generate-image: optional conversation persistence,
// ownership checks, and provider-failure handling.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "http://127.0.0.1:9";
process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef";

const { createChainMock, generateImageBufferMock, insertValuesMock, updateSetMock } = vi.hoisted(
  () => {
    const generateImageBufferMock = vi.fn();
    const insertValuesMock = vi.fn();
    const updateSetMock = vi.fn();
    // Minimal Drizzle-like chain whose builders resolve to the given value.
    const createChainMock = (result: unknown) => {
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
        set: (value: unknown) => {
          updateSetMock(value);
          return chain;
        },
        then: (resolve: (v: unknown) => void) => resolve(result),
      };
      return chain;
    };
    return { createChainMock, generateImageBufferMock, insertValuesMock, updateSetMock };
  },
);

vi.mock("@workspace/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn() },
  conversations: { id: {}, userId: {}, title: {}, createdAt: {}, mode: {} },
  messages: { conversationId: {}, createdAt: {}, id: {} },
}));

vi.mock("@workspace/integrations-openai-ai-server", () => ({
  openai: { chat: { completions: { create: vi.fn() } } },
}));

vi.mock("@workspace/integrations-openai-ai-server/image", () => ({
  generateImageBuffer: generateImageBufferMock,
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
  vi.clearAllMocks();
  generateImageBufferMock.mockResolvedValue(Buffer.from("PNGDATA"));
  vi.mocked(db.insert).mockImplementation(() => createChainMock(undefined) as never);
  vi.mocked(db.update).mockImplementation(() => createChainMock(undefined) as never);
  vi.mocked(db.select).mockImplementation(
    () => createChainMock([{ id: 1, title: "New Chat", mode: "artist" }]) as never,
  );
});

function generate(body: unknown) {
  return server.request("POST", "/api/openai/generate-image", {
    headers: {
      "content-type": "application/json",
      cookie: `lumina_session=${createSessionToken(1)}`,
    },
    body: JSON.stringify(body),
  });
}

describe("POST /openai/generate-image", () => {
  it("generates without persisting when no conversationId is given", async () => {
    const res = await generate({ prompt: "a red fox" });

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      b64_json: Buffer.from("PNGDATA").toString("base64"),
    });
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("persists the prompt and image for an owned conversation", async () => {
    const res = await generate({ prompt: "a red fox", conversationId: 1 });

    expect(res.status).toBe(200);
    const b64 = Buffer.from("PNGDATA").toString("base64");
    expect(insertValuesMock).toHaveBeenCalledWith({ conversationId: 1, role: "user", content: "a red fox" });
    expect(insertValuesMock).toHaveBeenCalledWith({
      conversationId: 1,
      role: "assistant",
      content: `![Generated image](data:image/png;base64,${b64})`,
    });
    // Default title is replaced by the prompt.
    expect(updateSetMock).toHaveBeenCalledWith({ title: "a red fox" });
  });

  it("returns 404 and does not spend a provider call when the conversation is not owned", async () => {
    vi.mocked(db.select).mockImplementation(() => createChainMock([]) as never);

    const res = await generate({ prompt: "a red fox", conversationId: 99 });

    expect(res.status).toBe(404);
    expect(generateImageBufferMock).not.toHaveBeenCalled();
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("returns 502 and persists nothing when the provider fails", async () => {
    generateImageBufferMock.mockRejectedValue(new Error("image provider down"));

    const res = await generate({ prompt: "a red fox", conversationId: 1 });

    expect(res.status).toBe(502);
    expect(JSON.parse(res.body)).toEqual({ error: "image provider down" });
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("replaces an existing image message in place when replaceMessageId is given", async () => {
    vi.mocked(db.select)
      .mockImplementationOnce(
        () => createChainMock([{ id: 1, title: "New Chat", mode: "artist" }]) as never,
      )
      .mockImplementationOnce(
        () => createChainMock([{ id: 42, conversationId: 1, role: "assistant" }]) as never,
      );

    const res = await generate({ prompt: "a red fox", conversationId: 1, replaceMessageId: 42 });

    expect(res.status).toBe(200);
    const b64 = Buffer.from("PNGDATA").toString("base64");
    expect(updateSetMock).toHaveBeenCalledWith({
      content: `![Generated image](data:image/png;base64,${b64})`,
    });
    // Regenerate must not append a new prompt/message pair.
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("returns 404 and does not spend a provider call when replaceMessageId is not in the conversation", async () => {
    vi.mocked(db.select)
      .mockImplementationOnce(
        () => createChainMock([{ id: 1, title: "New Chat", mode: "artist" }]) as never,
      )
      .mockImplementationOnce(() => createChainMock([]) as never);

    const res = await generate({ prompt: "a red fox", conversationId: 1, replaceMessageId: 999 });

    expect(res.status).toBe(404);
    expect(generateImageBufferMock).not.toHaveBeenCalled();
    expect(updateSetMock).not.toHaveBeenCalled();
  });

  it("rejects replaceMessageId without a conversationId", async () => {
    const res = await generate({ prompt: "a red fox", replaceMessageId: 42 });

    expect(res.status).toBe(400);
    expect(generateImageBufferMock).not.toHaveBeenCalled();
  });
});
