import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  authLimiter,
  chatLimiter,
  registerLimiter,
  statsLimiter,
} from "./middleware/rate-limit";

const app: Express = express();

// Audit 3 F-02 / BUG-007: behind one or more reverse proxies every client
// shares the proxy's socket address unless Express is told how many hops to
// trust, which collapses all users into one rate-limit bucket (lockout risk)
// and breaks per-client throttling. TRUST_PROXY_HOPS declares the number of
// trusted proxy hops for this deployment (0 = direct, the safe default; 1 =
// the typical single reverse proxy / the Vite dev proxy). With hops > 0,
// req.ip comes from the X-Forwarded-For chain up to that hop.
const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? "0");
if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set("trust proxy", trustProxyHops);
}

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// Same-origin in dev (Vite proxies /api/*) and in the local launcher; the
// optional CORS_ORIGINS env var allows-lists extra origins when the API is
// exposed to other frontends. Unlisted cross-origin browsers are blocked,
// while non-browser clients are unaffected.
const extraOrigins = (process.env.CORS_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || extraOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  }),
);
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// Rate limits: `statsLimiter` covers the cheap read routes; the cost-bearing
// `chatLimiter` is mounted inside the openai router after requireAuth so it can
// key on the signed-in user (Audit 3 F-02); `authLimiter`/`registerLimiter`
// blunt credential brute-forcing and mass account creation. `/auth/me` is a
// cheap, frequent read and stays unlimited.
app.use("/api/openai/stats", statsLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", registerLimiter);

app.use("/api", router);

export default app;
