// @vitest-environment node
// BUG-014: provider failures are classified into four classes, answered with
// fixed client copy, and logged with the real provider details — redacted.
import { describe, expect, it, vi } from "vitest";
import {
  PROVIDER_ERROR_MESSAGES,
  logProviderError,
  mapProviderError,
} from "../src/lib/provider-errors";
import { logger } from "../src/lib/logger";
import { redactSecrets } from "../src/lib/safe-error";

/** Mimics the OpenAI SDK's APIError shape. */
function apiError(status: number, message: string, code?: string): Error {
  return Object.assign(new Error(message), { status, code: code ?? "provider_error" });
}

describe("mapProviderError", () => {
  it.each([401, 403])("maps a provider %i to 502 'not configured correctly'", (status) => {
    const mapped = mapProviderError(apiError(status, "Incorrect API key provided"));

    expect(mapped.kind).toBe("auth");
    expect(mapped.status).toBe(502);
    expect(mapped.message).toBe(
      "The AI service is not configured correctly. Please contact the administrator.",
    );
    expect(mapped.providerStatus).toBe(status);
  });

  it("maps a provider 429 to 503 'busy or over quota'", () => {
    const mapped = mapProviderError(apiError(429, "Rate limit reached for gpt-oss-120b"));

    expect(mapped.kind).toBe("rate-limit");
    expect(mapped.status).toBe(503);
    expect(mapped.message).toBe("The AI service is busy or over quota. Please try again later.");
  });

  it("maps timeouts and connection failures to 504", () => {
    const networkError = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:9"), {
      code: "ECONNREFUSED",
    });
    const timeout = Object.assign(new Error("Request timed out."), {
      name: "APIConnectionTimeoutError",
    });
    const fetchFailed = new TypeError("fetch failed");
    const requestTimeout = apiError(408, "Request Timeout");

    for (const error of [networkError, timeout, fetchFailed, requestTimeout]) {
      const mapped = mapProviderError(error);
      expect(mapped.kind).toBe("unavailable");
      expect(mapped.status).toBe(504);
      expect(mapped.message).toBe("The AI service did not respond. Please try again.");
    }
  });

  it.each([500, 501, 502, 503, 505, 599])(
    "maps a provider %i to 502 'temporarily unavailable'",
    (status) => {
      const mapped = mapProviderError(
        apiError(status, "upstream provider failed: internal detail"),
      );

      expect(mapped.kind).toBe("upstream");
      expect(mapped.status).toBe(502);
      expect(mapped.message).toBe("The AI service is temporarily unavailable. Please try again.");
      // The real status stays available for the log.
      expect(mapped.providerStatus).toBe(status);
      expect(mapped.message).not.toContain("internal detail");
    },
  );

  it("keeps provider 504/408 in the timeout class, not the generic 5xx one", () => {
    // Both are timeouts, and "did not respond" describes them better.
    for (const status of [504, 408]) {
      const mapped = mapProviderError(apiError(status, "gateway timeout"));
      expect(mapped.kind).toBe("unavailable");
      expect(mapped.status).toBe(504);
      expect(mapped.message).toBe("The AI service did not respond. Please try again.");
    }
  });

  it("maps anything else to a generic 500", () => {
    for (const error of [
      new Error("boom"),
      apiError(400, "Bad request"),
      apiError(404, "No such model"),
      "not an error object",
    ]) {
      const mapped = mapProviderError(error);
      expect(mapped.kind).toBe("unknown");
      expect(mapped.status).toBe(500);
      expect(mapped.message).toBe("Internal server error");
    }
  });

  it("logs a provider 5xx with its real status and redacted message", () => {
    const errorLog = vi.spyOn(logger, "error").mockImplementation(() => undefined as never);
    const key = "sk-proj-5xxsecretvalue123456";

    const mapped = logProviderError(
      apiError(503, `upstream unavailable while key ${key} was in use`, "upstream_error"),
      { reqId: "req-503", route: "chat" },
    );

    expect(mapped.status).toBe(502);
    expect(mapped.message).toBe("The AI service is temporarily unavailable. Please try again.");
    const [record] = errorLog.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(record).toMatchObject({ providerStatus: 503, providerCode: "upstream_error", reqId: "req-503" });
    expect(String(record.providerMessage)).toContain("upstream unavailable");
    expect(JSON.stringify(record)).not.toContain(key);
    errorLog.mockRestore();
  });

  it("looks through wrapper errors for the provider status", () => {
    const wrapped = new Error("provider call failed", {
      cause: apiError(401, "Incorrect API key provided"),
    });

    expect(mapProviderError(wrapped).status).toBe(502);
  });

  it("never returns provider text in the client message", () => {
    const providerText =
      "401 Incorrect API key provided: sk-proj-SUPERSECRET123. You can find your API key at https://platform.openai.com/account/api-keys";

    for (const error of [
      apiError(401, providerText),
      apiError(429, providerText),
      apiError(503, providerText),
      Object.assign(new Error(providerText), { code: "ETIMEDOUT" }),
      new Error(providerText),
    ]) {
      const mapped = mapProviderError(error);
      expect(mapped.message).not.toContain("Incorrect API key");
      expect(mapped.message).not.toContain("sk-proj");
      expect(mapped.message).not.toContain("platform.openai.com");
      expect(Object.values(PROVIDER_ERROR_MESSAGES)).toContain(mapped.message);
    }
  });
});

