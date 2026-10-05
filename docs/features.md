# Features

Living document: update statuses and add entries whenever features change. Never delete history; append or update.

## Summary

| Feature | Status | Files involved | Last updated |
|---|---|---|---|
| Chat with streaming responses | Done | artifacts/lumina/src/pages/chat-conversation.tsx, artifacts/lumina/src/lib/stream-message.ts, artifacts/api-server/src/routes/openai/index.ts | 2026-10-02 |
| Five AI modes | Done | artifacts/lumina/src/lib/modes.ts, artifacts/lumina/src/components/mode-selector.tsx, artifacts/api-server/src/routes/openai/index.ts | 2026-10-03 |
| Source-backed Search | Done | artifacts/api-server/src/routes/openai/index.ts (`searchPublicSources`), artifacts/lumina/src/pages/chat-conversation.tsx | 2026-10-02 |
| Image generation API (backend) | Done | artifacts/api-server/src/routes/openai/index.ts, lib/integrations-openai-ai-server/src/image/ | 2026-10-03 |
| Image generation UI | Done | artifacts/lumina/src/pages/chat-conversation.tsx (Artist mode), artifacts/lumina/src/components/message-bubble.tsx, artifacts/lumina/src/components/image-lightbox.tsx, artifacts/lumina/src/lib/markdown.tsx | 2026-10-04 |
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
| Sign-out UI | Done | artifacts/lumina/src/pages/chat-conversation.tsx (account menu), artifacts/lumina/src/lib/auth-provider.tsx (`signOut`) | 2026-10-03 |
| Authentication (backend) | Done | artifacts/api-server/src/routes/auth.ts, artifacts/api-server/src/lib/{session,password}.ts, lib/db/src/schema/users.ts | 2026-10-03 (auth endpoints rate limited) |
| Theme toggle | Done | artifacts/lumina/src/components/theme-toggle.tsx, artifacts/lumina/src/lib/theme-provider.tsx | 2026-10-02 |
| API health check | Done | artifacts/api-server/src/routes/health.ts | 2026-10-02 |
| API hardening (CORS allowlist, helmet, rate limits, 1MB body limit) | Done | artifacts/api-server/src/app.ts, artifacts/api-server/src/middleware/rate-limit.ts | 2026-10-03 |
| Dev launcher + API proxy | Done | scripts/dev-local.mjs | 2026-10-02 |
| Shared API client + fetch layer | Done | lib/api-client-react/src/custom-fetch.ts, lib/api-client-react/src/generated/ | 2026-10-02 |
| OpenAI-compatible integration library | Done | lib/integrations-openai-ai-server/src/client.ts | 2026-10-02 |
| Smoke tests | Done | artifacts/api-server/test/{app,auth,bug-002,rate-limit,image,integration.pagination}.spec.ts, lib/api-client-react/test/custom-fetch.spec.ts | 2026-10-03 |
| Frontend component tests | Done | artifacts/lumina/vitest.config.ts, artifacts/lumina/test/setup.ts, artifacts/lumina/test/*.spec.tsx | 2026-10-04 |
| Browser verification harness | Done | scripts/browser/verify-lightbox.mjs, scripts/browser/verify-flow.mjs, scripts/browser/{lightbox-harness.tsx,index.html,stub-provider.mjs,cdp.mjs,chrome.mjs} | 2026-10-04 |
| Automated test suite in CI | **Missing** | .github/workflows/browser-tests.yml runs only typecheck + browser harnesses; `pnpm test` is not run in CI (Audit 3 F-01) | 2026-10-05 |

## Feature details

### Chat with streaming responses
Multi-turn AI chat. Backend streams model output to the browser as Server-Sent Events.
- **Status:** Done
- **How it works:** `POST /api/openai/conversations/:id/messages` persists the user message, loads the last 20 messages as history, prepends a mode-based system prompt, then calls the OpenAI-compatible provider with `stream: true` and writes `data: {...}` SSE frames. If the client disconnects mid-stream (`res` close before the response ended), the provider call is aborted via an AbortController signal and the partial assistant message is not persisted (Audit 3 F-04 / BUG-009, 2026-10-05). The frontend `streamMessage()` in stream-message.ts reads the stream with `res.body.getReader()` and fires `onChunk`/`onDone`/`onError`.
- **Key files/functions:** `artifacts/api-server/src/routes/openai/index.ts` (POST messages handler); `artifacts/lumina/src/lib/stream-message.ts` (`streamMessage`); `artifacts/lumina/src/pages/chat-conversation.tsx`
- **Inputs:** conversation id, message content, mode, optional context string (truncated to 24000 chars server-side). **Outputs:** SSE events `{content}` / `{error}` / `{done:true}`; assistant message persisted to DB. **Dependencies:** `@workspace/db`, `@workspace/integrations-openai-ai-server`, model `openai/gpt-oss-120b`, max_tokens 4096.
- **Known limitations:** provider model is hardcoded; provider failures *after* streaming has begun still arrive as an in-band SSE error frame (pre-stream failures return HTTP 502 as of BUG-002 fix, 2026-10-02).
- **Dates:** added 2026-07-29, last modified 2026-10-05 (client-disconnect abort, F-04)

### Five AI modes
Chat, Search, Write, Artist, Translate — each changes the system prompt.
- **Status:** Done
- **How it works:** `modePrompts` map in the messages route selects a system prompt by mode; frontend mode selector sets the mode on new conversations.
- **Key files/functions:** `artifacts/lumina/src/lib/modes.ts` (`MODES`, `getModeById`), `artifacts/lumina/src/components/mode-selector.tsx`, `artifacts/api-server/src/routes/openai/index.ts` (`modePrompts`)
- **Inputs:** mode key. **Outputs:** different assistant persona. **Dependencies:** none beyond chat pipeline.
- **Known limitations:** the frontend intercepts Artist mode and calls the image API directly (see Image generation UI); the messages route's `artist` system prompt is now only a fallback for direct API callers.
- **Dates:** added 2026-07-29, last modified 2026-10-03

### Source-backed Search
Live public web sources injected into the model context.
- **Status:** Done
- **How it works:** `GET /api/openai/search?q=` fetches Wikipedia opensearch API and DuckDuckGo Instant Answer API (max 6 sources), returns title/url/snippet/domain. The frontend (`chat-conversation.tsx`, handleSendMessage search branch) fetches sources when in Search mode and appends them to the message `context`.
- **Key files/functions:** `searchPublicSources` in artifacts/api-server/src/routes/openai/index.ts; chat-conversation.tsx context assembly
- **Inputs:** query string (min 2 chars). **Outputs:** `{query, sources[]}`. **Dependencies:** Wikipedia API, DuckDuckGo API (no API key needed).
- **Known limitations:** public APIs only; returns 502 when both fail; sources are appended as text, not citations UI. Wikipedia and DuckDuckGo are fetched concurrently (Audit 2 F-02); a slow or failing source no longer delays or drops the other's results.
- **Dates:** added 2026-07-29, last modified 2026-10-05 (concurrent source fetches)

### Image generation API (backend)
Text-to-image endpoint returning base64 image bytes with a sniffed media type (PNG/WebP/JPEG; PNG fallback).
- **Status:** Done
- **How it works:** `POST /api/openai/generate-image` validates `GenerateOpenaiImageBody` (zod), maps size to 1024x1024 / 1536x1024 / 1024x1536, calls `generateImageBuffer`, responds `{b64_json, media_type}` — `media_type` is sniffed from the bytes' magic signature (PNG/WebP/JPEG via `lib/image-media.ts`, PNG fallback; Audit 2 F-04), and the persisted assistant message's data URI carries the detected type. When an optional `conversationId` is supplied, ownership is checked first (404 for another user's conversation), the provider is called, and only on success are the user prompt and an assistant image message persisted together — a failed generation (502) leaves no orphaned prompt. Persisting also auto-titles a still-default conversation from the prompt. An optional `replaceMessageId` (requires `conversationId`; 400 otherwise) switches to regenerate-in-place: the target message is verified to belong to the conversation up front (404 otherwise) and its content is overwritten instead of inserting a new prompt/image pair.
- **Key files/functions:** artifacts/api-server/src/routes/openai/index.ts; `generateImageBuffer` in lib/integrations-openai-ai-server/src/image/
- **Inputs:** prompt, optional size, optional conversationId, optional replaceMessageId. **Outputs:** base64 image. **Dependencies:** OpenAI-compatible images API.
- **Known limitations:** response is held fully in memory (no streaming); persisted images are stored as base64 text in the messages table, so large galleries will bloat the row/DB.
- **Dates:** added 2026-07-29, last modified 2026-10-05 (media-type sniffing, F-04)

### Image generation UI
Artist mode generates an image from the user's prompt and renders it inline.
- **Status:** Done
- **How it works:** in chat-conversation.tsx, when the selected mode is `artist`, `handleSendMessage` calls the generated `useGenerateOpenaiImage` mutation with `{ prompt, conversationId }` instead of streaming text. While the call is in flight the assistant shows the `isGenerating` spinner state (MessageBubble); on success the `![Generated image](data:<media_type>;base64,...)` markdown (media type from the server's magic-byte sniff; `media_type` response field with client-side PNG fallback — Audit 2 F-04) renders as an inline `<img>` via markdown.tsx, then the conversation/list queries are invalidated and the optimistic temp messages are dropped once the refetched (now persisted) messages arrive. Errors surface as a destructive toast and remove only the placeholder. Clicking an image opens a shared full-size **lightbox** (`components/image-lightbox.tsx`, one `Dialog` instance owned by the chat page) that pages through every image in the conversation with prev/next buttons and ←/→ keys, zoom in/out/reset (0.5×–4× via buttons, +/− keys, or the scroll wheel — with ctrl held the wheel steps finely), a position counter, and a download button. Double-clicking the image toggles between fit (100%) and 2× (and recentres a panned image). A control-row legend spells out the gestures/shortcuts — `←`/`→` navigate, `+`/`−`/`0` zoom in/out/reset, `Esc` closes, `G` (shown while zoomed) begins drag-to-pan, and `Double-click ↻` toggles fit/2× — and each `<kbd>` carries an `aria-label` describing its action for screen readers. `Esc` also closes the lightbox. Past 100% the image can be dragged to pan (pointer events, clamped to the image overflow so an edge never detaches from the frame); pan and zoom reset when the image changes or zoom returns to 100%. Persisted images also show a control row: **Download** (client-side save of the data URI; the filename extension follows the URI's media type — `.png`/`.webp`/`.jpg` — instead of assuming PNG) and **Re-generate** (only when the message has an id) — the latter calls `handleRegenerateImage`, which sends the preceding user message as the prompt plus `replaceMessageId`, shows a per-message `isRegenerating` spinner, and re-invalidates the conversation.
- **Key files/functions:** artifacts/lumina/src/pages/chat-conversation.tsx (artist branch of `handleSendMessage`, `handleRegenerateImage`, `findPrecedingUserMessage`), artifacts/lumina/src/components/message-bubble.tsx (`isGenerating`, `isRegenerating`, `onRegenerate`, download), artifacts/lumina/src/lib/markdown.tsx (image markdown)
- **Inputs:** a text prompt typed in Artist mode. **Outputs:** an inline rendered image, persisted server-side, with download/re-generate controls. **Dependencies:** `POST /api/openai/generate-image`.
- **Known limitations:** base64 images live in the message row (large galleries bloat the DB); download assumes PNG; re-generate is offered only for persisted messages (server-backed ids); the shortcut hints are always shown while the lightbox is open (they cannot be dismissed); re-generate has no per-message undo.
- **Dates:** logged 2026-10-02 (docs had it as Planned; the caller existed but did not persist), last modified 2026-10-04 (persistence + controls + shared lightbox with navigation, zoom, drag-to-pan, scroll-wheel zoom, double-click fit/2× toggle, keyboard shortcuts incl. `Esc` close, and accessible shortcut hints); zoom/pan/double-click/Escape verified in real Chrome 151 via CDP, plus the full sign-up → image generation → lightbox flow end-to-end against the live dev stack, and touch/pointer panning with simulated touch input, 2026-10-04 (Session 17)

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

### Sign-out UI
Account menu in the chat header with a sign-out action.
- **Status:** Done
- **How it works:** the chat header (right side, next to the mode selector) shows an avatar dropdown with the signed-in user's name and email and a "Sign out" item. It calls `AuthProvider.signOut` (POST /api/auth/logout), which clears the `['auth','me']` cache and invalidates user-scoped queries; AuthGate then sees status `unauthenticated` and redirects to /sign-in. Failures surface a destructive toast and the button re-enables.
- **Key files/functions:** artifacts/lumina/src/pages/chat-conversation.tsx (`handleSignOut`), artifacts/lumina/src/lib/auth-provider.tsx (`signOut`), artifacts/lumina/src/components/auth-gate.tsx
- **Dates:** added 2026-10-03

### Authentication (backend)
Email/password auth with signed-cookie sessions and per-user data scoping.
- **Status:** Done
- **How it works:** `POST /api/auth/register|login` verify credentials (scrypt hashes, artifacts/api-server/src/lib/password.ts) and set an HMAC-signed `lumina_session` cookie (lib/session.ts, 30-day TTL, SESSION_SECRET env). `requireAuth` middleware gates all /api/openai routes and attaches `req.userId`; every conversation/message/stats query filters by it, and id-scoped routes 404 on other users' rows. GET conversations supports `?limit` (default 50, max 200) and `?cursor` (last id), newest first; GET messages same (default 200, max 1000, oldest first). `AUTH_AUTO_PROVISION=1` lets the first registered user adopt pre-auth conversations.
- **Key files:** artifacts/api-server/src/routes/auth.ts, artifacts/api-server/src/lib/{session,password}.ts, artifacts/api-server/src/routes/openai/index.ts, lib/db/src/schema/users.ts
- **Dependencies:** zod (api-server), drizzle-orm, Node crypto; SESSION_SECRET required in .env.
- **Known limitations:** no password reset; sessions cannot be individually revoked (secret-wide only). Login/register are now rate limited — see API hardening.
- **Dates:** added 2026-10-02, last modified 2026-10-03 (auth limiters)

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
- **How it works:** app.ts: same-origin CORS with optional `CORS_ORIGINS` env allowlist; `helmet()` defaults; `express.json({limit:"1mb"})`; `chatLimiter` (30/min) on search, generate-image, and conversations routes; `statsLimiter` (120/min) on stats; `authLimiter` (10 failed logins / 15 min per IP, successful logins not counted) on `/api/auth/login`; `registerLimiter` (10 accounts / 60 min per IP, all attempts counted) on `/api/auth/register`. `/api/auth/me` stays unlimited (frequent cheap read).
- **Key files/functions:** artifacts/api-server/src/app.ts, artifacts/api-server/src/middleware/rate-limit.ts (`chatLimiter`, `statsLimiter`, `authLimiter`, `registerLimiter`)
- **Dates:** added 2026-10-02, last modified 2026-10-03 (auth limiters)

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

### Frontend component tests
Vitest + React Testing Library coverage for the Lumina UI, wired into the root `pnpm test`.
- **Status:** Done
- **How it works:** `artifacts/lumina/vitest.config.ts` is a dedicated config (so tests never import vite.config.ts, which hard-requires PORT/BASE_PATH and the Replit plugins) using the jsdom environment, the `@vitejs/plugin-react` transform, the `@/*` alias, and `test/setup.ts` (jest-dom matchers; matchMedia/ResizeObserver/scrollIntoView/PointerEvent shims; explicit RTL cleanup). Tests live in `test/*.spec.tsx`, kept out of the app tsconfig (same convention as api-client-react). `package.json` gains `test: vitest run`, so the root `pnpm test` picks it up.
- **Covers:** markdown rendering; ChatInput submit/keyboard/disabled behavior; MessageBubble (plain text, generating state, image + lightbox open, download, conditional re-generate); ImageLightbox (closed state, counter, boundary-disabled arrows, click/keyboard navigation, button + scroll-wheel zoom with ctrl fine step and clamping, double-click fit↔2× toggle, drag-to-pan with clamping, zoom/pan reset when switching images, close); and the auth flows — AuthGate/GuestOnly guards (loading/authenticated/unauthenticated + redirects), AuthProvider (status derivation from /auth/me, 401 vs unexpected error, signOut clearing user + invalidating caches), and the sign-in and sign-up forms (success seeds the auth cache and navigates, API error display, generic fallback, pending/disabled state); the chat header account menu (hidden when signed out, name/email display, sign-out fires once, disabled/"Signing out…" while pending, failure toast + re-enable); the conversation list sidebar (new-chat button, loading skeleton, empty state, sorted list + active highlight, delete invalidation); and the image lightbox keyboard shortcuts (navigate/zoom hints backed by real key handlers, `Esc` to close, and accessible `aria-label`s on every hint `<kbd>` plus the always-visible double-click-toggle hint).
- **Key files:** artifacts/lumina/vitest.config.ts, artifacts/lumina/test/setup.ts, artifacts/lumina/test/{markdown,chat-input,message-bubble,image-lightbox,auth-gate,guest-only,auth-provider,sign-in,sign-up,chat-header,conversation-list}.spec.tsx
- **Dates:** added 2026-10-03 (Session 11); extended with auth-flow tests 2026-10-03 (Session 14); sign-up, lightbox double-click, chat-header sign-out, conversation-list, and lightbox keyboard-shortcut coverage 2026-10-03 (Session 15 + 16); accessible shortcut labels + double-click hint and zoom reset-on-image-change test 2026-10-04 (Session 17)

### Browser verification harness
Two real-browser checks driven over the Chrome DevTools Protocol with genuine input events.
- **Status:** Done
- **How it works:** `pnpm verify:lightbox` bundles `lightbox-harness.tsx` (which mounts the real `ImageLightbox`) with esbuild, serves it on an ephemeral port and drives headless Chrome (ephemeral DevTools port). `pnpm verify:flow` stands up a throwaway stack — ephemeral PostgreSQL, the real API server + Vite via `scripts/dev-local.mjs`, and the stub image provider — and drives Chrome through the actual app. Both share `cdp.mjs`/`chrome.mjs`, print a JSON report and exit non-zero on any regression. `verify:flow` skips (exit 0) when PostgreSQL/Chrome are missing unless `REQUIRE=1`. Requires Node 22+ (global `WebSocket`).
- **Covers:** (lightbox) wheel zoom incl. Ctrl fine step, double-click fit↔2× toggle, keyboard `0`/`←`/`→`/`Esc`, drag-to-pan with clamping, gallery navigation (buttons + arrow keys, counter, boundary-disabled arrows, distinct images, zoom/pan reset on navigate) and touch behaviour (`touch-action` gating, touch panning + clamping, real touch pointer events); (flow) sign-up → Artist conversation → image generation → lightbox open/zoom/Escape, asserting HTTP 201/201/200 and no page exceptions.
- **Key files:** scripts/browser/verify-lightbox.mjs, scripts/browser/verify-flow.mjs, scripts/browser/lightbox-harness.tsx, scripts/browser/index.html, scripts/browser/stub-provider.mjs, scripts/browser/{cdp,chrome}.mjs, scripts/browser/README.md
- **Dates:** added 2026-10-04 (Session 17)

### Smoke tests
Vitest suites for the API and the fetch layer, plus env-gated DB integration tests.
- **Status:** Done
- **How it works:** api-server boots the real Express app on an ephemeral port with db mocked (no Postgres needed); asserts healthz, 413 body limit, CORS blocking, 400 validation, helmet headers, auth flows, auth rate limiting (429 after the limit; successful logins not counted), image persistence/ownership/502 paths, and SSE failure paths. integration.pagination.spec.ts additionally runs against a real Postgres when `E2E_DATABASE_URL` is set (skipped otherwise) and asserts cursor pagination order/monotonicity/no-repeats plus per-user isolation. api-client-react unit-tests `customFetch` behavior.
- **Key files:** artifacts/api-server/test/app.spec.ts, auth.spec.ts, bug-002.spec.ts, rate-limit.spec.ts, image.spec.ts, integration.pagination.spec.ts, artifacts/api-server/test/helpers/server.ts, artifacts/api-server/vitest.config.ts, lib/api-client-react/test/custom-fetch.spec.ts, lib/api-client-react/vitest.config.ts
- **Dates:** added 2026-10-02, last modified 2026-10-03 (Session 6: auth rate-limit suite)
