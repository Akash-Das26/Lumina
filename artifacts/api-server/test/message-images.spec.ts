// @vitest-environment node
// Covers GET /openai/images/:id (Audit 3 F-03 / BUG-008): the endpoint that
// serves generated-image bytes that used to be embedded as base64 data URIs in
// message text. It must be owner-scoped and answer with the detected media
// type, and it accepts an optional `.ext` suffix on the id.
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
      innerJoin: () => chain,
      where: () => chain,
      then: (resolve: (v: unknown) => void) => resolve(result),
    };
    return chain;
  };
  return { createChainMock };
});

vi.mock("@workspace/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
  conversations: { id: {}, userId: {} },
  messages: { id: {}, conversationId: {} },
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

beforeEach(() => {
  vi.clearAllMocks();
});

const cookie = () => `lumina_session=${createSessionToken(1)}`;

function get(path: string, headers: Record<string, string> = {}) {
  return server.request("GET", path, { headers });
}

const IMAGE_BYTES = "WEBPDATA";
const IMAGE_ROW = { mediaType: "image/webp", data: Buffer.from(IMAGE_BYTES).toString("base64") };

describe("GET /openai/images/:id (Audit 3 F-03)", () => {
  it("serves the stored bytes with the detected media type", async () => {
    vi.mocked(db.select).mockImplementation(() => createChainMock([IMAGE_ROW]) as never);

    const res = await get("/api/openai/images/5", { cookie: cookie() });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("image/webp");
    expect(res.headers["cache-control"]).toContain("private");
    expect(res.body).toBe(IMAGE_BYTES);
  });

  it("accepts the id with a `.ext` suffix used by the stored reference", async () => {
    vi.mocked(db.select).mockImplementation(() => createChainMock([IMAGE_ROW]) as never);

    const res = await get("/api/openai/images/5.webp", { cookie: cookie() });

    expect(res.status).toBe(200);
    expect(res.body).toBe(IMAGE_BYTES);
  });

  it("404s (indistinguishably) when the image is not the caller's", async () => {
    vi.mocked(db.select).mockImplementation(() => createChainMock([]) as never);

    const res = await get("/api/openai/images/5", { cookie: cookie() });

    expect(res.status).toBe(404);
    expect(JSON.parse(res.body)).toEqual({ error: "Image not found" });
  });

  it("404s a non-numeric id without touching the database", async () => {
    const res = await get("/api/openai/images/abc", { cookie: cookie() });

    expect(res.status).toBe(404);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    const res = await get("/api/openai/images/5");
    expect(res.status).toBe(401);
  });
});
