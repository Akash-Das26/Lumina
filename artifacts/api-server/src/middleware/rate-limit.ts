import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";

/**
 * Shared rate limiters.
 *
 * `chatLimiter` is mounted inside the openai router, immediately after
 * `requireAuth`, so its key generator can see the signed-in user id. The
 * pre-auth limiters (`statsLimiter`, `authLimiter`, `registerLimiter`) are
 * mounted in app.ts before the router.
 *
 * Keying (Audit 3 F-02 / BUG-007): by default express-rate-limit keys on the
 * request IP, which collapses every client behind one proxy into a single
 * bucket. The cost-bearing AI limiter composes the signed-in user id into the
 * key so authenticated clients can never exhaust one another; unauthenticated
 * requests never reach it (requireAuth 401s first). Deployment topology is
 * handled by TRUST_PROXY_HOPS (see app.ts).
 */
function userScopedKeyGenerator(req: Request): string {
  // ipKeyGenerator normalises IPv6 addresses (per /64) so IPv6 clients can't
  // rotate within their subnet to dodge the limit (express-rate-limit v8
  // requires the helper in custom key generators).
  // Express 5 types req.ip as string | undefined; an empty fallback keeps
  // these requests in one shared bucket (fail closed) instead of crashing.
  const ip = ipKeyGenerator(req.ip ?? "");
  const userId = (req as Request & { userId?: number }).userId;
  return userId ? `u${userId}:${ip}` : ip;
}

/**
 * Key generator for `authLimiter`: failed logins are counted per
 * **IP + target email** (email trimmed and lowercased, exactly how the login
 * route normalizes it, so case variants share one bucket).
 *
 * Why not plain IP: everyone behind one NAT/captive portal/office proxy would
 * share a single 10-attempts-per-15-min bucket, so ten failures by anyone —
 * or ten *successful* sign-ins elsewhere on the network — could lock out
 * unrelated people. Why not email alone: keying only on the target account
 * would hand an attacker a cross-network lockout lever against a chosen
 * victim. The composite key gives each address-email pair its own budget
 * without letting one actor exhaust another's.
 *
 * `express.json` runs before this limiter (app.ts), so the body is available.
 * A missing/non-string email (never reaches the credential check anyway)
 * falls back to plain IP keying rather than forming a shared `ip:` bucket.
 */
function loginFailureKeyGenerator(req: Request): string {
  const ip = ipKeyGenerator(req.ip ?? "");
  const body = (req as Request & { body?: unknown }).body;
  const raw =
    body && typeof body === "object" && "email" in body
      ? (body as { email?: unknown }).email
      : undefined;
  const email = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return email ? `${ip}:${email}` : ip;
}

export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: userScopedKeyGenerator,
  message: { error: "Too many AI requests, please slow down." },
});

export const statsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests, please slow down." },
});

/**
 * Brute-force guard for the login endpoint. Only *failed* attempts count
 * (`skipSuccessfulRequests`), so an active user signing in repeatedly from the
 * same address is never locked out — only credential guessing is throttled.
 * Failures are keyed by IP + target email (see `loginFailureKeyGenerator`) so
 * people sharing one address never lock each other out, while an attacker
 * still gets at most 10 guesses per target per 15 minutes from any one IP.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: loginFailureKeyGenerator,
  message: { error: "Too many authentication attempts, please try again later." },
});

/**
 * Account-creation guard. Unlike login, every registration counts (no
 * `skipSuccessfulRequests`) — the goal is to cap how many accounts one address
 * can create, not just to slow failures. Deliberately keyed on IP alone (the
 * default generator): including the submitted email would let an attacker
 * create unlimited accounts from one address just by varying the email, which
 * is exactly what this limiter exists to prevent.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many accounts created from this address, please try again later." },
});
