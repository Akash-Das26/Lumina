# Features

Living document: update statuses and add entries whenever features change. Never delete history; append or update.

## Summary

| Feature | Status | Files involved | Last updated |
|---|---|---|---|
| Chat with streaming responses | Done | artifacts/lumina/src/pages/chat-conversation.tsx, artifacts/lumina/src/lib/stream-message.ts, artifacts/api-server/src/routes/openai/index.ts | 2026-10-02 |
| Five AI modes | Done | artifacts/lumina/src/lib/modes.ts, artifacts/lumina/src/components/mode-selector.tsx, artifacts/api-server/src/routes/openai/index.ts | 2026-10-02 |
| Source-backed Search | Done | artifacts/api-server/src/routes/openai/index.ts (`searchPublicSources`), artifacts/lumina/src/pages/chat-conversation.tsx | 2026-10-02 |
| Image generation API (backend) | Done | artifacts/api-server/src/routes/openai/index.ts, lib/integrations-openai-ai-server/src/image/ | 2026-10-02 |
| Image generation UI | Planned | (no frontend caller of `POST /api/openai/generate-image` yet) | 2026-10-02 |
| Voice / audio integrations | Planned | lib/integrations-openai-ai-server/src/audio/, lib/integrations-openai-ai-react/src/audio/ | 2026-10-02 |
| Document context (attachments) | Done | artifacts/lumina/src/pages/chat-conversation.tsx | 2026-10-02 |
| Conversation persistence | Done | lib/db/src/schema/conversations.ts, lib/db/src/schema/messages.ts, artifacts/api-server/src/routes/openai/index.ts | 2026-10-02 (user-scoped + paginated) |
| Auto-titling conversations | Done | artifacts/api-server/src/routes/openai/index.ts | 2026-10-02 |
| Conversation exports (Markdown/JSON) | Done | artifacts/lumina/src/pages/chat-conversation.tsx (`exportConversation`) | 2026-10-02 |
| Usage stats API | Done | artifacts/api-server/src/routes/openai/index.ts (`GET /openai/stats`) | 2026-10-02 |
| Landing page + SEO | Done | artifacts/lumina/src/pages/landing.tsx, artifacts/lumina/src/lib/seo.ts | 2026-10-02 |
| Comparison hub (SEO) | Done | artifacts/lumina/src/pages/compare-hub.tsx, artifacts/lumina/src/pages/comparison.tsx, artifacts/lumina/src/lib/comparisons.ts, artifacts/lumina/src/lib/seo.ts | 2026-10-02 |
| Pricing page | Done | artifacts/lumina/src/pages/pricing.tsx | 2026-10-02 |
| Sign-in / Sign-up pages | Done | artifacts/lumina/src/pages/sign-in.tsx, artifacts/lumina/src/pages/sign-up.tsx, artifacts/lumina/src/lib/auth-provider.tsx, artifacts/lumina/src/components/auth-gate.tsx, artifacts/lumina/src/components/guest-only.tsx | 2026-10-02 |
| Authentication (backend) | Done | artifacts/api-server/src/routes/auth.ts, artifacts/api-server/src/lib/{session,password}.ts, lib/db/src/schema/users.ts | 2026-10-02 |
| Theme toggle | Done | artifacts/lumina/src/components/theme-toggle.tsx, artifacts/lumina/src/lib/theme-provider.tsx | 2026-10-02 |
| API health check | Done | artifacts/api-server/src/routes/health.ts | 2026-10-02 |
| API hardening (CORS allowlist, helmet, rate limits, 1MB body limit) | Done | artifacts/api-server/src/app.ts, artifacts/api-server/src/middleware/rate-limit.ts | 2026-10-02 |
| Dev launcher + API proxy | Done | scripts/dev-local.mjs | 2026-10-02 |
| Shared API client + fetch layer | Done | lib/api-client-react/src/custom-fetch.ts, lib/api-client-react/src/generated/ | 2026-10-02 |
| OpenAI-compatible integration library | Done | lib/integrations-openai-ai-server/src/client.ts | 2026-10-02 |
| Smoke tests | Done | artifacts/api-server/test/{app,auth,bug-002}.spec.ts, lib/api-client-react/test/custom-fetch.spec.ts | 2026-10-02 |

## Feature details

