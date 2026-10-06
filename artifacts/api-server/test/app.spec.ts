// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "http://127.0.0.1:9";
process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef";

const { startTestServer } = await import("./helpers/server");

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
  messageImages: { id: {}, messageId: {}, mediaType: {}, data: {} },
}));

const { default: app } = await import("../src/app");
const { createSessionToken } = await import("../src/lib/session");

type TestServer = Awaited<ReturnType<typeof startTestServer>>;
let server: TestServer;

beforeAll(async () => {
  server = await startTestServer(app);
});

afterAll(async () => {
  await server.close();
});

describe("api-server smoke", () => {
  it("GET /api/healthz returns ok", async () => {
    const res = await server.request("GET", "/api/healthz");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ status: "ok" });
  });

  it("rejects oversized JSON bodies with 413", async () => {
    const big = JSON.stringify({ blob: "x".repeat(2 * 1024 * 1024) });
    const res = await server.request("POST", "/api/openai/conversations", {
      headers: { "content-type": "application/json" },
      body: big,
    });
    expect(res.status).toBe(413);
  });

  it("blocks unlisted cross-origin requests (no CORS headers)", async () => {
    const res = await server.request("GET", "/api/healthz", {
      headers: { origin: "https://evil.example" },
    });
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows requests without an Origin header (same-origin/curl)", async () => {
    const res = await server.request("GET", "/api/healthz");
    expect(res.status).toBe(200);
  });

  it("POST /api/openai/conversations returns 400 for invalid body", async () => {
    const res = await server.request("POST", "/api/openai/conversations", {
      headers: {
        "content-type": "application/json",
        cookie: `lumina_session=${createSessionToken(1)}`,
      },
      body: JSON.stringify({ title: 123 }),
      });
    expect(res.status).toBe(400);
  });

  it("requires authentication for conversation routes", async () => {
    const res = await server.request("GET", "/api/openai/conversations");
    expect(res.status).toBe(401);
  });

  it("sends security headers via helmet", async () => {
    const res = await server.request("GET", "/api/healthz");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});