describe("logProviderError", () => {
  it("logs the provider status, code, request id and redacted message", () => {
    const errorLog = vi.spyOn(logger, "error").mockImplementation(() => undefined as never);
    const key = "sk-proj-9f8e7d6c5b4a3210zyxw";
    const providerMessage = `401 Incorrect API key provided: ${key}. You can find your API key at https://platform.openai.com/account/api-keys`;
    const error = Object.assign(new Error(providerMessage), {
      status: 401,
      code: "invalid_api_key",
    });

    const mapped = logProviderError(error, { reqId: "req-42", route: "chat", mode: "search" });

    expect(mapped.status).toBe(502);
    expect(errorLog).toHaveBeenCalledTimes(1);
    const [record] = errorLog.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(record).toMatchObject({
      reqId: "req-42",
      route: "chat",
      mode: "search",
      kind: "auth",
      providerStatus: 401,
      providerCode: "invalid_api_key",
    });
    // The operator sees what the provider said — with the key material removed.
    expect(String(record.providerMessage)).toContain("Incorrect API key provided");
    expect(String(record.providerMessage)).not.toContain(key);
    expect(String(record.providerMessage)).not.toContain("9f8e7d6c");
    expect(JSON.stringify(record)).not.toContain(key);
    expect(JSON.stringify(record)).not.toContain(key.slice(0, 12));
    errorLog.mockRestore();
  });
});

describe("redactSecrets (BUG-014 additions)", () => {
  it("removes provider keys, masked echoes and configured secrets", () => {
    // Not `sk-`-shaped on purpose: only the configured-value lookup can catch it.
    vi.stubEnv("OPENAI_API_KEY", "configuredsecret-abc123def456ghi789");
    try {
      expect(redactSecrets("key sk-proj-abcdefghijklmnop used")).toBe(
        "key <redacted-key> used",
      );
      // OpenAI's masked echo — this is exactly what the reported toast showed.
      expect(redactSecrets("Incorrect API key provided: replace-*********-key.")).toBe(
        "Incorrect API key provided: <redacted-key>.",
      );
      expect(redactSecrets("configured configuredsecret-abc123def456ghi789 here")).toBe(
        "configured <redacted-key> here",
      );
      expect(redactSecrets("see https://platform.openai.com/account/api-keys")).toBe(
        "see <redacted-url>",
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