### Chat with streaming responses
Multi-turn AI chat. Backend streams model output to the browser as Server-Sent Events.
- **Status:** Done
- **How it works:** `POST /api/openai/conversations/:id/messages` persists the user message, loads the last 20 messages as history, prepends a mode-based system prompt, then calls the OpenAI-compatible provider with `stream: true` and writes `data: {...}` SSE frames. The frontend `streamMessage()` in stream-message.ts reads the stream with `res.body.getReader()` and fires `onChunk`/`onDone`/`onError`.
- **Key files/functions:** `artifacts/api-server/src/routes/openai/index.ts` (POST messages handler); `artifacts/lumina/src/lib/stream-message.ts` (`streamMessage`); `artifacts/lumina/src/pages/chat-conversation.tsx`
- **Inputs:** conversation id, message content, mode, optional context string (truncated to 24000 chars server-side). **Outputs:** SSE events `{content}` / `{error}` / `{done:true}`; assistant message persisted to DB. **Dependencies:** `@workspace/db`, `@workspace/integrations-openai-ai-server`, model `openai/gpt-oss-120b`, max_tokens 4096.
- **Known limitations:** provider model is hardcoded; provider failures *after* streaming has begun still arrive as an in-band SSE error frame (pre-stream failures return HTTP 502 as of BUG-002 fix, 2026-10-02).
- **Dates:** added 2026-07-29, last modified 2026-10-02

### Five AI modes
Chat, Search, Write, Artist, Translate — each changes the system prompt.
- **Status:** Done
- **How it works:** `modePrompts` map in the messages route selects a system prompt by mode; frontend mode selector sets the mode on new conversations.
- **Key files/functions:** `artifacts/lumina/src/lib/modes.ts` (`MODES`, `getModeById`), `artifacts/lumina/src/components/mode-selector.tsx`, `artifacts/api-server/src/routes/openai/index.ts` (`modePrompts`)
- **Inputs:** mode key. **Outputs:** different assistant persona. **Dependencies:** none beyond chat pipeline.
- **Known limitations:** "Artist" mode only shapes text prompts; it does not call the image API.
- **Dates:** added 2026-07-29, last modified 2026-10-02

### Source-backed Search
Live public web sources injected into the model context.
- **Status:** Done
- **How it works:** `GET /api/openai/search?q=` fetches Wikipedia opensearch API and DuckDuckGo Instant Answer API (max 6 sources), returns title/url/snippet/domain. The frontend (`chat-conversation.tsx` ~line 124-138) fetches sources when in Search mode and appends them to the message `context`.
- **Key files/functions:** `searchPublicSources` in artifacts/api-server/src/routes/openai/index.ts; chat-conversation.tsx context assembly
- **Inputs:** query string (min 2 chars). **Outputs:** `{query, sources[]}`. **Dependencies:** Wikipedia API, DuckDuckGo API (no API key needed).
- **Known limitations:** public APIs only; returns 502 when both fail; sources are appended as text, not citations UI.
- **Dates:** added 2026-07-29, last modified 2026-10-02

### Image generation API (backend)
Text-to-image endpoint returning base64 PNG.
- **Status:** Done
- **How it works:** `POST /api/openai/generate-image` validates `GenerateOpenaiImageBody` (zod), maps size to 1024x1024 / 1536x1024 / 1024x1536, calls `generateImageBuffer`, responds `{b64_json}`.
- **Key files/functions:** artifacts/api-server/src/routes/openai/index.ts; `generateImageBuffer` in lib/integrations-openai-ai-server/src/image/
- **Inputs:** prompt, optional size. **Outputs:** base64 image. **Dependencies:** OpenAI-compatible images API.
- **Known limitations:** no frontend caller yet; response held fully in memory (no streaming).
- **Dates:** added 2026-07-29, last modified 2026-10-02

### Image generation UI
- **Status:** Planned — wire Artist mode to `POST /api/openai/generate-image`.
- **Dates:** logged 2026-10-02

### Voice / audio integrations
Voice recorder and playback hooks plus server audio transcription client.
- **Status:** Planned (libraries exist, nothing in Lumina imports them — verified by search)
- **Key files:** lib/integrations-openai-ai-server/src/audio/, lib/integrations-openai-ai-react/src/audio/ (`useVoiceRecorder`, `useAudioPlayback`)
- **Dates:** logged 2026-10-02

