import http from "node:http";
import type { Express } from "express";

export type TestServer = {
  url: string;
  request: (
    method: string,
    path: string,
    init?: { headers?: Record<string, string>; body?: string },
  ) => Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>;
  close: () => Promise<void>;
};

/**
 * Starts the app on an ephemeral localhost port and returns a minimal
 * request helper. Deliberately dependency-free (no supertest).
 */
export async function startTestServer(app: Express): Promise<TestServer> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to acquire an ephemeral test port");
  }
  const url = `http://127.0.0.1:${address.port}`;

  async function request(
    method: string,
    path: string,
    init?: { headers?: Record<string, string>; body?: string },
  ) {
    return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>(
      (resolve, reject) => {
        const req = http.request(
          `${url}${path}`,
          { method, headers: init?.headers },
          (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => chunks.push(chunk));
            res.on("end", () =>
              resolve({
                status: res.statusCode ?? 0,
                headers: res.headers,
                body: Buffer.concat(chunks).toString("utf8"),
              }),
            );
          },
        );
        req.on("error", reject);
        if (init?.body != null) req.write(init.body);
        req.end();
      },
    );
  }

  return {
    url,
    request,
    close: () => new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve()))),
  };
}
