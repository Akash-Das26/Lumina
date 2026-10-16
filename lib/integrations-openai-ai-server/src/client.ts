import OpenAI from "openai";

const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

// Both are required before the first request could work, so the server refuses
// to start with a message naming the variable and where to set it.
if (!baseURL) {
  throw new Error(
    "AI_INTEGRATIONS_OPENAI_BASE_URL must be set in .env (see README → Run locally).",
  );
}

if (!apiKey) {
  throw new Error(
    "OPENAI_API_KEY (or AI_INTEGRATIONS_OPENAI_API_KEY) must be set in .env (see README → Run locally).",
  );
}

export const openai = new OpenAI({
  apiKey,
  baseURL,
});
