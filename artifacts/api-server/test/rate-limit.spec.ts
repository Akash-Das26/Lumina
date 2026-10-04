// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

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
const { hashPassword } = await import("../src/lib/password");

type TestServer = Awaited<ReturnType<typeof startTestServer>>;
let server: TestServer;

const PASSWORD = "correct horse battery staple";
let validHash: string;

beforeAll(async () => {
  validHash = await hashPassword(PASSWORD);
  server = await startTestServer(app);
});

afterAll(async () => {
  await server.close();
});

function post(path: string, body: unknown) {
  return server.request("POST", path, {
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockExistingUser(passwordHash: string) {
  vi.mocked(db.select).mockImplementation(
    () =>
      createChainMock([{ id: 1, email: "user@test.dev", name: "Test", passwordHash }]) as never,
  );
}

describe("auth rate limiting", () => {
  // Must run before the failing-login test: both share the login limiter's
  // per-IP counter, and this asserts that successes leave it at zero.
  it("does not count successful logins toward the login limit", async () => {
    mockExistingUser(validHash);
    for (let i = 0; i < 12; i++) {
      const res = await post("/api/auth/login", { email: "user@test.dev", password: PASSWORD });
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 after too many failed logins", async () => {
    mockExistingUser("scrypt:ab:cd");
    const statuses: number[] = [];
    let lastBody = "";
    for (let i = 0; i < 11; i++) {
      const res = await post("/api/auth/login", {
        email: "user@test.dev",
        password: "wrongpassword",
      });
      statuses.push(res.status);
      lastBody = res.body;
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(statuses[10]).toBe(429);
    expect(JSON.parse(lastBody)).toMatchObject({ error: expect.stringContaining("Too many") });
  });

  it("returns 429 after too many registrations", async () => {
    vi.mocked(db.select).mockImplementation(() => createChainMock([]) as never);
    vi.mocked(db.insert).mockImplementation(
      () =>
        createChainMock([
          { id: 2, email: "new@test.dev", name: "New", passwordHash: "scrypt:aa:bb" },
        ]) as never,
    );
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await post("/api/auth/register", {
        name: "New",
        email: `new${i}@test.dev`,
        password: "longenough1",
      });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(201));
    expect(statuses[10]).toBe(429);
  });
});
