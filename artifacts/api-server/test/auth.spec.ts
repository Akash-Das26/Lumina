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
const { logger } = await import("../src/lib/logger");

/**
 * A Drizzle-like chain whose await rejects, for exercising the 500 path
 * (BUG-013). Throwing synchronously would test something else entirely.
 */
function failingChain(error: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "from", "where", "orderBy", "limit", "values", "set", "returning"]) {
    chain[method] = () => chain;
  }
  chain.then = (_resolve: unknown, reject: (reason: unknown) => void) => reject(error);
  return chain;
}

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

  it("answers validation failures with clean field errors, never the raw Zod issues (BUG-012)", async () => {
    const res = await post(server, "/api/auth/register", {
      name: "  ",
      email: "bbjhbvb@ewfw",
      password: "123456",
    });

    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({
      error: "Validation failed",
      fieldErrors: {
        name: ["Please enter your name"],
        email: ["Please enter a valid email address (e.g. name@example.com)"],
        password: ["Password must be at least 8 characters"],
      },
      formErrors: [],
    });
    // The old `parsed.error.message` payload: codes, formats and regex patterns.
    expect(res.body).not.toMatch(/invalid_format|too_small|pattern|"code"/);
  });

  it("answers invalid login payloads with the same structured shape", async () => {
    const res = await post(server, "/api/auth/login", { email: "nope", password: "short" });

    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({
      error: "Validation failed",
      fieldErrors: {
        email: ["Please enter a valid email address (e.g. name@example.com)"],
        password: ["Password must be at least 8 characters"],
      },
      formErrors: [],
    });
  });

  it("returns 409 with a clear message when the email is already registered", async () => {
    const res = await post(server, "/api/auth/register", {
      name: "Test",
      email: "user@test.dev",
      password: "longenough1",
    });
    expect(res.status).toBe(409);
    expect(JSON.parse(res.body)).toEqual({ error: "An account with this email already exists" });
  });

  it("turns a unique-constraint race into 409 rather than a 500 (BUG-013)", async () => {
    // No existing user is found, so the insert runs — and loses the race.
    vi.mocked(db.select).mockImplementationOnce(() => createChainMock([]) as never);
    const duplicate = Object.assign(
      new Error('duplicate key value violates unique constraint "users_email_unique"'),
      { code: "23505" },
    );
    vi.mocked(db.insert).mockImplementation(() => failingChain(duplicate) as never);

    const res = await post(server, "/api/auth/register", {
      name: "New",
      email: "new@test.dev",
      password: "longenough1",
    });

    expect(res.status).toBe(409);
    expect(JSON.parse(res.body)).toEqual({ error: "An account with this email already exists" });
  });

  it("answers an unexpected database failure with a generic JSON 500 and logs the real error (BUG-013)", async () => {
    const failure = new Error(
      'Failed query: select "id", "email", "name", "password_hash" from "users"\n' +
        "connection: postgresql://lumina_user:hunter2@localhost:5432/lumina",
    );
    vi.mocked(db.select).mockImplementation(() => failingChain(failure) as never);
    const errorLog = vi.spyOn(logger, "error").mockImplementation(() => undefined as never);

    const res = await post(server, "/api/auth/register", {
      name: "New",
      email: "fresh@test.dev",
      password: "longenough1",
    });

    expect(res.status).toBe(500);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(JSON.parse(res.body)).toEqual({ error: "Internal server error" });
    // No stack, SQL, column names, connection string or HTML error page.
    expect(res.body).not.toMatch(/<html|<pre|password_hash|postgresql:|Failed query|at \\w|\.ts:/);

    // The real cause reaches the log, with a request id, and without secrets.
    // (Error.message/stack are non-enumerable, so read them directly rather
    // than through JSON.stringify.)
    expect(errorLog).toHaveBeenCalled();
    const [fields] = errorLog.mock.calls.at(-1) as unknown as [Record<string, unknown>, string];
    expect(fields.reqId).toBeTruthy();
    const logged = fields.err as Error;
    const loggedText = `${logged.message}\n${logged.stack ?? ""}`;
    expect(logged.message).toContain("Failed query");
    expect(loggedText).toContain("<redacted-url>");
    expect(loggedText).not.toContain("hunter2");
    expect(loggedText).not.toContain("lumina_user:hunter2");

    errorLog.mockRestore();
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