### Document context (attachments)
User-supplied context (e.g. pasted document text) grounds answers.
- **Status:** Done
- **How it works:** chat-conversation.tsx builds a `context` string (attachments and/or live search sources) and sends it with the message; server truncates to 24000 chars and instructs the model to use it faithfully.
- **Key files/functions:** chat-conversation.tsx (context assembly ~L124-138), messages route (groundedPrompt)
- **Dates:** added 2026-07-29, last modified 2026-10-02

### Conversation persistence
Postgres storage of conversations and messages.
- **Status:** Done
- **How it works:** Drizzle ORM schema `conversations` and `messages` tables; REST CRUD under `/api/openai/conversations`.
- **Key files/functions:** lib/db/src/schema/conversations.ts, lib/db/src/schema/messages.ts, lib/db/src/index.ts (`Pool`), openai route handlers
- **Dependencies:** PostgreSQL (DATABASE_URL), drizzle-orm, pg
- **Known limitations:** conversations.userId is nullable for migration safety; legacy rows stay unowned unless AUTH_AUTO_PROVISION=1 is set before the first registration.
- **Dates:** added 2026-07-29, last modified 2026-10-02

### Auto-titling conversations
First user message becomes the conversation title.
- **Status:** Done
- **How it works:** after the assistant reply is persisted, if title is still "New Chat"/"New conversation", it is set to the first 60 chars of the user message.
- **Key files:** artifacts/api-server/src/routes/openai/index.ts
- **Dates:** added 2026-07-29, last modified 2026-10-02

### Conversation exports (Markdown/JSON)
Download a conversation as .md or .json.
- **Status:** Done
- **How it works:** client-side `exportConversation(format)` builds the body and triggers a Blob download.
- **Key files/functions:** `exportConversation` in chat-conversation.tsx (~L196-206)
- **Dates:** added 2026-07-29, last modified 2026-10-02

### Usage stats API
Aggregate counts and recent conversations.
- **Status:** Done
- **How it works:** `GET /api/openai/stats` returns totalConversations, totalMessages, 5 most recent conversations.
- **Key files:** artifacts/api-server/src/routes/openai/index.ts
- **Dates:** added 2026-07-29, last modified 2026-10-02

### Landing page + SEO
Marketing landing with metadata management.
- **Status:** Done
- **Key files/functions:** artifacts/lumina/src/pages/landing.tsx, artifacts/lumina/src/lib/seo.ts
- **Dates:** added 2026-07-29, last modified 2026-10-02

### Comparison hub (SEO)
"Lumina vs X" pages driven by static data.
- **Status:** Done
- **How it works:** comparison.tsx renders data from lib/comparisons.ts (Lumina strengths, competitor wins, verdict per competitor); compare-hub.tsx lists all comparisons.
- **Key files:** artifacts/lumina/src/pages/compare-hub.tsx, comparison.tsx, artifacts/lumina/src/lib/comparisons.ts
- **Dates:** added 2026-08-30, last modified 2026-10-02

### Pricing page
Static pricing tiers.
- **Status:** Done
- **Key files:** artifacts/lumina/src/pages/pricing.tsx
- **Dates:** added 2026-07-29, last modified 2026-10-02

### Sign-in / Sign-up pages
Working auth forms backed by the auth API, with route guards.
- **Status:** Done
- **How it works:** forms call `loginAuth`/`registerAuth` from the generated client, surface API error messages, and on success seed the `['auth','me']` query cache and navigate to /chat. AuthProvider exposes `{user, status, signOut}` via /api/auth/me; AuthGate guards /chat routes (redirects to /sign-in); GuestOnly redirects signed-in users to /chat.
- **Key files:** artifacts/lumina/src/pages/sign-in.tsx, sign-up.tsx, artifacts/lumina/src/lib/auth-provider.tsx, artifacts/lumina/src/components/auth-gate.tsx, guest-only.tsx, App.tsx
- **Dates:** added 2026-07-29, last modified 2026-10-02

