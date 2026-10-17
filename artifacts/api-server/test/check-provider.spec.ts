// @vitest-environment node
// BUG-021: pnpm check:provider — one small authenticated GET {base}/models.
// Runs the real script against the real stub provider: the 200 (pass) and 401
// (fail) paths, plus missing configuration. Everything runs with cwd outside
// the repository, so the script never reads the real .env in tests, and the
// assertions pin that no key material reaches stdout/stderr on any path.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DIR = fileURLToPath(new URL(".", import.meta.url));
const ROOT = resolve(TEST_DIR, "../../..");
const SCRIPT = join(ROOT, "scripts", "check-provider.mjs");
const STUB = join(ROOT, "scripts", "browser", "stub-provider.mjs");

/** Sentinel tail — any of it in an output would be a key leak. */
const KEY = "sk-check-FakeCheckKeySentinel1234567890";

const workdir = mkdtempSync(join(tmpdir(), "check-provider-"));
const stubs: ChildProcess[] = [];

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port =
        typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolvePort(port));
    });
    probe.on("error", reject);
  });
}

async function startStub(modelsStatus?: number): Promise<number> {
  const port = await freePort();
  const child = spawn(process.execPath, [STUB], {
    env: {
      PATH: process.env.PATH,
      PORT: String(port),
      ...(modelsStatus !== undefined
        ? { STUB_MODELS_STATUS: String(modelsStatus) }
        : {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  stubs.push(child);
  await new Promise<void>((resolveReady, reject) => {
    const timer = setTimeout(
      () => reject(new Error("stub provider did not start")),
      5_000,
    );
    child.stdout?.on("data", (chunk: Buffer) => {
      if (String(chunk).includes("stub provider")) {
        clearTimeout(timer);
        resolveReady();
      }
    });
    child.on("error", reject);
    child.on("exit", () => reject(new Error("stub provider exited early")));
  });
  return port;
}

type CheckResult = { code: number | null; output: string };

function runCheck(
  env: Record<string, string>,
  cwd: string = workdir,
): Promise<CheckResult> {
  return new Promise((resolveResult) => {
    const child = spawn(process.execPath, [SCRIPT], {
      // Default cwd is a temp directory: the script only looks for .env in the
      // directory it runs from, so the repository's real .env can never leak
      // into this test. Callers may pass their own temp dir with a fixture .env.
      cwd,
      env: { PATH: process.env.PATH, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout?.on("data", (chunk: Buffer) => {
      out += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      out += String(chunk);
    });
    child.on("close", (code) => resolveResult({ code, output: out }));
  });
}

function expectNoKeyMaterial(output: string) {
  expect(output).not.toContain(KEY);
  expect(output).not.toContain("FakeCheckKeySentinel");
  expect(output).not.toContain("1234567890");
}

beforeAll(() => {
  // The script must exist exactly where the package.json script points.
  expect(SCRIPT).toContain("check-provider.mjs");
});

afterAll(() => {
  for (const child of stubs) {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  }
  rmSync(workdir, { recursive: true, force: true });
});

describe("pnpm check:provider (BUG-021)", () => {
  it("passes with exit code 0 when the provider answers 200, and prints no key", async () => {
    const port = await startStub(200);

    const { code, output } = await runCheck({
      OPENAI_API_KEY: KEY,
      AI_INTEGRATIONS_OPENAI_BASE_URL: `http://127.0.0.1:${port}/v1`,
    });

    expect(code).toBe(0);
    expect(output).toContain("OK");
    expect(output).toContain("HTTP 200");
    expectNoKeyMaterial(output);
  });

  it("fails with a non-zero exit code and the HTTP status on a 401, and prints no key", async () => {
    const port = await startStub(401);

    const { code, output } = await runCheck({
      OPENAI_API_KEY: KEY,
      AI_INTEGRATIONS_OPENAI_BASE_URL: `http://127.0.0.1:${port}/v1`,
    });

    expect(code).toBe(1);
    expect(output).toContain("FAILED");
    expect(output).toContain("401");
    // The one-line pointer to the troubleshooting table.
    expect(output).toContain("Troubleshooting");
    // The 401 body is echoed back (redacted) for diagnosis…
    expect(output).toContain("Incorrect API key provided");
    // …but never with key-shaped tokens beyond their fixed prefix class.
    expect(output).not.toContain("sk-proj");
    expectNoKeyMaterial(output);
  });

  it("fails with a non-zero exit code when no key is configured", async () => {
    const { code, output } = await runCheck({});

    expect(code).toBe(1);
    expect(output).toContain("FAILED");
    expect(output).toContain("no API key");
    expect(output).not.toContain("sk-");
  });

  it("fails (and leaks nothing) when the base URL cannot be reached", async () => {
    const port = await freePort(); // nothing listens here

    const { code, output } = await runCheck({
      OPENAI_API_KEY: KEY,
      AI_INTEGRATIONS_OPENAI_BASE_URL: `http://127.0.0.1:${port}/v1`,
    });

    expect(code).toBe(1);
    expect(output).toContain("FAILED");
    expect(output).toContain("could not reach the provider");
    expectNoKeyMaterial(output);
  });

  it("reads ./.env when a variable is not set, but the real environment still wins", async () => {
    const port = await startStub(200);
    const envDir = mkdtempSync(join(tmpdir(), "check-provider-env-"));
    try {
      // Fixture .env supplies the key (so file loading is exercised) and a
      // deliberately broken base URL (so we can tell file and env apart: if
      // the file won, the check would fail on the invalid URL).
      writeFileSync(
        join(envDir, ".env"),
        [
          "# fixture: never the repository's real .env",
          `OPENAI_API_KEY=${KEY}`,
          "AI_INTEGRATIONS_OPENAI_BASE_URL=not-a-url",
          "",
        ].join("\n"),
      );

      const { code, output } = await runCheck(
        { AI_INTEGRATIONS_OPENAI_BASE_URL: `http://127.0.0.1:${port}/v1` },
        envDir,
      );

      // Base URL from the environment (wins), key from ./.env (fallback) → 200.
      expect(code).toBe(0);
      expect(output).toContain("HTTP 200");
      expectNoKeyMaterial(output);
    } finally {
      rmSync(envDir, { recursive: true, force: true });
    }
  });
});