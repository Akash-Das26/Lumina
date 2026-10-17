import fs from "node:fs";
import { closePool, setPoolErrorHandler } from "@workspace/db";
import { logger } from "./lib/logger";
import { checkDatabase } from "./lib/database";
import { readProviderConfig } from "./lib/provider-config";
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
function reportStartupFailure(message: string, detail?: string): void {
  const text = detail ? `\n${message}\n  cause: ${detail}\n` : `\n${message}\n`;
  try {
    fs.writeSync(2, text);
  } catch {
    console.error(text);
  }
}

async function main(): Promise<void> {
  // BUG-014: fail fast on an unconfigured provider. A key that is empty or
  // still the `.env.example` placeholder used to start the server anyway, so
  // the first chat message went to the provider, came back 401 and showed the
  // provider's own text (with part of the key) in the UI.
  const provider = readProviderConfig();
  if (!provider.ok) {
    reportStartupFailure(provider.message);
    process.exit(1);
  }

  // BUG-013: fail fast. An unreachable or unmigrated database used to be
  // invisible until the first request that touched it, where it became a
  // generic 500 — and, in the UI, a generic "please try again" banner.
  const health = await checkDatabase();
  if (!health.ok) {
    reportStartupFailure(health.message, health.detail);
    process.exit(1);
  }

  // Loaded after the checks: importing the router pulls in the provider SDK,
  // whose client refuses to be constructed without credentials. Loading it here
  // keeps the checks above the only thing that can report a bad setup.
  const { default: app } = await import("./app");

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
