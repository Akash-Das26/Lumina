// @vitest-environment node
// Covers POST /openai/generate-image: optional conversation persistence,
// ownership checks, and provider-failure handling.
//
// Audit 3 F-03 / BUG-008 changed persistence: image bytes now live in the
// message_images table and the assistant message content holds only a short
// reference (`![Generated image](/api/openai/images/<id>.<ext>)`) instead of a
// multi-megabyte base64 data URI.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "http://127.0.0.1:9";
process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef";

const { createChainMock, generateImageBufferMock, insertValuesMock, updateSetMock, deleteWhereMock, insertIdRef } =
  vi.hoisted(() => {
    const generateImageBufferMock = vi.fn();
    const insertValuesMock = vi.fn();
    const updateSetMock = vi.fn();
    const deleteWhereMock = vi.fn();
    // Ids handed to successive `.returning()` calls so message + image rows
    // get deterministic ids across the multi-insert persistence path.
    const insertIdRef = { value: 0 };
    // Minimal Drizzle-like chain whose builders resolve to the given value.
    const createChainMock = (result: unknown) => {
      const chain = {
        select: () => chain,
        from: () => chain,
        where: (condition?: unknown) => {
          deleteWhereMock(condition);
          return chain;
        },
        innerJoin: () => chain,
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
        returning: () => chain,
        then: (resolve: (v: unknown) => void) => resolve(result),
      };
      return chain;
    };
    return { createChainMock, generateImageBufferMock, insertValuesMock, updateSetMock, deleteWhereMock, insertIdRef };
  });

vi.mock("@workspace/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
  conversations: { id: {}, userId: {}, title: {}, createdAt: {}, mode: {} },
  messages: { conversationId: {}, createdAt: {}, id: {} },
  messageImages: { id: {}, messageId: {}, mediaType: {}, data: {} },
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
  insertIdRef.value = 0;
  generateImageBufferMock.mockResolvedValue(Buffer.from("PNGDATA"));
  // Each insert `.returning()` yields a fresh id (assistant message, then the
  // image row, in the persistence path).
  vi.mocked(db.insert).mockImplementation(
    () => createChainMock([{ id: ++insertIdRef.value }]) as never,
  );
  vi.mocked(db.update).mockImplementation(() => createChainMock(undefined) as never);
  vi.mocked(db.delete).mockImplementation(() => createChainMock(undefined) as never);
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

/** Every `content` passed to db.insert().values() — i.e. message text. */
function insertedMessageContents(): string[] {
  return insertValuesMock.mock.calls
    .map(([value]) => value as { content?: unknown })
    .filter((v) => typeof v.content === "string")
    .map((v) => v.content as string);
}

describe("POST /openai/generate-image", () => {
  it("generates without persisting when no conversationId is given", async () => {
    const res = await generate({ prompt: "a red fox" });

    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toEqual({
      b64_json: Buffer.from("PNGDATA").toString("base64"),
      media_type: "image/png",
    });
    expect(insertValuesMock).not.toHaveBeenCalled();
  });

  it("stores the image bytes in message_images and a short reference in the message content", async () => {
    const res = await generate({ prompt: "a red fox", conversationId: 1 });

    expect(res.status).toBe(200);
    const b64 = Buffer.from("PNGDATA").toString("base64");
    expect(insertValuesMock).toHaveBeenCalledWith({ conversationId: 1, role: "user", content: "a red fox" });
    // The assistant row is created empty, then the image is attached to it.
    expect(insertValuesMock).toHaveBeenCalledWith({ conversationId: 1, role: "assistant", content: "" });
    expect(insertValuesMock).toHaveBeenCalledWith({ messageId: 2, mediaType: "image/png", data: b64 });
    // Content points at the image endpoint rather than embedding the payload.
    expect(updateSetMock).toHaveBeenCalledWith({ content: "![Generated image](/api/openai/images/3.png)" });
    // Default title is replaced by the prompt.
    expect(updateSetMock).toHaveBeenCalledWith({ title: "a red fox" });
    // No message text may carry the base64 payload (it lives in message_images).
    expect(insertedMessageContents().some((c) => c.includes("data:image") || c.includes(b64))).toBe(false);
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

  it("labels WebP provider bytes correctly in the body and the content reference (F-04)", async () => {
    // "RIFF....WEBP" — a real WebP header, which a hardcoded PNG label would misreport.
    const webp = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from("WEBPVP8 "),
    ]);
    generateImageBufferMock.mockResolvedValue(webp);

    const res = await generate({ prompt: "a red fox", conversationId: 1 });

    expect(res.status).toBe(200);
    const b64 = webp.toString("base64");
    expect(JSON.parse(res.body)).toEqual({ b64_json: b64, media_type: "image/webp" });
    expect(insertValuesMock).toHaveBeenCalledWith({ messageId: 2, mediaType: "image/webp", data: b64 });
    // The reference carries the real format as a `.webp` suffix so the
    // download filename stays honest.
    expect(updateSetMock).toHaveBeenCalledWith({ content: "![Generated image](/api/openai/images/3.webp)" });
    expect(insertedMessageContents().some((c) => c.includes("data:image"))).toBe(false);
  });

  it("replaces an existing image in place when replaceMessageId is given", async () => {
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
    // The old blob is dropped before the new one is attached.
    expect(db.delete).toHaveBeenCalledTimes(1);
    expect(insertValuesMock).toHaveBeenCalledWith({ messageId: 42, mediaType: "image/png", data: b64 });
    expect(updateSetMock).toHaveBeenCalledWith({
      content: expect.stringMatching(/^!\[Generated image\]\(\/api\/openai\/images\/\d+\.png\)$/),
    });
    // Regenerate must not append a new prompt/message pair.
    const roles = insertValuesMock.mock.calls
      .map(([value]) => (value as { role?: string }).role)
      .filter(Boolean);
    expect(roles).toEqual([]);
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
