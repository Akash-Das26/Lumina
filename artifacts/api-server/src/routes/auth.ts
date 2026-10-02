import { Router, type IRouter } from "express";
import { eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, users, conversations } from "@workspace/db";
import {
  clearSessionCookie,
  requireAuth,
  setSessionCookie,
  verifySessionToken,
} from "../lib/session";
import { hashPassword, verifyPassword } from "../lib/password";

const router: IRouter = Router();

const credentialsSchema = z
  .object({
    email: z.string().email().max(254),
    password: z.string().min(8).max(128),
  })
  .strict();

const registerSchema = credentialsSchema.extend({
  name: z.string().trim().min(1).max(100),
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
    res.status(400).json({ error: parsed.error.message });
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
  const [user] = await db
    .insert(users)
    .values({ email: normalizedEmail, name, passwordHash })
    .returning();

  if (autoProvision) {
    await attachUserOrphansTo(user.id);
  }

  setSessionCookie(res, user.id);
  res.status(201).json({ id: user.id, email: user.email, name: user.name });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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
