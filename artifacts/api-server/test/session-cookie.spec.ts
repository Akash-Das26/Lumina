// @vitest-environment node
// Regression tests for Audit 3 F-07: the session cookie must carry the
// `Secure` attribute whenever the app is served over TLS, so a downgrade or
// prefetch cannot leak it over plain HTTP. Dev runs plain HTTP on localhost,
// so the flag is env-aware rather than hardcoded.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Response } from "express";

process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef";

const { setSessionCookie, clearSessionCookie } = await import("../src/lib/session");

function capture() {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (name: string, value: string) => {
      headers[name] = value;
    },
  } as unknown as Response;
  return { res, headers };
}

const originalNodeEnv = process.env.NODE_ENV;
const originalCookieSecure = process.env.COOKIE_SECURE;

beforeEach(() => {
  delete process.env.NODE_ENV;
  delete process.env.COOKIE_SECURE;
});

afterEach(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
  if (originalCookieSecure === undefined) delete process.env.COOKIE_SECURE;
  else process.env.COOKIE_SECURE = originalCookieSecure;
});

describe("session cookie Secure attribute (Audit 3 F-07)", () => {
  it("omits Secure outside production (plain-HTTP dev would drop the cookie)", () => {
    const { res, headers } = capture();
    setSessionCookie(res, 1);
    expect(headers["Set-Cookie"]).toContain("HttpOnly");
    expect(headers["Set-Cookie"]).not.toContain("Secure");
  });

  it("adds Secure when NODE_ENV=production", () => {
    process.env.NODE_ENV = "production";
    const { res, headers } = capture();
    setSessionCookie(res, 1);
    expect(headers["Set-Cookie"]).toContain("; Secure");
  });

  it("lets COOKIE_SECURE=0 opt out even in production", () => {
    process.env.NODE_ENV = "production";
    process.env.COOKIE_SECURE = "0";
    const { res, headers } = capture();
    setSessionCookie(res, 1);
    expect(headers["Set-Cookie"]).not.toContain("Secure");
  });

  it("lets COOKIE_SECURE=1 opt in when NODE_ENV is not production", () => {
    process.env.COOKIE_SECURE = "1";
    const { res, headers } = capture();
    setSessionCookie(res, 1);
    expect(headers["Set-Cookie"]).toContain("; Secure");
  });

  it("mirrors the flag on the clearing cookie so logout stays consistent", () => {
    process.env.NODE_ENV = "production";
    const { res, headers } = capture();
    clearSessionCookie(res);
    expect(headers["Set-Cookie"]).toContain("Max-Age=0");
    expect(headers["Set-Cookie"]).toContain("; Secure");
  });
});
