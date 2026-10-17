#!/usr/bin/env node
// pnpm check:provider — one small authenticated request to the configured AI
// provider, so "the chat fails" has a first step that does not need the app
// (README → "Choosing an AI provider" and → Troubleshooting local setup).
//
// Behaviour (BUG-021):
//   * reads the same variables the API reads — key:
//     AI_INTEGRATIONS_OPENAI_API_KEY || OPENAI_API_KEY; base URL:
//     AI_INTEGRATIONS_OPENAI_BASE_URL || OPENAI_BASE_URL (default OpenAI) —
//     from the environment first, then ./.env (only for variables not already
//     set, the same rule scripts/dev-local.mjs uses);
//   * makes GET {base}/models with `Authorization: Bearer <key>`;
//   * prints host, path and the HTTP status with a pass/fail line, plus a
//     redacted response snippet on failure and a pointer to the README table;
//   * never prints the key: the configured value is replaced outright and any
//     key-shaped token is masked down to its fixed prefix class (sk-, gsk_,
//     AIza, AQ., sk-ant-, xai-) — never the rest of the characters;
//   * exits 0 on 2xx and 1 on any failure. It is strictly opt-in: nothing runs
//     it at startup or in CI.
//
// Usage: pnpm check:provider   (or: node scripts/check-provider.mjs)

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

/** Load ./.env for variables that are not already set (never overrides). */
function loadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const assignment = trimmed.replace(/^export\s+/, "");
    const separator = assignment.indexOf("=");
    if (separator < 1) continue;
    const key = assignment.slice(0, separator).trim();
    let value = assignment.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

/**
 * Remove key material from any text before it is printed: the configured key
 * is replaced as a whole, and anything shaped like a provider key is masked to
 * its fixed prefix class plus an ellipsis. Safe by construction — no variable
 * length of the value ever reaches the output.
 */
function redact(text, key) {
  let out = String(text);
  if (key) out = out.split(key).join("[key]");
  out = out.replace(
    /(sk-ant-|gsk_|AIza|AQ\.|sk-|xai-)[A-Za-z0-9._/+=-]+/g,
    (match, prefix) => (match.length > prefix.length ? `${prefix}…` : match),
  );
  return out;
}

function fail(message, detail, key) {
  console.error(`FAILED: ${message}${detail ? `\n  ${redact(detail, key)}` : ""}`);
  console.error("  See README → Troubleshooting local setup.");
  process.exit(1);
}

loadDotEnv();

const key =
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || "";
const rawBase =
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ||
  process.env.OPENAI_BASE_URL ||
  OPENAI_DEFAULT_BASE_URL;

if (key.trim() === "") {
  fail(
    "no API key is configured (AI_INTEGRATIONS_OPENAI_API_KEY / OPENAI_API_KEY).",
    undefined,
    "",
  );
}

let base;
try {
  base = new URL(rawBase.trim());
} catch {
  fail(
    `the base URL is not a valid URL: ${redact(rawBase, key)}`,
    undefined,
    key,
  );
}

// No query string or fragment in what we print (some setups put credentials
// there) — and none in the request either: this is a plain models listing.
const modelsUrl = new URL(`${base.origin}${base.pathname.replace(/\/$/, "")}/models`);
console.log(`Checking provider: GET ${modelsUrl.origin}${modelsUrl.pathname}`);

let response;
try {
  response = await fetch(modelsUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error);
  fail(`could not reach the provider (${redact(reason, key)}).`, undefined, key);
}

const status = response.status;

let bodyText = "";
try {
  bodyText = await response.text();
} catch {
  /* a body is a bonus, not a requirement */
}
const snippet = bodyText ? redact(bodyText.slice(0, 400), key) : "";

if (status >= 200 && status < 300) {
  console.log(
    `OK: the provider accepted the key and answered HTTP ${status}. The chat can work with this configuration.`,
  );
  process.exit(0);
}

console.error(`FAILED: provider answered HTTP ${status}.`);
if (snippet) console.error(`  response: ${snippet}`);
if (status === 401 || status === 403) {
  console.error(
    "  The key was rejected by this base URL — the usual cause is a key from one provider with another provider's base URL.",
  );
}
console.error("  See README → Troubleshooting local setup.");
process.exit(1);