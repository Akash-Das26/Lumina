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
 * BUG-021 goes one step further: a *wrong-provider* key (here: a Google-style
 * `AQ.…`/`AIza…` key while the base URL still points at OpenAI) also passed the
 * check and only surfaced on the first chat message as "not configured
 * correctly". When the base URL is the OpenAI default (or unset), the key must
 * look like an OpenAI key; when another base URL is configured, only the
 * empty/placeholder checks apply, because every provider has its own key shape.
 *
 * The messages here name the variable, point at `.env`, `.env.example` and the
 * README, and never contain the value itself — not even a prefix of it.
 */

/** Key variables in precedence order, mirroring the integration client. */
const API_KEY_VARIANTS = [
  "AI_INTEGRATIONS_OPENAI_API_KEY",
  "OPENAI_API_KEY",
] as const;

/** Base URL variables in precedence order. `OPENAI_BASE_URL` is the alias the
 * official OpenAI SDK reads natively (and the name the setup messages use). */
const BASE_URL_VARIANTS = [
  "AI_INTEGRATIONS_OPENAI_BASE_URL",
  "OPENAI_BASE_URL",
] as const;

/** The OpenAI entry point — the SDK's own default and our shape reference. */
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

/** Per-feature model variables (provider-specific names; see README →
 * "Choosing an AI provider"). Defaults preserve the historic behaviour. */
export const DEFAULT_CHAT_MODEL = "openai/gpt-oss-120b";
export const DEFAULT_IMAGE_MODEL = "gpt-image-1";

/**
 * Feature copy used when the configured provider cannot serve a feature.
 * Fixed string, user-facing; sent only for the feature that is unavailable.
 */
export const IMAGE_GENERATION_UNAVAILABLE_MESSAGE =
  "Image generation is not available with the current AI provider.";

/**
 * Values that mean "nobody filled this in yet", including the ones
 * `.env.example` ships: `replace-with-your-key` and
 * `replace-with-a-random-32-plus-character-secret`.
 */
const PLACEHOLDER_PATTERNS: RegExp[] = [
  /\breplace\b/i, // replace-with-your-key
  /\byour[-_\s]?(api[-_\s]?)?(key|token|secret)\b/i, // your-key, your_api_key
  /\bchange[\s\-_]?me\b/i,
  /\bxxx+/i, // xxx, xxxxxxxxx, sk-xxxxxxx
  /<[^>]+>/, // <your-key-here>
  /\bplaceholder\b/i,
  /^(todo|tbd|none|null|undefined|nan|secret|password)$/i,
];

const RUN_LOCALLY_HINT =
  "See .env.example and README → Run locally for where to get a key. The server reads .env once at startup, so restart it after editing.";

const CHOOSE_PROVIDER_HINT =
  'See README, "Choosing an AI provider".';

const RUN_LOCALLY_OR_PROVIDER_HINT = `${RUN_LOCALLY_HINT} ${CHOOSE_PROVIDER_HINT}`;

export type ProviderConfig =
  | { ok: true; apiKeyVariable: string; baseUrl: string }
  | { ok: false; variable: string; message: string };

/** True for an empty value or one of the documented placeholder shapes. */
export function isPlaceholderValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return true;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * OpenAI keys are `sk-…` (project keys: `sk-proj-…`). Anthropic keys also start
 * with `sk-` but continue `sk-ant-`, so they are excluded: they are *another*
 * provider's shape, not OpenAI's.
 */
export function looksLikeOpenaiKey(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("sk-") && !trimmed.startsWith("sk-ant-");
}

/**
 * Fixed, published key-shape prefixes of common providers (BUG-021). These are
 * complete literals from the providers' public docs — never a slice of the
 * configured value — so they are safe to log and to compare against.
 */
export const FOREIGN_PROVIDER_PREFIXES = [
  "AIza", // Google AI Studio (Gemini)
  "AQ.", // Google/Anomaly-style keys of the reported bug
  "gsk_", // Groq
  "sk-ant-", // Anthropic
  "xai-", // xAI
] as const;

/** True when the value is recognisably some *other* provider's key shape. */
export function isForeignProviderKey(value: string): boolean {
  const trimmed = value.trim();
  return FOREIGN_PROVIDER_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

/**
 * A log-safe classification of a key: one of the fixed literals above, or one
 * of the two `sk-` classes. Never includes any other characters of the value —
 * safe to write to the server log on a provider 401/403 (BUG-021).
 */
export function keyPrefixClass(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("sk-ant-")) return "key starts with sk-ant-";
  if (trimmed.startsWith("sk-")) return "key starts with sk-";
  for (const prefix of FOREIGN_PROVIDER_PREFIXES) {
    if (prefix !== "sk-ant-" && trimmed.startsWith(prefix)) {
      return `key starts with ${prefix}`;
    }
  }
  return "key does not start with sk-";
}

/**
 * True when the configured base URL is OpenAI's own endpoint (or unset, which
 * the shape check treats the same: unset means "we are talking to OpenAI").
 * Anything unparseable or elsewhere is *not* the OpenAI default — the URL
 * validity check below reports those separately.
 */