### Authentication (backend)
Email/password auth with signed-cookie sessions and per-user data scoping.
- **Status:** Done
- **How it works:** `POST /api/auth/register|login` verify credentials (scrypt hashes, artifacts/api-server/src/lib/password.ts) and set an HMAC-signed `lumina_session` cookie (lib/session.ts, 30-day TTL, SESSION_SECRET env). `requireAuth` middleware gates all /api/openai routes and attaches `req.userId`; every conversation/message/stats query filters by it, and id-scoped routes 404 on other users' rows. GET conversations supports `?limit` (default 50, max 200) and `?cursor` (last id), newest first; GET messages same (default 200, max 1000, oldest first). `AUTH_AUTO_PROVISION=1` lets the first registered user adopt pre-auth conversations.
- **Key files:** artifacts/api-server/src/routes/auth.ts, artifacts/api-server/src/lib/{session,password}.ts, artifacts/api-server/src/routes/openai/index.ts, lib/db/src/schema/users.ts
- **Dependencies:** zod (api-server), drizzle-orm, Node crypto; SESSION_SECRET required in .env.
- **Known limitations:** no password reset, no rate limit on auth endpoints (login is brute-forceable in theory), sessions cannot be individually revoked (secret-wide only).
- **Dates:** added 2026-10-02, last modified 2026-10-02

### Theme toggle
Light/dark switching.
- **Status:** Done
- **Key files:** artifacts/lumina/src/components/theme-toggle.tsx, artifacts/lumina/src/lib/theme-provider.tsx
- **Dates:** added 2026-07-29, last modified 2026-10-02

### API health check
- **Status:** Done
- **How it works:** `GET /api/healthz` returns `{status:"ok"}`.
- **Key files:** artifacts/api-server/src/routes/health.ts
- **Dates:** added 2026-07-29, last modified 2026-10-02

### API hardening
CORS allowlist, helmet, 1MB body limit, per-route rate limits.
- **Status:** Done
- **How it works:** app.ts: same-origin CORS with optional `CORS_ORIGINS` env allowlist; `helmet()` defaults; `express.json({limit:"1mb"})`; `chatLimiter` (30/min) on search, generate-image, and conversations routes; `statsLimiter` (120/min) on stats.
- **Key files/functions:** artifacts/api-server/src/app.ts, artifacts/api-server/src/middleware/rate-limit.ts (`chatLimiter`, `statsLimiter`)
- **Dates:** added 2026-10-02, last modified 2026-10-02

### Dev launcher + API proxy
Single command starts API + Vite with /api proxying.
- **Status:** Done
- **How it works:** scripts/dev-local.mjs spawns API (API_PORT, default 8080) and Vite (WEB_PORT, default 5173), loads .env, proxies /api/*, shuts both down together.
- **Key files:** scripts/dev-local.mjs
- **Dates:** added 2026-08-30, last modified 2026-10-02

### Shared API client + fetch layer
Typed React Query client generated by orval plus a hardened fetch wrapper.
- **Status:** Done
- **How it works:** `customFetch` resolves base URL, merges headers, injects bearer tokens, parses JSON/text/blob responses, throws `ApiError`/`ResponseParseError`. Generated client in generated/.
- **Key files/functions:** lib/api-client-react/src/custom-fetch.ts (`customFetch`, `setBaseUrl`, `setAuthTokenGetter`, `ApiError`), lib/api-client-react/src/generated/api.ts
- **Dates:** added 2026-07-29, last modified 2026-10-02

### OpenAI-compatible integration library
Server-side provider client (chat, image, audio, batch).
- **Status:** Done
- **How it works:** reads `AI_INTEGRATIONS_OPENAI_API_KEY`/`OPENAI_API_KEY` and `AI_INTEGRATIONS_OPENAI_BASE_URL`; subpath exports for image/audio/batch.
- **Key files:** lib/integrations-openai-ai-server/src/client.ts, src/image/, src/audio/, src/batch/
- **Dates:** added 2026-07-29, last modified 2026-10-02

### Smoke tests
Vitest suites for the API and the fetch layer.
- **Status:** Done
- **How it works:** api-server boots the real Express app on an ephemeral port with db mocked (no Postgres needed); asserts healthz, 413 body limit, CORS blocking, 400 validation, helmet headers. api-client-react unit-tests `customFetch` behavior.
- **Key files:** artifacts/api-server/test/app.spec.ts, artifacts/api-server/test/helpers/server.ts, artifacts/api-server/vitest.config.ts, lib/api-client-react/test/custom-fetch.spec.ts, lib/api-client-react/vitest.config.ts
- **Dates:** added 2026-10-02, last modified 2026-10-02
