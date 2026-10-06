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
 * IP-keyed deliberately: pre-auth requests have no user to key on, and keying
 * failures on the target account would hand attackers a lockout lever.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many authentication attempts, please try again later." },
});

/**
 * Account-creation guard. Unlike login, every registration counts (no
 * `skipSuccessfulRequests`) — the goal is to cap how many accounts one address
 * can create, not just to slow failures. IP-keyed by design (see authLimiter).
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many accounts created from this address, please try again later." },
});
