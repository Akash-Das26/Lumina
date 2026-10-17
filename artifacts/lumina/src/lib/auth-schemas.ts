import { z } from 'zod';

/**
 * BUG-012: sign-up / sign-in field rules with user-facing messages.
 *
 * The API validates the same rules (and the same wording) in
 * `artifacts/api-server/src/routes/auth.ts`. This client copy exists so users
 * get instant feedback without a round trip; the server stays the source of
 * truth, because anything client-side can be bypassed.
 *
 * `z.string({ error })` covers a field that is missing or not a string at all —
 * Zod's own "Invalid input: expected string, received undefined" is developer
 * jargon, so it is replaced with the same sentence the empty case uses.
 */

const NAME_REQUIRED = 'Please enter your name';
const EMAIL_INVALID = 'Please enter a valid email address (e.g. name@example.com)';
const PASSWORD_TOO_SHORT = 'Password must be at least 8 characters';

export const nameSchema = z
  .string({ error: NAME_REQUIRED })
  .trim()
  .min(1, NAME_REQUIRED)
  .max(100, 'Name must be 100 characters or fewer');

/** Trimmed and lower-cased before it is checked, so stray spaces or host casing are not errors. */
export const emailSchema = z
  .string({ error: EMAIL_INVALID })
  .trim()
  .toLowerCase()
  .max(254, 'Email must be 254 characters or fewer')
  .pipe(z.email(EMAIL_INVALID));

export const passwordSchema = z
  .string({ error: PASSWORD_TOO_SHORT })
  .min(8, PASSWORD_TOO_SHORT)
  .max(128, 'Password must be 128 characters or fewer');

export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
