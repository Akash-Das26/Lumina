// @vitest-environment node
// BUG-014: the provider settings must be really configured before the server
// listens. These tests pin the three cases the check exists for — empty,
// placeholder, valid-looking — plus the rule that the offending value is never
// echoed back in the message.
import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHAT_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_OPENAI_BASE_URL,
  FOREIGN_PROVIDER_PREFIXES,
  IMAGE_GENERATION_UNAVAILABLE_MESSAGE,
  chatModel,
  imageModel,
  isForeignProviderKey,
  isPlaceholderValue,
  keyPrefixClass,
  looksLikeOpenaiKey,
  providerHost,
  providerSupportsImages,
  readProviderConfig,
} from "../src/lib/provider-config";

const BASE_URL = "https://api.openai.com/v1";

/** A realistic key: nothing in it looks like a placeholder. */
const REAL_KEY = "sk-proj-T9fQ2mZk7LpR4xVb1nHc8sYd6aWe3rTu";

/** Anything a user might plausibly leave from `.env.example` or a quick edit. */
const PLACEHOLDERS = [
  "replace-with-your-key",
  "replace-with-a-random-32-plus-character-secret",
  "REPLACE-WITH-YOUR-KEY",
  "your-api-key",
  "your_key",
  "your key here",
  "changeme",
  "change-me",
  "ChangeMe",
  "xxx",
  "xxxxxxxxxxxxxxxx",
  "sk-xxxxxxx",
  "<your-key-here>",
  "placeholder",
  "TODO",
];

describe("isPlaceholderValue", () => {
  it("treats empty and whitespace-only values as not configured", () => {
    expect(isPlaceholderValue("")).toBe(true);
    expect(isPlaceholderValue("   ")).toBe(true);
    expect(isPlaceholderValue("\t\n")).toBe(true);
  });

  it.each(PLACEHOLDERS)("treats %j as a placeholder", (value) => {
    expect(isPlaceholderValue(value)).toBe(true);
  });

  it("accepts real-looking keys, including other OpenAI-compatible providers", () => {
    expect(isPlaceholderValue(REAL_KEY)).toBe(false);
    // Groq keys are `gsk_…` and the app supports any OpenAI-compatible provider.
    expect(isPlaceholderValue("gsk_1a2b3c4d5e6f7g8h9i0j")).toBe(false);
    // Keys the test suite and browser harnesses use must stay valid, or every
    // other spec would fail its startup check.
    expect(isPlaceholderValue("test-key")).toBe(false);
    expect(isPlaceholderValue("stub-key")).toBe(false);
  });
});

