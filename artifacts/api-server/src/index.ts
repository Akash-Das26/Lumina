import fs from "node:fs";
import app from "./app";
import { closePool, setPoolErrorHandler } from "@workspace/db";
import { logger } from "./lib/logger";
import { checkDatabase } from "./lib/database";
import { toLoggableError } from "./lib/safe-error";

// A dropped backend connection (database restart, idle timeout, network blip)
// must not take the API down with it (BUG-013): report it through the logger and
// let the next query reconnect instead.
setPoolErrorHandler((error) => {
  logger.warn({ err: toLoggableError(error) }, "database connection error");
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

/**
 * Startup failure, written with a synchronous descriptor write.
 *
 * pino logs through a worker thread (pino-pretty in dev), and `process.exit()`
 * can beat that worker — which would leave the developer with an exit code and
 * no reason at all. This line is guaranteed to arrive, on stderr, before the
 * process ends.
 */
function reportStartupFailure(message: string, detail: string): void {
  const text = `\n${message}\n  cause: ${detail}\n`;
  try {
    fs.writeSync(2, text);
  } catch {
    console.error(text);
  }
}

async function main(): Promise<void> {
  // BUG-013: fail fast. An unreachable or unmigrated database used to be
  // invisible until the first request that touched it, where it became a
  // generic 500 — and, in the UI, a generic "please try again" banner.
  const health = await checkDatabase();
  if (!health.ok) {
    reportStartupFailure(health.message, health.detail);
    process.exit(1);
  }

  const server = app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });

  // Graceful shutdown (Audit 2 F-08): stop accepting connections, wait for
  // in-flight requests, then close the pg pool so sockets don't linger until
  // process exit.
  async function shutdown(signal: string) {
    logger.info({ signal }, "Shutting down");
    server.close(async () => {
      await closePool();
      process.exit(0);
    });
    // Force exit if graceful close hangs (e.g. a stuck keep-alive socket).
    setTimeout(() => process.exit(0), 10_000).unref();
  }

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

void main();
