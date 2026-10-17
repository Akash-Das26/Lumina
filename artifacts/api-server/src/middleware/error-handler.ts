import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger";
import { errorMessage, redactSecrets, toLoggableError } from "../lib/safe-error";

/**
 * BUG-013: the single place an unhandled failure becomes a response.
 *
 * Express's default handler answered `text/html` with the whole stack trace
 * (dev), so internals reached the client and the JSON clients received a body
 * they could not read — all the user saw was "Unable to create your account.
 * Please try again." while the real cause (a database that could not
 * authenticate) existed only in the terminal. Here every failure is logged with
 * its request id and the real error, and answered as JSON whose copy never
 * describes the internals.
 */

/** HTTP status carried by the error (body-parser, http-errors, our own throws). */
function statusOf(error: unknown): number {
  let current: unknown = error;
  for (let depth = 0; current != null && depth < 5; depth += 1) {
    const candidate = current as { status?: unknown; statusCode?: unknown };
    const status =
      typeof candidate.status === "number"
        ? candidate.status
        : typeof candidate.statusCode === "number"
          ? candidate.statusCode
          : null;
    if (status !== null && status >= 400 && status <= 599) return status;
    current = (current as { cause?: unknown }).cause;
  }
  return 500;
}

/** Copy for the client: describes the class of failure, never the cause. */
function clientMessage(status: number): string {
  if (status === 413) return "Request body is too large.";
  if (status === 400) return "Malformed request body.";
  if (status >= 500) return "Internal server error";
  return "Request could not be processed.";
}

export function errorHandler(error: unknown, req: Request, res: Response, next: NextFunction): void {
  const status = statusOf(error);
  const context = {
    reqId: req.id,
    method: req.method,
    url: req.originalUrl.split("?")[0],
    status,
  };

  if (status >= 500) {
    logger.error({ ...context, err: toLoggableError(error) }, "unhandled request error");
  } else {
    logger.warn({ ...context, detail: redactSecrets(errorMessage(error)) }, "rejected request");
  }

  // A stream (SSE) has already sent its status and headers; the route owns the
  // failure there, and Express closes the connection.
  if (res.headersSent) {
    next(error);
    return;
  }

  res.status(status).json({ error: clientMessage(status) });
}