describe("readProviderConfig", () => {
  it("accepts a configured key and base URL", () => {
    const config = readProviderConfig({
      OPENAI_API_KEY: REAL_KEY,
      AI_INTEGRATIONS_OPENAI_BASE_URL: BASE_URL,
    });

    expect(config.ok).toBe(true);
    if (config.ok) {
      expect(config.apiKeyVariable).toBe("OPENAI_API_KEY");
      expect(config.baseUrl).toBe(BASE_URL);
    }
  });

  it("prefers AI_INTEGRATIONS_OPENAI_API_KEY, like the provider client does", () => {
    const config = readProviderConfig({
      AI_INTEGRATIONS_OPENAI_API_KEY: "gsk_1a2b3c4d5e6f7g8h9i0j",
      OPENAI_API_KEY: "replace-with-your-key",
      AI_INTEGRATIONS_OPENAI_BASE_URL: "https://api.groq.com/openai/v1",
    });

    expect(config.ok).toBe(true);
  });

  it("reports a missing key, naming the variable and where to set it", () => {
    const config = readProviderConfig({ AI_INTEGRATIONS_OPENAI_BASE_URL: BASE_URL });

    expect(config.ok).toBe(false);
    if (!config.ok) {
      expect(config.variable).toBe("OPENAI_API_KEY");
      expect(config.message).toContain("OPENAI_API_KEY");
      expect(config.message).toMatch(/is not set/);
      expect(config.message).toContain(".env");
      expect(config.message).toContain("README");
    }
  });

  it("reports an empty key as not set", () => {
    const config = readProviderConfig({ OPENAI_API_KEY: "   ", AI_INTEGRATIONS_OPENAI_BASE_URL: BASE_URL });

    expect(config.ok).toBe(false);
    if (!config.ok) expect(config.message).toMatch(/is not set/);
  });

  it.each(PLACEHOLDERS)("rejects the placeholder %j", (value) => {
    const config = readProviderConfig({
      OPENAI_API_KEY: value,
      AI_INTEGRATIONS_OPENAI_BASE_URL: BASE_URL,
    });

    expect(config.ok).toBe(false);
    if (!config.ok) {
      expect(config.variable).toBe("OPENAI_API_KEY");
      expect(config.message).toContain("placeholder");
      expect(config.message).toContain(".env");
      expect(config.message).toContain("README");
      // The fix instructions say where to get a key...
      expect(config.message).toContain("platform.openai.com");
    }
  });

  it("never echoes the offending value, in full or in part", () => {
    // The tail makes the assertion unambiguous: nothing in the message should
    // reproduce any part of the value.
    const secret = "replace-with-your-key-7f3c9a21b45e";
    const config = readProviderConfig({
      OPENAI_API_KEY: secret,
      AI_INTEGRATIONS_OPENAI_BASE_URL: BASE_URL,
    });

    expect(config.ok).toBe(false);
    if (!config.ok) {
      expect(config.message).not.toContain(secret);
      expect(config.message).not.toContain("7f3c9a21b45e");
      expect(config.message).not.toContain(secret.slice(0, 8));
    }
  });

  it("names the alias in the message when that is the variable that holds the placeholder", () => {
    const config = readProviderConfig({
      AI_INTEGRATIONS_OPENAI_API_KEY: "replace-with-your-key",
      AI_INTEGRATIONS_OPENAI_BASE_URL: BASE_URL,
    });

    expect(config.ok).toBe(false);
    if (!config.ok) expect(config.variable).toBe("AI_INTEGRATIONS_OPENAI_API_KEY");
  });

  it("reports a missing base URL", () => {
    const config = readProviderConfig({ OPENAI_API_KEY: REAL_KEY });

    expect(config.ok).toBe(false);
    if (!config.ok) {
      expect(config.variable).toBe("AI_INTEGRATIONS_OPENAI_BASE_URL");
      expect(config.message).toContain("AI_INTEGRATIONS_OPENAI_BASE_URL");
      expect(config.message).toContain("README");
    }
  });

  it("rejects a base URL that is not a URL, instead of crashing the SDK later", () => {
    for (const baseUrl of ["not a url", "api.openai.com/v1", "ftp://example.com/v1"]) {
      const config = readProviderConfig({ OPENAI_API_KEY: REAL_KEY, AI_INTEGRATIONS_OPENAI_BASE_URL: baseUrl });

      expect(config.ok).toBe(false);
      if (!config.ok) {
        expect(config.variable).toBe("AI_INTEGRATIONS_OPENAI_BASE_URL");
        expect(config.message).toContain("README");
        // A scheme-less value is pointed at the correct shape rather than echoed;
        // the message's own example URL is the only URL it ever contains.
        expect(config.message).not.toContain(`"${baseUrl}"`);
      }
    }
  });

  it("does not treat the placeholder base URL shape as a valid URL", () => {
    const config = readProviderConfig({
      OPENAI_API_KEY: REAL_KEY,
      AI_INTEGRATIONS_OPENAI_BASE_URL: "REPLACE_WITH_YOUR_BASE_URL",
    });

    expect(config.ok).toBe(false);
    if (!config.ok) expect(config.variable).toBe("AI_INTEGRATIONS_OPENAI_BASE_URL");
  });
});

