import rateLimit from "express-rate-limit";

/**
 * Shared rate limiters.
 *
 * Applied in app.ts (before the router) so every AI endpoint is protected.
 * The app runs behind a same-origin proxy in dev (Vite proxies /api/*), so
 * `validate.xForwardedForHeader` warnings are expected and harmless there.
 */
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
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
 * can create, not just to slow failures.
 */
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many accounts created from this address, please try again later." },
});
