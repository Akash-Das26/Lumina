import app from "./app";
import { closePool } from "@workspace/db";
import { logger } from "./lib/logger";

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
