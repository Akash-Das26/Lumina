/**
 * BUG-014: one place where an upstream provider failure becomes a response.
 *
 * The provider's own error text used to be forwarded verbatim — the reported
 * symptom was a toast reading `401 Incorrect API key provided:
 * replace-*********-key. You can find your API key at
 * https://platform.openai.com/account/api-keys`. That leaks configuration
 * detail (and part of a key) to whoever is using the app, tells them nothing
 * they can act on, and reports the wrong status: the *caller's* request was
 * fine, the server's provider setup is not.
 *
 * Here every provider failure is classified into one of four classes, answered
 * with fixed client copy and the right status, and logged with the real
 * provider status, code and message (redacted) plus the request id, so the
 * operator can still see exactly what the provider said.
 */

import type { Response } from "express";
import { logger } from "./logger";
import { errorMessage, redactSecrets, toLoggableError } from "./safe-error";

export type ProviderErrorKind = "auth" | "rate-limit" | "unavailable" | "unknown";

/** Client copy per class — fixed strings, never provider text. */
export const PROVIDER_ERROR_MESSAGES: Record<ProviderErrorKind, string> = {
  auth: "The AI service is not configured correctly. Please contact the administrator.",
  "rate-limit": "The AI service is busy or over quota. Please try again later.",
  unavailable: "The AI service did not respond. Please try again.",
  unknown: "Internal server error",
};

/** The caller asked for something the server could not deliver: 5xx, not 4xx. */
const STATUS_BY_KIND: Record<ProviderErrorKind, number> = {
  auth: 502,
  "rate-limit": 503,
  unavailable: 504,
  unknown: 500,
};

/** Node/undici error codes that mean "the provider could not be reached". */
const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
]);

/** OpenAI-SDK error names for connection and timeout failures. */
const NETWORK_NAMES = new Set([
  "APIConnectionError",
  "APIConnectionTimeoutError",
  "TimeoutError",
  "AbortError",
  "FetchError",
]);

const NETWORK_MESSAGE =
  /\b(timed?\s?out|timeout|fetch failed|socket hang up|network|connection refused|other side closed|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN)\b/i;

/** Provider statuses that describe a slow or unreachable provider, not a rejection. */
const TIMEOUT_STATUSES = new Set([408, 504]);

function chain(error: unknown): unknown[] {
  const seen: unknown[] = [];
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 5; depth += 1) {
    seen.push(current);
    current = (current as { cause?: unknown }).cause;
  }
  return seen;
}

/** The HTTP status the provider answered with, if it answered at all. */
function providerStatus(error: unknown): number | null {
  for (const link of chain(error)) {
    const candidate = link as {
      status?: unknown;
      statusCode?: unknown;
      response?: { status?: unknown };
    };
    const values = [candidate.status, candidate.statusCode, candidate.response?.status];
    for (const value of values) {
      if (typeof value === "number" && value >= 100 && value <= 599) return value;
    }
  }
  return null;
}

/** A network code (`ECONNREFUSED`) or the SDK error name (`APIConnectionError`). */
function providerCode(error: unknown): string | undefined {
  for (const link of chain(error)) {
    const candidate = link as { code?: unknown; errno?: unknown; name?: unknown };
    if (typeof candidate.code === "string" && candidate.code !== "") return candidate.code;
    if (typeof candidate.errno === "string" && candidate.errno !== "") return candidate.errno;
    if (link instanceof Error && link.name && link.name !== "Error") return link.name;
  }
  return undefined;
}

function isNetworkFailure(error: unknown, status: number | null): boolean {
  if (status !== null) return TIMEOUT_STATUSES.has(status);
  const code = providerCode(error);
  if (code && (NETWORK_CODES.has(code) || NETWORK_NAMES.has(code))) return true;
  return chain(error).some(
    (link) => link instanceof Error && NETWORK_MESSAGE.test(link.message),
  );
}

export type MappedProviderError = {
  kind: ProviderErrorKind;
  /** Status for the client. */
  status: number;
  /** Safe, fixed copy for the client. */
  message: string;
  /** What the provider actually answered (logs only). */
  providerStatus: number | null;
  providerCode?: string;
};

/**
 * Classifies a provider failure. Pure: no logging, no response, so it can be
 * asserted directly.
 *
 * `auth` (401/403 → 502) and `rate-limit` (429 → 503) are the two the provider
 * reports unambiguously; timeouts and connection failures become `unavailable`
 * (504) because the query may succeed on a second attempt; everything else —
 * including a provider-side 5xx — is `unknown` (500).
 */
export function mapProviderError(error: unknown): MappedProviderError {
  const status = providerStatus(error);
  const code = providerCode(error);

  let kind: ProviderErrorKind;
  if (status === 401 || status === 403) {
    kind = "auth";
  } else if (status === 429) {
    kind = "rate-limit";
  } else if (isNetworkFailure(error, status)) {
    kind = "unavailable";
  } else {
    kind = "unknown";
  }

  return {
    kind,
    status: STATUS_BY_KIND[kind],
    message: PROVIDER_ERROR_MESSAGES[kind],
    providerStatus: status,
    providerCode: code,
  };
}

export type ProviderErrorContext = {
  /** pino-http request id, so a log line can be tied to the user's request. */
  reqId?: string;
  /** Which feature spent the call: chat, search sources or image generation. */
  route: "chat" | "search" | "image";
  mode?: string;
};

/**
 * Logs the real provider failure — status, code, message (redacted) and stack —
 * with the request id, and returns the classified result. The provider message
 * stays on the server; the client only ever receives `mapProviderError().message`.
 */
export function logProviderError(
  error: unknown,
  context: ProviderErrorContext,
): MappedProviderError {
  const mapped = mapProviderError(error);
  logger.error(
    {
      reqId: context.reqId,
      route: context.route,
      mode: context.mode,
      provider: "openai",
      kind: mapped.kind,
      providerStatus: mapped.providerStatus,
      providerCode: mapped.providerCode,
      providerMessage: redactSecrets(errorMessage(error)),
      err: toLoggableError(error),
    },
    "provider request failed",
  );
  return mapped;
}

/** Logs the failure and answers the client with safe copy and the mapped status. */
export function sendProviderError(
  res: Response,
  error: unknown,
  context: ProviderErrorContext,
): MappedProviderError {
  const mapped = logProviderError(error, context);
  res.status(mapped.status).json({ error: mapped.message });
  return mapped;
}
