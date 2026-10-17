/**
 * BUG-013: helpers for handling failures safely.
 *
 * The API must log the real cause (message + stack) of every 500, or a broken
 * environment stays a mystery, but it must never write credentials or a
 * connection string anywhere — neither to the logs nor into a response body.
 */

// Any `scheme://…` token: postgresql://user:pass@host/db, https://host/?token=…
const URL_LIKE = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`]+/gi;

// A provider key as it appears inside the provider's own error text: a real
// value (`sk-…`, `gsk_…`, `xai-…`) or the masked echo providers use
// (BUG-014): OpenAI answers `Incorrect API key provided: sk-abcd***wxyz`.
const KEY_LIKE = /\b(?:sk|gsk|rk|xai|pk)-[A-Za-z0-9_-]{6,}/g;
const MASKED_KEY_LIKE = /\b[A-Za-z0-9_-]{3,}\*{3,}[A-Za-z0-9_-]*/g;

/** Variables whose values are secrets and must never reach a log or a response. */
const SECRET_ENV_VARS = [
  "OPENAI_API_KEY",
  "AI_INTEGRATIONS_OPENAI_API_KEY",
  "SESSION_SECRET",
] as const;

// Short values are not treated as secrets: replacing a 3-character string
// everywhere would mangle unrelated text while adding no protection.
const MIN_SECRET_LENGTH = 8;

/** The configured secret values, so a log can never echo the real key. */
function configuredSecrets(): string[] {
  return SECRET_ENV_VARS.map((name) => process.env[name]).filter(
    (value): value is string => typeof value === "string" && value.length >= MIN_SECRET_LENGTH,
  );
}

/**
 * Replaces anything that looks like a URL (and therefore may embed
 * credentials), a configured secret value, or a provider key echoed by the
 * provider itself.
 */
export function redactSecrets(text: string): string {
  let redacted = text.replace(URL_LIKE, "<redacted-url>");
  for (const secret of configuredSecrets()) {
    redacted = redacted.split(secret).join("<redacted-key>");
  }
  return redacted.replace(KEY_LIKE, "<redacted-key>").replace(MASKED_KEY_LIKE, "<redacted-key>");
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error.trim() !== "") return error;
  return "Unknown error";
}

/**
 * The error's stack, plus the stack of its `cause` when there is one: Drizzle
 * wraps driver failures (e.g. `Failed query: select …`) around the real
 * PostgreSQL error, which is the part that explains the failure.
 */
export function errorStack(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined;

  const cause = error.cause;
  if (cause instanceof Error && cause.stack) {
    return `${error.stack ?? errorMessage(error)}\nCaused by: ${cause.stack}`;
  }
  return error.stack;
}

/**
 * A redacted copy of `error` for pino's error serializer, so logs carry the
 * message and stack without ever containing a connection string or secret.
 */
export function toLoggableError(error: unknown): Error {
  const logged = new Error(redactSecrets(errorMessage(error)));
  const stack = errorStack(error);
  if (stack) logged.stack = redactSecrets(stack);
  return logged;
}
