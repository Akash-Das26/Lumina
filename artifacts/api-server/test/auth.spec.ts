// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "http://127.0.0.1:9";
process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
process.env.AUTH_AUTO_PROVISION ??= "0";

const { createChainMock } = vi.hoisted(() => {
  // Minimal Drizzle-like chain: every builder resolves to the configured result.
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
  },
  users: { id: {}, email: {} },
  conversations: { id: {}, userId: {}, createdAt: {}, title: {} },
  messages: { conversationId: {}, createdAt: {}, id: {} },
}));

const { startTestServer } = await import("./helpers/server");

const { default: app } = await import("../src/app");
const { db } = await import("@workspace/db");
const { hashPassword, verifyPassword } = await import("../src/lib/password");

type TestServer = Awaited<ReturnType<typeof startTestServer>>;
let server: TestServer;

beforeAll(async () => {
  server = await startTestServer(app);
});

afterAll(async () => {
  await server.close();
});

beforeEach(() => {
  vi.mocked(db.select).mockImplementation(
    () => createChainMock([{ id: 1, email: "user@test.dev", name: "Test", passwordHash: "scrypt:ab:cd" }]) as never,
  );
  vi.mocked(db.insert).mockImplementation(
    () => createChainMock([{ id: 2, email: "new@test.dev", name: "New", passwordHash: "scrypt:ef:01" }]) as never,
  );
  vi.mocked(db.update).mockImplementation(() => createChainMock([]) as never);
});

function post(server: TestServer, path: string, body: unknown, cookie?: string) {
  return server.request("POST", path, {
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("auth routes", () => {
  it("rejects registration with a too-short password (400)", async () => {
    const res = await post(server, "/api/auth/register", {
      name: "A",
      email: "a@test.dev",
      password: "short",
    });
    expect(res.status).toBe(400);
  });

  it("returns 409 when the email is already registered", async () => {
    const res = await post(server, "/api/auth/register", {
      name: "Test",
      email: "user@test.dev",
      password: "longenough1",
    });
    expect(res.status).toBe(409);
  });

  it("registers successfully and sets a session cookie", async () => {
    // No existing user with that email: the select in /register finds nothing.
    vi.mocked(db.select).mockImplementationOnce(() => createChainMock([]) as never);
    const res = await post(server, "/api/auth/register", {
      name: "New",
      email: "new@test.dev",
      password: "longenough1",
    });
    expect(res.status).toBe(201);
    expect(JSON.parse(res.body)).toMatchObject({ email: "new@test.dev" });
    expect(res.headers["set-cookie"]?.[0]).toContain("lumina_session=");
    expect(res.headers["set-cookie"]?.[0]).toContain("HttpOnly");
  });

  it("returns 401 for wrong credentials on login", async () => {
    const res = await post(server, "/api/auth/login", {
      email: "user@test.dev",
      password: "wrongpassword",
    });
    expect(res.status).toBe(401);
  });

  it("clears the cookie on logout", async () => {
    const res = await post(server, "/api/auth/logout", {});
    expect(res.status).toBe(204);
    expect(res.headers["set-cookie"]?.[0]).toContain("Max-Age=0");
  });

  it("rejects conversation routes without a session (401)", async () => {
    const res = await server.request("GET", "/api/openai/conversations");
    expect(res.status).toBe(401);
  });

  it("accepts a signed session cookie for conversation routes", async () => {
    const { createSessionToken } = await import("../src/lib/session");
    const res = await server.request("GET", "/api/openai/conversations", {
      headers: { cookie: `lumina_session=${createSessionToken(1)}` },
    });
    expect(res.status).toBe(200);
  });
});

describe("password hashing", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("wrong", stored)).toBe(false);
    expect(await verifyPassword("x", "not-a-valid-hash")).toBe(false);
  });
});
