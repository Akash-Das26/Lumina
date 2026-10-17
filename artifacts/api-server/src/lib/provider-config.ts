/**
 * BUG-014: provider configuration check.
 *
 * The app used to start happily with the placeholder key that ships in
 * `.env.example` (`OPENAI_API_KEY=replace-with-your-key`), so the first chat
 * message travelled to the provider, came back `401 Incorrect API key provided:
 * replace-*********-key …`, and that provider text was shown to the user as a
 * toast. A value that is empty or still the documented placeholder is *not*
 * configured, and the server now says so before it starts listening.
 *
 * The messages here name the variable, point at `.env` and the README, and
 * never contain the value itself — not even a prefix of it.
 */

/** Key variables in precedence order, mirroring the integration client. */
const API_KEY_VARIANTS = [
  "AI_INTEGRATIONS_OPENAI_API_KEY",
  "OPENAI_API_KEY",
] as const;

/**
 * Values that mean "nobody filled this in yet", including the ones
 * `.env.example` ships: `replace-with-your-key` and
 * `replace-with-a-random-32-plus-character-secret`.
 */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\breplace\b/i, // replace-with-your-key
  /\byour[-_\s]?(api[-_\s]?)?(key|token|secret)\b/i, // your-key, your_api_key
  /\bchange[\s\-_]?me\b/i,
  /\bxxx+\b/i, // sk-xxxxxxx
  /<[^>]+>/, // <your-key-here>
  /\bplaceholder\b/i,
  /^(todo|tbd|none|null|undefined|nan|secret|password)$/i,
];

const RUN_LOCALLY_HINT =
  "See .env.example and README → Run locally for where to get a key. The server reads .env once at startup, so restart it after editing.";

export type ProviderConfig =
  | { ok: true; apiKeyVariable: string; baseUrl: string }
  | { ok: false; variable: string; message: string };

/** True for an empty value or one of the documented placeholder shapes. */
export function isPlaceholderValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return true;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** The first configured key variable, or the primary one when none is set. */
function resolveKey(
  env: Record<string, string | undefined>,
): { variable: string; value: string } {
  for (const variable of API_KEY_VARIANTS) {
    if (env[variable]) return { variable, value: env[variable] as string };
  }
  return { variable: "OPENAI_API_KEY", value: "" };
}

/**
 * Validates the provider settings the app needs before it can answer anything:
 * an OpenAI-compatible API key and base URL, both really configured.
 *
 * Never throws, so it can be used at startup and in tests.
 */
export function readProviderConfig(
  env: Record<string, string | undefined> = process.env,
): ProviderConfig {
  const { variable, value } = resolveKey(env);

  if (isPlaceholderValue(value)) {
    return {
      ok: false,
      variable,
      message:
        value.trim() === ""
          ? `${variable} is not set. Add your provider's API key to .env, then start the server again. ${RUN_LOCALLY_HINT}`
          : `${variable} in .env still holds the placeholder value from .env.example. Replace it with a real provider key (for OpenAI: https://platform.openai.com/account/api-keys, or the key page of your OpenAI-compatible provider). ${RUN_LOCALLY_HINT}`,
    };
  }

  const baseUrl = env["AI_INTEGRATIONS_OPENAI_BASE_URL"] ?? "";
  if (baseUrl.trim() === "") {
    return {
      ok: false,
      variable: "AI_INTEGRATIONS_OPENAI_BASE_URL",
      message: `AI_INTEGRATIONS_OPENAI_BASE_URL is not set. Point it at your provider's OpenAI-compatible base URL in .env (for OpenAI: https://api.openai.com/v1). ${RUN_LOCALLY_HINT}`,
    };
  }

  // A malformed URL makes the SDK throw while constructing the client, which
  // used to surface as an unhandled crash instead of a setup message.
  let parsed: URL;
  try {
    parsed = new URL(baseUrl.trim());
  } catch {
    return {
      ok: false,
      variable: "AI_INTEGRATIONS_OPENAI_BASE_URL",
      message: `AI_INTEGRATIONS_OPENAI_BASE_URL is not a valid URL. Set it to a full base URL including the scheme, e.g. https://api.openai.com/v1. ${RUN_LOCALLY_HINT}`,
    };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      variable: "AI_INTEGRATIONS_OPENAI_BASE_URL",
      message: `AI_INTEGRATIONS_OPENAI_BASE_URL must be an http(s) URL, e.g. https://api.openai.com/v1. ${RUN_LOCALLY_HINT}`,
    };
  }

  return { ok: true, apiKeyVariable: variable, baseUrl: parsed.toString() };
}
