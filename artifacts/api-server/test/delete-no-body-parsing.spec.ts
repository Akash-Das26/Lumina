// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "http://127.0.0.1:9";
process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef";

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

vi.resetModules();

const { startTestServer } = await import("./helpers/server");
const { default: app } = await import("../src/app");
const { db } = await import("@workspace/db");
const { createSessionToken } = await import("../src/lib/session");

type TestServer = Awaited<ReturnType<typeof startTestServer>>;
let server: TestServer;

beforeAll(async () => {
  server = await startTestServer(app);
});
afterAll(async () => {
  await server.close();
});

function deleteReq(server: TestServer, path: string, body?: unknown) {
  return server.request("DELETE", path, {
    headers: { "content-type": "application/json", cookie: `lumina_session=${createSessionToken(1)}` },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

describe("DELETE /openai/conversations/:id", () => {
  it("ignores a request body and takes only the path param", async () => {
    vi.mocked(db.delete).mockImplementation(() =>
    createChainMock([{ id: 1, title: "T", userId: 1 }]) as never
  );

    const res = await deleteReq(server, "/api/openai/conversations/1", {
      malicious: "ignored",
      extra: "field",
    });

    expect(res.status).toBe(204);
  });

  it("returns 400 for a non-numeric id", async () => {
    const res = await deleteReq(server, "/api/openai/conversations/abc");
    expect(res.status).toBe(400);
  });

  it("matches no route for a missing id (Express 5 :id never matches an empty segment)", async () => {
    const res = await deleteReq(server, "/api/openai/conversations/");
    expect(res.status).toBe(404);
  });

  it("returns 204 for a valid owned conversation", async () => {
    vi.mocked(db.delete).mockImplementation(() =>
    createChainMock([{ id: 7, title: "T", userId: 1 }]) as never
  );
    const res = await deleteReq(server, "/api/openai/conversations/7");
    expect(res.status).toBe(204);
  });  it("returns 404 for a conversation owned by another user", async () => {
    vi.mocked(db.delete).mockImplementation(() =>
    createChainMock([]) as never
    );
    const res = await deleteReq(server, "/api/openai/conversations/99");
    expect(res.status).toBe(404);
  });
});