describe("key-shape check keyed to the base URL (BUG-021)", () => {
  const GOOGLE_COMPAT_BASE =
    "https://generativelanguage.googleapis.com/v1beta/openai/";
  const GROQ_BASE = "https://api.groq.com/openai/v1";

  /** Sentinel tail: any of it appearing in an output would leak key material. */
  const SENTINEL = "FakeKeySentinel0123456789";
  const FOREIGN_KEYS: Array<[label: string, value: string]> = [
    ["a Google/\"AQ.\" key", `AQ.${SENTINEL}`],
    ["a Google AI Studio key", `AIza${SENTINEL}`],
    ["a Groq key", `gsk_${SENTINEL}`],
    ["an Anthropic key", `sk-ant-api03-${SENTINEL}`],
    ["an xAI key", `xai-${SENTINEL}`],
  ];

  it("accepts an OpenAI-shaped key at the OpenAI default — the tested-by-config OpenAI example", () => {
    const config = readProviderConfig({
      OPENAI_API_KEY: REAL_KEY,
      AI_INTEGRATIONS_OPENAI_BASE_URL: DEFAULT_OPENAI_BASE_URL,
    });
    expect(config.ok).toBe(true);
    if (config.ok) expect(config.baseUrl).toBe(DEFAULT_OPENAI_BASE_URL);
  });

  it("refuses every clearly-other-provider key at the OpenAI default", () => {
    for (const [, value] of FOREIGN_KEYS) {
      const config = readProviderConfig({
        OPENAI_API_KEY: value,
        AI_INTEGRATIONS_OPENAI_BASE_URL: DEFAULT_OPENAI_BASE_URL,
      });
      expect(config.ok).toBe(false);
    }
  });

  it.each(FOREIGN_KEYS)(
    "refuses %s at the OpenAI default with the " +
      "wrong-provider message and no key material",
    (_label, value) => {
      // Explicit default and unset (unset means "the SDK default = OpenAI").
      for (const env of [
        { OPENAI_API_KEY: value, AI_INTEGRATIONS_OPENAI_BASE_URL: DEFAULT_OPENAI_BASE_URL },
        { OPENAI_API_KEY: value },
        // The base-URL alias goes through the same rule.
        { OPENAI_API_KEY: value, OPENAI_BASE_URL: DEFAULT_OPENAI_BASE_URL },
      ]) {
        const config = readProviderConfig(env);
        expect(config.ok).toBe(false);
        if (config.ok) continue;
        expect(config.variable).toBe("OPENAI_API_KEY");
        expect(config.message).toContain("OPENAI_API_KEY");
        expect(config.message).toContain("does not look like an OpenAI key");
        expect(config.message).toContain('start with "sk-"');
        expect(config.message).toContain("OPENAI_BASE_URL");
        expect(config.message).toContain("model variables");
        expect(config.message).toContain('"Choosing an AI provider"');
        expect(config.message).toContain("README");
        // Never any part of the value: not the value, not its tail, and not
        // even the fixed foreign prefixes the detection matched on.
        expect(config.message).not.toContain(value);
        expect(config.message).not.toContain(SENTINEL);
        expect(config.message).not.toContain(SENTINEL.slice(0, 8));
        for (const prefix of FOREIGN_PROVIDER_PREFIXES) {
          expect(config.message).not.toContain(prefix);
        }
      }
    },
  );

  it("also refuses an unrecognised non-sk key at the OpenAI default", () => {
    const value = "test-key-not-openai-shaped";
    const config = readProviderConfig({
      OPENAI_API_KEY: value,
      AI_INTEGRATIONS_OPENAI_BASE_URL: DEFAULT_OPENAI_BASE_URL,
    });

    expect(config.ok).toBe(false);
    if (!config.ok) {
      expect(config.message).toContain('does not start with "sk-"');
      expect(config.message).toContain(
        "base URL points at OpenAI (or is unset)",
      );
      expect(config.message).toContain('"Choosing an AI provider"');
      expect(config.message).not.toContain(value);
    }
  });

  it("skips the shape rule for any other base URL — every provider has its own key format", () => {
    const combinations: Array<[key: string, base: string]> = [
      [`AQ.${SENTINEL}`, GOOGLE_COMPAT_BASE],
      [`AIza${SENTINEL}`, GOOGLE_COMPAT_BASE],
      [`gsk_${SENTINEL}`, GROQ_BASE],
      ["any-proxy-key-without-a-known-prefix", "https://proxy.internal/v1"],
    ];
    for (const [key, base] of combinations) {
      const config = readProviderConfig({
        OPENAI_API_KEY: key,
        AI_INTEGRATIONS_OPENAI_BASE_URL: base,
      });
      expect(config.ok).toBe(true);
    }
  });

  it("accepts the Google Gemini example exactly as documented (tested-by-config)", () => {
    const config = readProviderConfig({
      OPENAI_API_KEY: `AIza${SENTINEL}`,
      AI_INTEGRATIONS_OPENAI_BASE_URL: GOOGLE_COMPAT_BASE,
    });
    expect(config.ok).toBe(true);
    if (config.ok) expect(config.baseUrl).toBe(GOOGLE_COMPAT_BASE);
  });

  it("honours the OPENAI_BASE_URL alias for the configured value", () => {
    const config = readProviderConfig({
      OPENAI_API_KEY: REAL_KEY,
      OPENAI_BASE_URL: DEFAULT_OPENAI_BASE_URL,
    });
    expect(config.ok).toBe(true);
    if (config.ok) expect(config.baseUrl).toBe(DEFAULT_OPENAI_BASE_URL);
  });

  it("orders placeholder detection before the shape rule", () => {
    const config = readProviderConfig({
      OPENAI_API_KEY: "replace-with-your-key",
      // No base URL at all: the placeholder message must win, not the shape one.
    });
    expect(config.ok).toBe(false);
    if (!config.ok) expect(config.message).toContain("placeholder");
  });
});

