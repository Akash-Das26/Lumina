import type { Response } from "express";
import { z } from "zod";

/**
 * BUG-012: shared formatting for schema failures.
 *
 * In Zod v4 `error.message` is the whole issues array serialised to JSON —
 * `[{"origin":"string","code":"invalid_format","format":"email","pattern":...}]`
 * — so sending it as an `error` string leaked internal validation detail
 * straight into the UI. Every route must go through this helper instead, which
 * returns one friendly message per field (Zod's own `flattenError` keys issues
 * by `path[0]`).
 */

export type FieldErrors = Record<string, string[]>;

export type ValidationErrorBody = {
  error: "Validation failed";
  fieldErrors: FieldErrors;
  /** Issues with no field path (e.g. unrecognized keys) — never shown raw. */
  formErrors: string[];
};

export function formatZodErrors(error: z.ZodError): Omit<ValidationErrorBody, "error"> {
  const { fieldErrors, formErrors } = z.flattenError(error);
  return { fieldErrors, formErrors };
}

/** Responds 400 with `{ error, fieldErrors, formErrors }` — never the raw issues. */
export function sendValidationError(res: Response, error: z.ZodError): void {
  res.status(400).json({ error: "Validation failed", ...formatZodErrors(error) });
}
