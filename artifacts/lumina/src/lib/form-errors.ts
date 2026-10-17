import { z } from 'zod';

/**
 * BUG-012: the one place that turns validation failures into text a user may
 * see. Zod v4's `error.message` is the entire issues array serialised to JSON
 * (origin/code/format/pattern/path), so nothing may render it — every form maps
 * issues through `formatZodErrors` and every API failure through
 * `formatApiFieldErrors` / `formatFormErrorMessage`.
 */

/** One friendly message per field, keyed by the field name the form renders. */
export type FieldErrors<Field extends string = string> = Partial<Record<Field, string>>;

/** Maps a ZodError to the first message for each field it names. */
export function formatZodErrors<Field extends string = string>(
  error: z.ZodError,
): FieldErrors<Field> {
  // A bare `ZodError` carries no output shape for `flattenError` to type the
  // field keys from, so the shape is declared here: one message array per path.
  const { fieldErrors } = z.flattenError(error) as {
    fieldErrors: Record<string, string[] | undefined>;
  };
  const formatted: FieldErrors<Field> = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    const first = messages?.[0];
    if (first) formatted[field as Field] = first;
  }
  return formatted;
}

/** Copy of `errors` without `field` — used the moment the user edits that field. */
export function withoutFieldError<Field extends string>(
  errors: FieldErrors<Field>,
  field: Field,
): FieldErrors<Field> {
  if (!(field in errors)) return errors;
  const next = { ...errors };
  delete next[field];
  return next;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/** The API client throws `ApiError`s carrying the parsed body on `.data`. */
function errorBody(err: unknown): Record<string, unknown> | null {
  return asRecord(asRecord(err)?.data);
}

/**
 * Server-side validation failures arrive as
 * `{ error: "Validation failed", fieldErrors: { email: ["..."] } }`; flatten
 * them to one message per field so they render under the matching input.
 */
export function formatApiFieldErrors<Field extends string = string>(
  err: unknown,
): FieldErrors<Field> {
  const fieldErrors = asRecord(errorBody(err)?.fieldErrors);
  if (!fieldErrors) return {};

  const formatted: FieldErrors<Field> = {};
  for (const [field, value] of Object.entries(fieldErrors)) {
    const message = Array.isArray(value)
      ? value.find((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
      : undefined;
    if (message) formatted[field as Field] = message;
  }
  return formatted;
}

/** Shown when the request never got an HTTP response at all (BUG-013). */
export const UNREACHABLE_MESSAGE =
  "Can't reach the server. Check your connection and try again.";

// Banner text that only restates the status code or describes the server's own
// failure reads as noise next to the per-field messages, so it falls back to the
// caller's copy instead.
const STATUS_ONLY_MESSAGES = new Set(['Validation failed', 'Internal server error']);

/**
 * True for serialised error payloads — raw JSON, or an HTML error page as
 * Express's default handler used to return (BUG-013) — which must never reach
 * the UI.
 */
function looksLikeRawPayload(message: string): boolean {
  const trimmed = message.trim();
  return trimmed.startsWith('[') || trimmed.startsWith('{') || trimmed.startsWith('<');
}

/**
 * Banner text for server, network and account errors (duplicate email, bad
 * credentials, offline). Never returns a raw error payload.
 */
export function formatFormErrorMessage(err: unknown, fallback: string): string {
  const message = errorBody(err)?.error;
  if (typeof message !== 'string') return fallback;

  const trimmed = message.trim();
  if (!trimmed || STATUS_ONLY_MESSAGES.has(trimmed) || looksLikeRawPayload(trimmed)) {
    return fallback;
  }
  return trimmed;
}

/**
 * The HTTP status of a thrown API error, or `null` when the request never
 * reached the server. The API client throws an `ApiError` (with a numeric
 * `status`) for every HTTP response; an offline browser, a stopped API or a DNS
 * failure rejects the fetch itself and carries no status.
 */
export function getHttpStatus(err: unknown): number | null {
  const status = asRecord(err)?.status;
  return typeof status === 'number' ? status : null;
}

/**
 * Gateway statuses: the API could not be reached by whatever sat in front of it
 * (the Vite dev proxy answers 503 when the API process is down, and a real
 * gateway answers 502/504). From the user's point of view that is the same
 * story as a request that never arrived.
 */
const UNREACHABLE_STATUSES = new Set([502, 503, 504]);

/**
 * Banner copy for a failed submit (BUG-013). `statusMessages` maps a specific
 * status code (e.g. 409 duplicate email) to copy; anything unrecognized falls
 * back to the server's message or `fallback`, and a request that never reached
 * the API says so instead of blaming the account.
 */
export function formatSubmitError(
  err: unknown,
  { fallback, statusMessages = {} }: {
    fallback: string;
    statusMessages?: Record<number, string>;
  },
): string {
  const status = getHttpStatus(err);
  if (status === null || UNREACHABLE_STATUSES.has(status)) return UNREACHABLE_MESSAGE;
  return statusMessages[status] ?? formatFormErrorMessage(err, fallback);
}
