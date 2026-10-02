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
