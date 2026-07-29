---
name: Groq as OpenAI-compatible backend
description: The OPENAI_API_KEY secret holds a Groq key (gsk_ prefix). The AI_INTEGRATIONS_OPENAI_BASE_URL must be set to https://api.groq.com/openai/v1 (not the OpenAI default). All three integration client files (client.ts, image/client.ts, audio/client.ts) were patched to fall back to OPENAI_API_KEY when AI_INTEGRATIONS_OPENAI_API_KEY is absent.
---

## Rule
The project uses a Groq API key stored as `OPENAI_API_KEY` (starts with `gsk_`). Set `AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.groq.com/openai/v1`. Use Groq-compatible models (e.g. `llama-3.3-70b-versatile`) — not OpenAI model names.

**Why:** The user declined the Replit AI Integrations upgrade and provided their own Groq key. Groq is OpenAI SDK-compatible but requires its own base URL and model names.

**How to apply:** Any time you add a new model call in `artifacts/api-server`, use `llama-3.3-70b-versatile` (or another Groq model). Image generation uses `gpt-image-1` via the Groq endpoint — verify it's supported or fall back to a stub. `AI_INTEGRATIONS_OPENAI_BASE_URL` must be set to the Groq URL for the server to start; if it's missing or wrong, OpenAI client throws `Invalid URL` or `401`.
