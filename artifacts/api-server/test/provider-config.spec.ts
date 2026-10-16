// @vitest-environment node
// BUG-014: the provider settings must be really configured before the server
// listens. These tests pin the three cases the check exists for — empty,
// placeholder, valid-looking — plus the rule that the offending value is never
// echoed back in the message.
import { describe, expect, it } from "vitest";
import { isPlaceholderValue, readProviderConfig } from "../src/lib/provider-config";

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
