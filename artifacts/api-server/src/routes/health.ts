import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { checkDatabase } from "../lib/database";
import { logger } from "../lib/logger";

const router: IRouter = Router();

/** Liveness: the process is up. Does not touch the database. */
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

/**
 * Readiness (BUG-013): proves the database is reachable *and* initialized.
 *
 * `curl localhost:8080/api/health` now answers whether a local setup is usable
 * before the UI has to turn a broken database into a generic banner. 503 with
 * an actionable message instead of a 500 on the first real request.
 */
router.get("/health", async (_req, res): Promise<void> => {
  const health = await checkDatabase();
  if (health.ok) {
    res.json(HealthCheckResponse.parse({ status: "ok", database: "ok" }));
    return;
  }

  logger.warn({ reason: health.reason, detail: health.detail }, "health: database not ready");
  res
    .status(503)
    .json(
      HealthCheckResponse.parse({
        status: "degraded",
        database: health.reason,
        message: health.message,
      }),
    );
});

export default router;