describe("provider diagnostics helpers (BUG-021)", () => {
  it("classifies key prefixes with fixed literals only", () => {
    expect(looksLikeOpenaiKey("sk-proj-abcdef")).toBe(true);
    expect(looksLikeOpenaiKey("sk-abcdef")).toBe(true);
    expect(looksLikeOpenaiKey("sk-ant-api03-x")).toBe(false);
    expect(looksLikeOpenaiKey("AQ.x")).toBe(false);
    expect(looksLikeOpenaiKey("test-key")).toBe(false);

    expect(isForeignProviderKey("AIzaSyExample")).toBe(true);
    expect(isForeignProviderKey("gsk_abc")).toBe(true);
    expect(isForeignProviderKey("sk-ant-api03")).toBe(true);
    expect(isForeignProviderKey("sk-proj-abc")).toBe(false);
    expect(isForeignProviderKey("anything-else")).toBe(false);

    expect(keyPrefixClass("sk-proj-abcdef")).toBe("key starts with sk-");
    expect(keyPrefixClass("sk-ant-api03-abc")).toBe("key starts with sk-ant-");
    expect(keyPrefixClass("gsk_abcdef")).toBe("key starts with gsk_");
    expect(keyPrefixClass("AIzaSyabcdef")).toBe("key starts with AIza");
    expect(keyPrefixClass("AQ.abcdef")).toBe("key starts with AQ.");
    expect(keyPrefixClass("xai-abcdef")).toBe("key starts with xai-");
    expect(keyPrefixClass("custom-warehouse-key")).toBe(
      "key does not start with sk-",
    );
    expect(keyPrefixClass("")).toBe("key does not start with sk-");
    // The classification never carries characters beyond the fixed prefix.
    expect(keyPrefixClass("gsk_SUPERSECRETVALUE")).toBe("key starts with gsk_");
  });

  it("resolves the per-feature model variables with the historic defaults", () => {
    expect(chatModel({})).toBe(DEFAULT_CHAT_MODEL);
    expect(imageModel({})).toBe(DEFAULT_IMAGE_MODEL);
    expect(chatModel({ OPENAI_CHAT_MODEL: " gemini-2.0-flash " })).toBe(
      "gemini-2.0-flash",
    );
    expect(imageModel({ OPENAI_IMAGE_MODEL: " gemini-image-generation " })).toBe(
      "gemini-image-generation",
    );
    // Blank values fall back instead of sending an empty model name.
    expect(chatModel({ OPENAI_CHAT_MODEL: "   " })).toBe(DEFAULT_CHAT_MODEL);
  });

  it("reports the provider host, defaulting to OpenAI when unset", () => {
    expect(providerHost({})).toBe("api.openai.com");
    expect(
      providerHost({
        AI_INTEGRATIONS_OPENAI_BASE_URL:
          "https://generativelanguage.googleapis.com/v1beta/openai/",
      }),
    ).toBe("generativelanguage.googleapis.com");
    expect(providerHost({ OPENAI_BASE_URL: "https://api.groq.com/openai/v1" })).toBe(
      "api.groq.com",
    );
    expect(providerHost({ AI_INTEGRATIONS_OPENAI_BASE_URL: "nope" })).toBe(
      "(invalid base URL)",
    );
  });

  it("gates the image feature only on known-unsupported providers", () => {
    expect(
      providerSupportsImages({
        AI_INTEGRATIONS_OPENAI_BASE_URL:
          "https://generativelanguage.googleapis.com/v1beta/openai/",
      }),
    ).toBe(false);
    // Unset (OpenAI default), Groq and anything custom: attempt the call —
    // untested combinations are discovered at call time (404/405/501).
    expect(providerSupportsImages({})).toBe(true);
    expect(providerSupportsImages({ OPENAI_BASE_URL: "https://api.groq.com/openai/v1" })).toBe(
      true,
    );
    expect(
      providerSupportsImages({ AI_INTEGRATIONS_OPENAI_BASE_URL: "https://proxy.internal/v1" }),
    ).toBe(true);
  });

  it("keeps the feature copy a fixed, friendly string", () => {
    expect(IMAGE_GENERATION_UNAVAILABLE_MESSAGE).toBe(
      "Image generation is not available with the current AI provider.",
    );
  });
});
