import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

/**
 * Cookie-backed sessions without a session store: the value is
 * "<userId>.<expiryMs>.<hmac>", signed with SESSION_SECRET. Tampering breaks
 * the HMAC and expired sessions fail the expiry check.
 */

const COOKIE_NAME = "lumina_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "SESSION_SECRET is missing or too short. Set it to a random 32+ character value in .env.",
    );
  }
  return secret;
}

function sign(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: number): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expiresAt, signature] = parts;
  const payload = `${userId}.${expiresAt}`;
  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expiresAt) < Date.now()) return null;
  const id = Number(userId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Whether session cookies carry the `Secure` attribute (Audit 3 F-07).
 * Defaults to on in production and off elsewhere, because dev serves plain
 * HTTP on localhost and a Secure cookie would be silently dropped there.
 * `COOKIE_SECURE=1|0` overrides explicitly, e.g. a TLS-terminating setup that
 * runs with NODE_ENV unset. Read at call time so ops changes need no restart
 * and tests can toggle it per case.
 */
function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === "1") return true;
  if (process.env.COOKIE_SECURE === "0") return false;
  return process.env.NODE_ENV === "production";
}

function sessionCookieAttributes(maxAgeSeconds: number): string {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${cookieSecure() ? "; Secure" : ""}`;
}

export function setSessionCookie(res: Response, userId: number): void {
  const maxAgeSeconds = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${createSessionToken(userId)}; ${sessionCookieAttributes(maxAgeSeconds)}`,
  );
}

export function clearSessionCookie(res: Response): void {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; ${sessionCookieAttributes(0)}`);
}

// Augment Express Request with the authenticated user id. Typed as required:
// only requireAuth-protected routes may read it, and requireAuth always sets it.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId: number;
    }
  }
}

/** 401s unauthenticated requests; attaches req.userId otherwise. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = verifySessionToken(req.headers.cookie ? readCookie(req.headers.cookie, COOKIE_NAME) : undefined);
  if (userId == null) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.userId = userId;
  next();
}

function readCookie(cookieHeader: string, name: string): string | undefined {
  for (const pair of cookieHeader.split(";")) {
    const [key, ...rest] = pair.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return undefined;
}
