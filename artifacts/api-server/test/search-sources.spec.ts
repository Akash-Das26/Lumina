// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/test";
process.env.OPENAI_API_KEY ??= "test-key";
process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??= "http://127.0.0.1:9";
process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef";

vi.mock("@workspace/db", () => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
  users: { id: {}, email: {}, name: {}, passwordHash: {} },
  conversations: { id: {}, userId: {}, title: {}, mode: {}, createdAt: {} },
  messages: { conversationId: {}, createdAt: {}, id: {} },
}));

vi.resetModules();

const { startTestServer } = await import("./helpers/server");
const { default: app } = await import("../src/app");
const { createSessionToken } = await import("../src/lib/session");

type TestServer = Awaited<ReturnType<typeof startTestServer>>;
let server: TestServer;

beforeAll(async () => {
  server = await startTestServer(app);
});
afterAll(async () => {
  await server.close();
  vi.unstubAllGlobals();
});

const jsonResponse = (data: unknown) => ({ ok: true, json: async () => data });

const wikipediaPayload = (titles: string[]) => [
  "query",
  titles,
  titles.map((t) => `Description of ${t}.`),
  titles.map((t) => `https://en.wikipedia.org/wiki/${t.replace(/ /g, "_")}`),
];

function searchReq(server: TestServer, q: string) {
  return server.request("GET", `/api/openai/search?q=${encodeURIComponent(q)}`, {
    headers: { cookie: `lumina_session=${createSessionToken(1)}` },
  });
}

describe("GET /openai/search (Audit 2 F-02)", () => {
  it("fetches both sources and merges their results", async () => {
    const fetchMock = vi.fn((url: string | URL) => {
      const target = String(url);
      if (target.includes("wikipedia.org")) {
        return Promise.resolve(jsonResponse(wikipediaPayload(["Ada Lovelace"])));
      }
      if (target.includes("duckduckgo.com")) {
        return Promise.resolve(
          jsonResponse({
            Heading: "Ada Lovelace",
            AbstractText: "Augusta Ada King, Countess of Lovelace.",
            AbstractURL: "https://en.wikipedia.org/wiki/Ada_Lovelace",
            RelatedTopics: [],
          }),
        );
      }
      return Promise.reject(new Error(`unexpected fetch ${target}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await searchReq(server, "Ada Lovelace");
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as {
      query: string;
      sources: Array<{ title: string; url: string; domain: string }>;
    };
    expect(body.query).toBe("Ada Lovelace");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // DuckDuckGo's abstract is prepended, Wikipedia entries follow.
    expect(body.sources[0]?.domain).toBe("en.wikipedia.org");
    expect(body.sources[0]?.title).toBe("Ada Lovelace");
    expect(body.sources.some((s) => s.title === "Ada Lovelace" && s.url.includes("wiki/Ada_Lovelace"))).toBe(true);
    expect(body.sources.some((s) => s.title === "Ada Lovelace" && s.snippet.startsWith("Description of"))).toBe(true);
  });

  it("caps merged results at 6 sources", async () => {
    const fetchMock = vi.fn((url: string | URL) => {
      const target = String(url);
      if (target.includes("wikipedia.org")) {
        return Promise.resolve(jsonResponse(wikipediaPayload(["A", "B", "C", "D", "E"])));
      }
      return Promise.resolve(
        jsonResponse({
          Heading: "Q",
          AbstractText: "Abstract.",
          AbstractURL: "https://example.com/q",
          RelatedTopics: [
            { Text: "Topic 1", FirstURL: "https://example.com/1" },
            { Text: "Topic 2", FirstURL: "https://example.com/2" },
            { Text: "Topic 3", FirstURL: "https://example.com/3" },
          ],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await searchReq(server, "anything at all");
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as { sources: unknown[] };
    expect(body.sources.length).toBe(6);
  });

  it("still returns Wikipedia results when DuckDuckGo fails", async () => {
    const fetchMock = vi.fn((url: string | URL) => {
      const target = String(url);
      if (target.includes("wikipedia.org")) {
        return Promise.resolve(jsonResponse(wikipediaPayload(["Grace Hopper"])));
      }
      return Promise.reject(new Error("duckduckgo down"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await searchReq(server, "Grace Hopper");
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as { sources: Array<{ title: string }> };
    expect(body.sources.map((s) => s.title)).toContain("Grace Hopper");
  });

  it("still returns DuckDuckGo results when Wikipedia fails", async () => {
    const fetchMock = vi.fn((url: string | URL) => {
      const target = String(url);
      if (target.includes("wikipedia.org")) {
        return Promise.reject(new Error("wikipedia down"));
      }
      return Promise.resolve(
        jsonResponse({
          Heading: "Compilers",
          AbstractText: "A compiler translates code.",
          AbstractURL: "https://en.wikipedia.org/wiki/Compiler",
          RelatedTopics: [],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await searchReq(server, "compilers");
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body) as { sources: Array<{ title: string }> };
    expect(body.sources.map((s) => s.title)).toContain("Compilers");
  });

  it("returns 400 for a too-short query without fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await searchReq(server, "a");
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
