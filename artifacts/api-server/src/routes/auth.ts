import { Router, type IRouter } from "express";
import { eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, users, conversations } from "@workspace/db";
import {
  clearSessionCookie,
  requireAuth,
  setSessionCookie,
} from "../lib/session";
import { hashPassword, verifyPassword } from "../lib/password";
import { sendValidationError } from "../lib/validation";
import { isUniqueViolation } from "../lib/database";

const router: IRouter = Router();

// BUG-012: messages are user-facing — these are the same strings the client
// schemas in artifacts/lumina/src/lib/auth-schemas.ts use, so a field rejected
// locally reads identically when the server rejects it. `z.string({ error })`
// replaces Zod's jargon ("Invalid input: expected string, received undefined")
// for a missing or non-string field with the regular message.
const NAME_REQUIRED = "Please enter your name";
const EMAIL_INVALID = "Please enter a valid email address (e.g. name@example.com)";
const PASSWORD_TOO_SHORT = "Password must be at least 8 characters";

const credentialsSchema = z
  .object({
    email: z
      .string({ error: EMAIL_INVALID })
      .trim()
      .toLowerCase()
      .max(254, "Email must be 254 characters or fewer")
      .pipe(z.email(EMAIL_INVALID)),
    password: z
      .string({ error: PASSWORD_TOO_SHORT })
      .min(8, PASSWORD_TOO_SHORT)
      .max(128, "Password must be 128 characters or fewer"),
  })
  .strict();

const registerSchema = credentialsSchema.extend({
  name: z
    .string({ error: NAME_REQUIRED })
    .trim()
    .min(1, NAME_REQUIRED)
    .max(100, "Name must be 100 characters or fewer"),
});

// Existing local databases may hold conversations without a userId. When
// AUTH_AUTO_PROVISION=1, the first registered user adopts those orphans.
const autoProvision = process.env.AUTH_AUTO_PROVISION === "1";

async function attachUserOrphansTo(userId: number): Promise<void> {
  await db.update(conversations).set({ userId }).where(isNull(conversations.userId));
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const { email, password, name } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail));
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await hashPassword(password);

  let user: { id: number; email: string; name: string };
  try {
    [user] = await db
      .insert(users)
      .values({ email: normalizedEmail, name, passwordHash })
      .returning();
  } catch (error) {
    // Two registrations for the same address can pass the select above
    // concurrently; the unique index on users.email then raises 23505, which is
    // the same outcome as the duplicate check — a 409, not a 500 (BUG-013).
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }
    throw error;
  }

  if (autoProvision) {
    await attachUserOrphansTo(user.id);
  }

  setSessionCookie(res, user.id);
  res.status(201).json({ id: user.id, email: user.email, name: user.name });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }
  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail));
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }
  setSessionCookie(res, user.id);
  res.json({ id: user.id, email: user.email, name: user.name });
});

router.post("/auth/logout", (_req, res): void => {
  clearSessionCookie(res);
  res.status(204).send();
});

// Soft session validation: 200 when the signed cookie is valid and the user
// still exists, 401 otherwise. Does not refresh the cookie.
router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(users).where(eq(users.id, req.userId));
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.json({ id: user.id, email: user.email, name: user.name });
});

export default router;