export function isOpenaiEntryPoint(
  baseUrl: string | undefined,
): boolean {
  const raw = (baseUrl ?? "").trim();
  if (raw === "") return true;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  return parsed.hostname.toLowerCase() === "api.openai.com";
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

/** The resolved base URL (`AI_…` wins over the `OPENAI_BASE_URL` alias), or "". */
function resolveBaseUrl(
  env: Record<string, string | undefined>,
): string {
  for (const variable of BASE_URL_VARIANTS) {
    if (env[variable]) return env[variable] as string;
  }
  return "";
}

/**
 * The configured key value itself — diagnostics only (prefix classification
 * and redaction helpers); never returned to a client or printed.
 */
export function configuredApiKey(
  env: Record<string, string | undefined> = process.env,
): string {
  return resolveKey(env).value;
}

/** Provider host for log lines; unset means the OpenAI default. */
export function providerHost(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = resolveBaseUrl(env).trim();
  if (raw === "") {
    return new URL(DEFAULT_OPENAI_BASE_URL).hostname;
  }
  try {
    return new URL(raw).hostname;
  } catch {
    return "(invalid base URL)";
  }
}

/** The chat-completions model for Chat/Search/Write/Translate. */
export function chatModel(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env["OPENAI_CHAT_MODEL"]?.trim();
  return configured ? configured : DEFAULT_CHAT_MODEL;
}

/** The image model for Artist. */
export function imageModel(
  env: Record<string, string | undefined> = process.env,
): string {
  const configured = env["OPENAI_IMAGE_MODEL"]?.trim();
  return configured ? configured : DEFAULT_IMAGE_MODEL;
}

/**
 * Feature capability by configured provider (BUG-021, "capability honesty").
 *
 * Only *known* unsupported combinations return false, and only because the
 * provider documents it: Google's OpenAI-compatible endpoint serves chat
 * completions but no `/images/generations`. Everything else returns true — the
 * attempt is made and a provider that answers 404/405/501 on the image route is
 * mapped to the same friendly error at call time (see the image route).
 * Anything not marked false here is **untested** against a live provider; see
 * README → "Choosing an AI provider".
 */
const IMAGE_UNSUPPORTED_HOSTS = new Set<string>([
  // Google Gemini through its OpenAI-compatible endpoint: chat only.
  "generativelanguage.googleapis.com",
]);

export function providerSupportsImages(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return !IMAGE_UNSUPPORTED_HOSTS.has(providerHost(env));
}

/**
 * Validates the provider settings the app needs before it can answer anything:
 * an OpenAI-compatible API key and base URL, both really configured — and, when
 * the base URL is OpenAI's, that the key is OpenAI-shaped (BUG-021).
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

  const baseUrl = resolveBaseUrl(env);

  // BUG-021: the key must match the base URL's provider. At the OpenAI default
  // (or unset — unset means "the SDK's default, OpenAI") only an OpenAI-shaped
  // key can work; a Google `AQ.`/`AIza`, Groq `gsk_`, Anthropic `sk-ant-` … key
  // would reach OpenAI and fail on the first message with a generic
  // "not configured correctly". With any other base URL configured, every
  // provider has its own key shape, so only the empty/placeholder checks apply.
  if (isOpenaiEntryPoint(baseUrl) && !looksLikeOpenaiKey(value)) {
    return {
      ok: false,
      variable,
      message: isForeignProviderKey(value)
        ? `${variable} does not look like an OpenAI key (expected it to start with "sk-"). If you are using another provider, set OPENAI_BASE_URL (or AI_INTEGRATIONS_OPENAI_BASE_URL) and the model variables for it. ${CHOOSE_PROVIDER_HINT}`
        : `${variable} does not start with "sk-", so it cannot be an OpenAI key — and the base URL points at OpenAI (or is unset). Check the key, or point the base URL at your provider (set OPENAI_BASE_URL or AI_INTEGRATIONS_OPENAI_BASE_URL) and its model variables. ${CHOOSE_PROVIDER_HINT}`,
    };
  }

  if (baseUrl.trim() === "") {
    return {
      ok: false,
      variable: "AI_INTEGRATIONS_OPENAI_BASE_URL",
      message: `AI_INTEGRATIONS_OPENAI_BASE_URL is not set. Point it at your provider's OpenAI-compatible base URL in .env (for OpenAI: ${DEFAULT_OPENAI_BASE_URL}; the alias OPENAI_BASE_URL works too). ${RUN_LOCALLY_OR_PROVIDER_HINT}`,
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
      message: `AI_INTEGRATIONS_OPENAI_BASE_URL is not a valid URL. Set it to a full base URL including the scheme, e.g. ${DEFAULT_OPENAI_BASE_URL}. ${RUN_LOCALLY_HINT}`,
    };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      ok: false,
      variable: "AI_INTEGRATIONS_OPENAI_BASE_URL",
      message: `AI_INTEGRATIONS_OPENAI_BASE_URL must be an http(s) URL, e.g. ${DEFAULT_OPENAI_BASE_URL}. ${RUN_LOCALLY_HINT}`,
    };
  }

  return { ok: true, apiKeyVariable: variable, baseUrl: parsed.toString() };
}