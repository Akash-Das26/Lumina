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

// Banner text that only restates the status code reads as noise next to the
// per-field messages, so it falls back to the caller's copy instead.
const STATUS_ONLY_MESSAGES = new Set(['Validation failed']);

/** True for serialised error payloads (raw JSON), which must never reach the UI. */
function looksLikeRawPayload(message: string): boolean {
  const trimmed = message.trim();
  return trimmed.startsWith('[') || trimmed.startsWith('{');
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
