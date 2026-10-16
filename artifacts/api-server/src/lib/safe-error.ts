/**
 * BUG-013: helpers for handling failures safely.
 *
 * The API must log the real cause (message + stack) of every 500, or a broken
 * environment stays a mystery, but it must never write credentials or a
 * connection string anywhere — neither to the logs nor into a response body.
 */

// Any `scheme://…` token: postgresql://user:pass@host/db, https://host/?token=…
const URL_LIKE = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'`]+/gi;

/** Replaces anything that looks like a URL (and therefore may embed credentials). */
export function redactSecrets(text: string): string {
  return text.replace(URL_LIKE, "<redacted-url>");
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
