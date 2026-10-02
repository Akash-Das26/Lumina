// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllGlobals();
});

/** Import a fresh customFetch module instance (module state is reset per test). */
async function loadCustomFetch() {
  const mod = await import("../src/custom-fetch");
  return mod;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("customFetch", () => {
  it("parses JSON responses", async () => {
    const { customFetch } = await loadCustomFetch();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ ok: true, value: 42 })),
    );

    const data = await customFetch<{ ok: boolean; value: number }>("/ping");
    expect(data).toEqual({ ok: true, value: 42 });
  });

  it("prepends the configured base URL to relative paths", async () => {
    const { customFetch, setBaseUrl } = await loadCustomFetch();
    setBaseUrl("http://api.test");
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await customFetch("/ping");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/ping",
      expect.anything(),
    );
  });

  it("attaches bearer token from the auth getter", async () => {
    const { customFetch, setAuthTokenGetter } = await loadCustomFetch();
    setAuthTokenGetter(() => "token-123");
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await customFetch("/ping");
    const [, init] = fetchMock.mock.calls[0] as [
      unknown,
      { headers: Headers },
    ];
    expect(init.headers.get("authorization")).toBe("Bearer token-123");
  });

  it("throws ApiError with parsed payload for HTTP errors", async () => {
    const { customFetch, ApiError } = await loadCustomFetch();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ error: "Conversation not found" }, 404),
      ),
    );

    const err = await customFetch("/missing").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    const apiError = err as InstanceType<typeof ApiError>;
    expect(apiError.status).toBe(404);
    expect((apiError.data as { error: string }).error).toBe(
      "Conversation not found",
    );
    expect(apiError.message).toContain("HTTP 404");
  });

  it("auto-infers text responses", async () => {
    const { customFetch } = await loadCustomFetch();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("plain text", {
            status: 200,
            headers: { "content-type": "text/plain" },
          }),
      ),
    );

    const data = await customFetch("/text");
    expect(data).toBe("plain text");
  });

  it("rejects GET requests that carry a body", async () => {
    const { customFetch } = await loadCustomFetch();
    await expect(
      customFetch("/nope", { method: "GET", body: "{}" }),
    ).rejects.toThrow(TypeError);
  });
});
