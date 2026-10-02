// @vitest-environment node
// Integration tests against a REAL PostgreSQL database. Skipped unless
// E2E_DATABASE_URL is set, e.g.:
//   E2E_DATABASE_URL=postgresql://postgres@127.0.0.1:5433/lumina pnpm test
// Regression-coverage for BUG-004: the conversations list is newest-first, so
// a cursor must fetch SMALLER ids (lt); gt() repeated the first page forever.
import { afterAll, beforeAll, describe, expect, it } from "vitest";

if (process.env.E2E_DATABASE_URL) {
  // Explicit integration target always wins, so a developer's own
  // DATABASE_URL can never be polluted by these tests.
  process.env.DATABASE_URL = process.env.E2E_DATABASE_URL;
} else {
  // Dummy value: pg pools connect lazily, and these tests are skipped below
  // when no integration database was provided.
  process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
}
process.env.OPENAI_API_KEY ??= "test-key";
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "http://127.0.0.1:9";
process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef";

const { startTestServer } = await import("./helpers/server");
const { default: app } = await import("../src/app");

const d = new Date().getTime();
const EMAIL = `pagi-${d}@test.dev`;
const CONV_COUNT = 5;

let server: Awaited<ReturnType<typeof startTestServer>>;
let cookie = "";

beforeAll(async () => {
  server = await startTestServer(app);
  const res = await server.request("POST", "/api/auth/register", {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "Pagi", email: EMAIL, password: "supersecret1" }),
  });
  expect(res.status).toBe(201);
  const setCookie = res.headers["set-cookie"]?.[0] ?? "";
  cookie = setCookie.split(";")[0] ?? "";
  expect(cookie).toContain("lumina_session=");

  for (let i = 1; i <= CONV_COUNT; i++) {
    const created = await server.request("POST", "/api/openai/conversations", {
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ title: `Pagi conv ${i}` }),
    });
    expect(created.status).toBe(201);
  }
});

afterAll(async () => {
  await server.close();
});

function ids(body: string): number[] {
  return [...body.matchAll(/"id":(\d+)/g)].map((m) => Number(m[1]));
}

describe.skipIf(!process.env.E2E_DATABASE_URL)("pagination against a real database", () => {
  it("walks pages newest-first without repeating rows (BUG-004)", async () => {
    const page1 = await server.request("GET", "/api/openai/conversations?limit=3", {
      headers: { cookie },
    });
    expect(page1.status).toBe(200);
    const first = ids(page1.body);
    expect(first).toHaveLength(3);
    // Newest first: strictly descending ids.
    expect([...first].sort((a, b) => b - a)).toEqual(first);

    const page2 = await server.request(
      "GET",
      `/api/openai/conversations?limit=3&cursor=${first[first.length - 1]}`,
      { headers: { cookie } },
    );
    const second = ids(page2.body);
    expect(second.length).toBeGreaterThan(0);
    // Every id on page 2 is older than everything on page 1.
    expect(Math.max(...second)).toBeLessThan(Math.min(...first));

    const page3 = await server.request(
      "GET",
      `/api/openai/conversations?limit=3&cursor=${second[second.length - 1]}`,
      { headers: { cookie } },
    );
    const third = ids(page3.body);
    expect(third.length).toBeLessThanOrEqual(2);
    // No id ever repeats across pages.
    const seen = new Set([...first, ...second, ...third]);
    expect(seen.size).toBe(first.length + second.length + third.length);
  });

  it("scopes listings to the owning user only", async () => {
    const otherEmail = `pagi-other-${d}@test.dev`;
    const reg = await server.request("POST", "/api/auth/register", {
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Other", email: otherEmail, password: "supersecret1" }),
    });
    const otherCookie = (reg.headers["set-cookie"]?.[0] ?? "").split(";")[0];

    const list = await server.request("GET", "/api/openai/conversations?limit=100", {
      headers: { cookie: otherCookie },
    });
    expect(list.status).toBe(200);
    expect(list.body).toBe("[]");
  });
});
