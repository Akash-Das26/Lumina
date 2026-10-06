# Bug Tracker

Summary table + Open / In Progress / Fixed sections. Never delete entries; move them between sections and fill in fix details.

## Summary

| ID | Title | Severity | Status | Found | Fixed |
|---|---|---|---|---|---|
| BUG-001 | Vulnerable transitive dependencies (18 advisories incl. 14 high in dev chain, qs prod) | Medium | Fixed | Audit 1 (2026-10-02) | 2026-10-02 (Session 1) |
| BUG-002 | SSE provider errors stream as mid-stream event instead of HTTP error status | Low | Fixed | Audit 1 / Session 1 review of routes/openai/index.ts | 2026-10-02 (Session 2) |
| BUG-003 | No DB pagination and no per-user ownership on conversations/messages | Low | Fixed | Audit 1 review of routes + db schema | 2026-10-02 (Session 3) |
| BUG-004 | Conversations cursor pagination repeated the first page (gt vs lt on desc order) | Medium | Fixed | Session 4 live verification (2026-10-02) | 2026-10-02 (Session 4) |
| BUG-005 | DELETE conversations route validated a body-polluted params object | Medium | Fixed | Audit 2 (2026-10-05) | 2026-10-05 (Session 18) |
| BUG-006 | CI never runs the vitest test suite (only typecheck + browser harnesses) | High | Fixed | Audit 3 (2026-10-05) | 2026-10-05 (Session 20) |
| BUG-007 | Rate limiters keyed on proxy IP; no `trust proxy` handling | Medium | Fixed | Audit 3 (2026-10-05) | 2026-10-05 (Session 20) |
| BUG-008 | GET conversation returns all messages; images persisted as base64 data URIs in message text | Medium | Fixed | Audit 3 (2026-10-05) | 2026-10-05 (Session 20) |
| BUG-009 | Abandoned SSE streams never aborted (billable provider work continues) | Medium | Fixed | Audit 3 (2026-10-05) | 2026-10-05 (Session 20) |
| BUG-010 | Unused root dependency `@replit/connectors-sdk` | Medium | Fixed | Audit 3 (2026-10-05) | 2026-10-05 (Session 20) |
| BUG-011 | Newly published dependency advisories (`proxy-addr` critical in prod, plus 5 dev-chain) | High | Fixed (partial: 9/10 patched; 1 dev-only no-patch accepted) | Audit 3 follow-up (2026-10-06) | 2026-10-06 (Session 20 follow-up) |

## Open

### BUG-011 — Newly published dependency advisories
- **Severity / Status:** High / **Fixed (partial)** — surfaced 2026-10-06 while re-running `pnpm audit` after the Audit 3 fixes; remediated 2026-10-06 (Session 20 follow-up, commit b8943d0). The affected lockfile versions were unchanged since Audit 3 — the advisory database simply gained entries after Audit 3 ran, so this is an external advisory change, not a regression from this branch.
- **Where (original):** `proxy-addr@2.0.7` — production transitive dep of `express@5.2.1` and `express-rate-limit@8.7.0` — GHSA-jqcg-44mw-7w3h, *critical*: "proxy-addr vulnerable to IP spoofing via IPv4-mapped IPv6 trust subnet". Dev chain: `tinypool` ×2 (GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr — critical), `source-map-js` (high), `fast-copy` and `postcss-selector-parser` (moderate). Plus `braces` (high, pre-existing Audit 3 four), `vitest`/`@vitest/mocker` (moderate), `esbuild` (low).
- **Symptom (before fix):** `pnpm audit` reported **10** advisories (3 critical, 2 high, 4 moderate, 1 low) where Audit 3 recorded 4. The `proxy-addr` one is directly relevant to the new rate-limit keying (BUG-007 / F-02): spoofable `req.ip` behind a proxy could undermine per-IP keys.
- **Fix applied:** `pnpm.overrides` added to `pnpm-workspace.yaml` (same-major bumps, matching the BUG-001 approach): `proxy-addr: 2.0.8`, `source-map-js: 1.2.2`, `fast-copy: 4.1.0`, `postcss-selector-parser: 7.1.6`. `esbuild` overridden to `0.28.2` (first patched release for GHSA-g7r4-m6w7-qqqr; the prior 0.27.3 was itself inside the advisory range). Vitest upgraded `3.2.x → 4.1.11` in root + `artifacts/api-server` + `artifacts/lumina` + `lib/api-client-react` (the moderate vitest/@vitest/mocker advisories resolve with the newer major; also fixes a latent stale-hoisted-symlink problem where a v3.2.7 symlink outside the lockfile had broken `@testing-library/jest-dom` matcher registration — resolved by `pnpm install --force` + removing the stale v3.2.7 dirs/symlink). `artifacts/api-server/test/app.spec.ts` also fixed in the same commit: its mock + import pointed at the nonexistent `../src/lib/db` instead of the `@workspace/db` path the source actually uses, with a factory that now covers `db.{select,insert,update,delete}`, `users`, `conversations`, `messages`, and `messageImages`.
- **Remaining advisory (accepted, not patched):** `braces@3.0.3` HIGH — GHSA-vfj7-8cjw-p6xm, "stack-exhaustion denial of service through deeply nested patterns" — via `artifacts__mockup-sandbox>fast-glob>micromatch>braces`. **Dev-only** (mockup-sandbox is a local design preview artifact, never deployed); `pnpm audit` shows **patched versions: None** — the upstream has published no patched release (last published 2024). The mRA gate (`minimumReleaseAge: 1440`) cannot install a nonexistent patch, and same-major override `braces@3.0.3 → 3.x` is a no-op. Accepted as a documented, non-runtime, dev-only exposure. If a patched braces release ever lands it will clear on the next `pnpm install`.
- **Result:** `pnpm audit` now reports **1** advisory (braces HIGH, dev-only, no patch). All other 9 advisories are patched.
- **Verified by:** whole-workspace `pnpm test` 175 passed + 5 skipped (6 api-client-react + 78 api-server incl. the app.spec.ts fix + 85 lumina); `pnpm typecheck` 0 errors; api-server, lumina, and mockup-sandbox production builds green; `pnpm audit` 1 remaining.
- **Related:** BUG-001 (earlier advisory sweep, same `pnpm.overrides` pattern); Audit 3 F-02 (rate-limit keying that made proxy-addr relevant); Session 20 + Session 20 follow-up (commit b8943d0).

## In Progress

_(none)_

## Fixed

### BUG-008 — GET conversation returned every message; images persisted as base64 data URIs
- **Severity / Status:** Medium / Fixed (2026-10-05, Session 20) — Audit 3 finding F-03; user-approved "Full fix" option.
- **Where:** artifacts/api-server/src/routes/openai/index.ts (GET conversation; generate-image; new GET images); lib/db/src/schema/message-images.ts (new table); lib/api-spec/openapi.yaml; artifacts/lumina/src/{lib/markdown.tsx, components/message-bubble.tsx, pages/chat-conversation.tsx}.
- **Symptom:** `GET /openai/conversations/:id` fetched every message on every load, and each generated image was persisted as a ~1.5 MB base64 `data:` URI inside `messages.content` — so an image-heavy conversation shipped megabytes per load, was re-rendered on every refetch, and replayed the raw data URIs into the provider context on later turns (the messages route slices the last 20 rows).
- **Root cause:** the GET conversation handler had no bound (the list endpoints were paginated in BUG-003 but this one was missed), and generated images were written directly into the message text by the generate-image handler instead of a blob store.
- **Fix applied:**
  - **Bounded conversation fetch:** `GET /openai/conversations/:id` now returns the conversation plus the newest `limit` messages (default 50, max 200 via `?limit`, oldest-first in the payload) with a `nextCursor` when older history remains; `?cursor=<id>` (an id older than the window) pages further back. The chat page shows a **Load earlier messages** button while a cursor is present, prepending each fetched page.
  - **Image blobs out of message text:** new `message_images` table (messageId FK cascade, mediaType, base64 `data`, created-at, indexed by message). Generated bytes are stored there and the assistant message keeps only a short reference `![Generated image](/api/openai/images/<id>.<ext>)`; regenerate deletes the previous image row before attaching the new one. New owner-scoped `GET /api/openai/images/:id` serves the bytes with the stored media type and a private cache header (404 — indistinguishable from missing — for another user's image; the id may carry an `.ext` suffix for a faithful download filename).
  - **Frontend:** markdown.tsx renders both `data:image/*` and the same-origin `/api/openai/images/<id>[.ext]` reference (external URLs stay plain text, preserving Audit 3 F-12); the inline Download control derives the extension from a data URI's media type or the reference's suffix.
  - **Contract:** openapi.yaml gained the conversation query params + `nextCursor` and the `/openai/images/{id}` path; orval codegen regenerated api-zod + api-client-react (with the `<Op>Params` star-export disambiguation added for `GetOpenaiConversationParams`, same orval quirk as BUG-003). README notes that existing databases must re-run `pnpm db:push` to add `message_images` and that pre-change inline `data:` images still render (no backfill).
- **Test added:** `test/conversation-pagination.spec.ts` (6 tests: newest window oldest-first + nextCursor, null cursor at history start, `?cursor` paging, empty conversation, out-of-range limit 400, ownership 404); `test/message-images.spec.ts` (5 tests: bytes + media type, `.ext` id, non-owner 404, non-numeric id 404 without a DB read, 401 unauthenticated); `test/image.spec.ts` reworked for `message_images` persistence (assistant placeholder + image row + short reference, WebP `.webp` suffix, regenerate deletes the old blob, plus the existing ownership/502/400 paths); `integration.pagination.spec.ts` (env-gated) gained real-SQL windowed paging and image-ownership cases; frontend `test/chat-pagination.spec.tsx` (2), plus cases added to markdown.spec.tsx and message-bubble.spec.tsx.
- **Verified by:** api-server suite 74 passed + 4 env-gated skipped; whole-workspace `pnpm test` 163 passed + 4 skipped; `pnpm typecheck` 0 errors; api-server production build green; lumina production build green (with PORT/BASE_PATH). Failing-first verified by reverting the route to HEAD: 11 of the new/updated tests fail. Commit b6e89d2.
- **Limitation:** the env-gated integration cases were not run here (no Postgres/E2E_DATABASE_URL); the mocked specs assert handler logic, not real SQL ordering.
- **Related:** Audit 3 F-03; BUG-003 (list pagination precedent); BUG-004; Session 20; features.md "Conversation persistence", "Image generation API (backend)", "Image generation UI".

### BUG-007 — Rate limiters keyed on proxy IP; no `trust proxy` handling
- **Severity / Status:** Medium / Fixed (2026-10-05, Session 20) — Audit 3 finding F-02; user-approved "env-tunable" option.
- **Where:** artifacts/api-server/src/app.ts (limiter mounting + `trust proxy`); artifacts/api-server/src/middleware/rate-limit.ts (key generator); artifacts/api-server/src/routes/openai/index.ts (limiter mount point); .env.example (`TRUST_PROXY_HOPS`).
- **Symptom:** behind the Vite dev proxy or any reverse proxy, `req.ip` was the proxy address, so every client shared one bucket for chatLimiter (30/min), authLimiter (10/15 min) and registerLimiter (10/h) — lockout risk and lost per-user throttling.
- **Root cause:** two independent gaps. (1) No `app.set("trust proxy", ...)` anywhere, so Express ignored `X-Forwarded-For` and reported the proxy socket address as `req.ip`. (2) `chatLimiter` was mounted in app.ts *before* the router and therefore before `requireAuth`, so its key generator ran while `req.userId` was still unset — user-scoped keying was impossible regardless of the generator.
- **Fix applied:**
  - `TRUST_PROXY_HOPS` env (default 0 = direct, safe) reads an integer hop count; when > 0 the server calls `app.set("trust proxy", hops)` so `req.ip` is the XFF entry that many hops in. Documented in .env.example.
  - The cost-bearing `chatLimiter` is no longer mounted in app.ts. It is mounted inside the openai router immediately after `requireAuth`, path-scoped to the AI routes (`/openai/conversations`, `/openai/search`, `/openai/generate-image`) so the cheap `/openai/stats` read keeps only `statsLimiter`. Its `keyGenerator` now composes the signed-in user id with the client IP — `u<userId>:<ipKeyGenerator(req.ip)>` — falling back to IP alone. `ipKeyGenerator` (express-rate-limit v8) normalises IPv6 to /64 so clients cannot rotate within a subnet. Pre-auth limiters (`statsLimiter`, `authLimiter`, `registerLimiter`) stay IP-keyed deliberately (no user to key on; keying login failures on the target account would hand attackers a lockout lever).
- **Test added:** artifacts/api-server/test/rate-limit-keying.spec.ts (3 tests): (1) with `TRUST_PROXY_HOPS=1`, requests from distinct X-Forwarded-For addresses get independent buckets; (2) a second signed-in user sharing the proxy IP keeps their own bucket after the first exhausts theirs (this test fails with an IP-only key — verified by temporarily reverting the generator to `ipKeyGenerator(req.ip)`); (3) a single user still gets 429 after exceeding 30/min.
- **Verified by:** api-server suite 58 passed + 2 env-gated skipped; whole-workspace `pnpm test` 141 passed + 2 skipped; `pnpm typecheck` 0 errors; api-server production build green. Commit bcc3081.
- **Related:** Audit 3 F-02; session-cookie auth from BUG-003; Session 20.

### BUG-010 — Unused root dependency `@replit/connectors-sdk`
- **Severity / Status:** Medium / Fixed (2026-10-05, Session 20) — Audit 3 finding F-05.
- **Where:** package.json — `"dependencies": { "@replit/connectors-sdk": "^0.4.1" }`.
- **Symptom:** the root workspace carried a production dependency that no code used; every install paid its download/install cost and it stayed in the audit surface.
- **Root cause:** leftover from the Replit-hosted era; the deployment no longer uses Replit connectors, and `grep -rn "@replit/connectors-sdk" artifacts lib scripts .github` returned zero references (nothing in the lockfile depends on it either).
- **Fix applied:** `pnpm remove @replit/connectors-sdk` (empty root `dependencies` block removed from package.json, lockfile pruned). CI/deploy workflows reviewed — no step referenced the package.
- **Verified by:** whole-workspace `pnpm test` exit 0 (125 passed + 2 env-gated skipped); `pnpm typecheck` 0 errors; api-server production build green. Commit 7888739.
- **Related:** Audit 3 F-05; Session 20.

### BUG-009 — Abandoned SSE streams never aborted
- **Severity / Status:** Medium / Fixed (2026-10-05, Session 20) — Audit 3 finding F-04.
- **Where:** artifacts/api-server/src/routes/openai/index.ts — POST /openai/conversations/:id/messages provider loop.
- **Symptom:** a client that disconnects mid-stream left the server consuming the provider stream (billable tokens) and writing to a dead socket until the model finished, and a partial assistant message was then persisted.
- **Root cause:** Node ≥16 fires IncomingMessage `close` as soon as the body is consumed — `express.json` does that before the handler runs — so `req.on("close")` never fires for a mid-stream disconnect in this app. The reliable signal is `res.on("close")` with `!res.writableEnded`.
- **Fix applied:** the route creates an AbortController; `res.on("close")` aborts it when the response hasn't ended; the signal is passed as the create *options* argument (`create(body, { signal })` — the OpenAI SDK v6 signature rejects `signal` in the body); the chunk loop breaks when aborted; the catch path returns silently once the client is gone; the assistant message is not persisted after an abort. A route comment documents the req-vs-res close distinction.
- **Test added:** artifacts/api-server/test/sse-abort.spec.ts (2 tests): a raw `http.request` client destroys its socket on the first response bytes; asserts the provider `create` call received an aborted AbortSignal, and that only the user-message insert happened (no assistant insert).
- **Verified by:** api-server suite 47 passed + 2 env-gated skipped; whole-workspace `pnpm test` 125 passed + 2 skipped; typecheck green. Commit 83104be.
- **Related:** Audit 3 F-04; BUG-002 (same handler, SSE error framing); Session 20.

### BUG-006 — CI never runs the vitest test suite
- **Severity / Status:** High / **Fixed** (2026-10-05, Session 20) — Audit 3 finding F-01.
- **Root cause:** .github/workflows/browser-tests.yml only ran `pnpm run typecheck`, `verify:lightbox`, and `verify:flow`; the 123-test vitest suite existed but was never executed in CI, so a red suite could not fail a build.
- **Fix applied:** new step "Unit and component tests (Audit 3 F-01 / BUG-006)" running `pnpm test` before the browser-harness steps. Workflow YAML re-parsed after the edit (all 7 steps present and ordered). The step command was verified locally: `pnpm test` exit 0, 123 passed + 2 env-gated skipped. Commit a14cd34.
- **Test added:** none needed (the fix *is* running the existing tests in CI); verification = local run of the exact step command + YAML structure check.
- **Files changed:** .github/workflows/browser-tests.yml.

### BUG-005 — DELETE conversations route validated a body-polluted params object
- **Severity / Status:** Medium / Fixed (2026-10-05, Session 18) — Audit 2 findings F-01 & F-05.
- **Where:** artifacts/api-server/src/routes/openai/index.ts — DELETE /openai/conversations/:id.
- **Symptom:** the handler ran `DeleteOpenaiConversationParams.safeParse(req.params)`; in Express 5, `req.params` is the merge of path params with parsed body/query fields, so a crafted request body could satisfy (or influence) a params-level schema. Body-parsing validation on a DELETE is a pointless attack surface: an attacker-controlled body should never participate in identifying the resource.
- **Root cause:** the orval-generated params schema (`zod.coerce.number()`) coerces anything, and zod's default object behavior strips unknown keys rather than rejecting them, so the schema added no protection while inviting body-polluted input.
- **Fix applied:** the route now takes only the path segment — `const id = Number(req.params.id)` — and rejects anything non-integer or non-positive with `400 {"error":"Missing or invalid conversation id."}`; no body parsing occurs. The unused `DeleteOpenaiConversationParams` import was removed (the generated schema remains in lib/api-zod for the response contract; it will return on the next orval codegen and must simply stay unused by this route). A missing id (trailing slash) matches no route under Express 5's `:id` semantics and yields the framework's 404. Covered by artifacts/api-server/test/delete-no-body-parsing.spec.ts (5 tests: body-ignored 204, non-numeric id 400, missing id 404, owned 204, other user's 404).
- **Verified by:** api-server suite 33 passed + 2 env-gated skipped; whole-workspace `pnpm test` 107 passed + 2 skipped; typecheck green. Commit c93fc6a.
- **Test-infra note:** Node's `http.request` only auto-frames POST/PATCH bodies with Transfer-Encoding: chunked; a length-less DELETE body is rejected by the HTTP parser (HPE_INVALID_METHOD) with a bare 400 before the app sees it. The shared test helper now sets Content-Length explicitly for any method carrying a body.
- **Related:** Audit 2 F-01/F-05; Session 18.

### BUG-004 — Conversations cursor pagination repeated the first page (gt vs lt on desc order)
- **Severity / Status:** Medium / Fixed (2026-10-02, Session 4)
- **Where:** artifacts/api-server/src/routes/openai/index.ts — GET /openai/conversations cursor filter.
- **Symptom:** with newest-first ordering (`orderBy(desc(id))`), page 2 requested with `cursor=3` returned ids 5,4 — the same rows as page 1 — instead of the older rows 2,1. Any paginated consumer would loop on page 1 forever.
- **Root cause:** the cursor filter used `gt(conversations.id, cursor)` while the sort is descending; the window `id > cursor` selects *newer* rows, which were already returned. The messages route (ascending + `gt`) was correct.
- **How found:** live end-to-end verification against a real Postgres on :5433 (mocked unit tests asserted handler logic, not real SQL ordering — see bug.md BUG-001 lesson and Session 4).
- **Fix applied:** filter changed to `lt(conversations.id, cursor)` with a comment explaining the desc/cursor relationship. Verified live: pages walk 5,4,3 → 2,1 → empty with no repeats. New integration suite artifacts/api-server/test/integration.pagination.spec.ts (env-gated on E2E_DATABASE_URL) asserts descending order, cross-page monotonicity and no repeated ids. Commit 67cfa86.
- **Verified by:** live curl against running dev server + integration tests (2 passed with real DB; skipped without).
- **Related:** BUG-003 (introduced by its pagination fix); Session 4.

### BUG-003 — No DB pagination and no per-user ownership on conversations/messages
- **Severity / Status:** Low / Fixed (2026-10-02, Session 3) — expanded in scope into full authentication per user decision.
- **Where (original):** artifacts/api-server/src/routes/openai/index.ts (unscoped, unbounded queries); lib/db/src/schema/{conversations,messages}.ts (no owner column).
- **Root cause:** no auth existed; product was single-user/local.
- **Fix applied:**
  - **Auth:** new `users` table (lib/db/src/schema/users.ts), scrypt password hashing (artifacts/api-server/src/lib/password.ts), HMAC-signed session cookie `lumina_session` + `requireAuth` middleware (artifacts/api-server/src/lib/session.ts, SESSION_SECRET env), and `/api/auth/register|login|logout|me` routes (artifacts/api-server/src/routes/auth.ts).
  - **Ownership:** `conversations.userId` (nullable for migration safety) with FK cascade + composite index; every conversation/message/stats query scoped via `req.userId`; id-scoped routes return 404 for other users' conversations (indistinguishable from missing).
  - **Pagination:** `?limit` + `?cursor` (id-based) on GET conversations (default 50, max 200) and GET messages (default 200, max 1000); response stays a plain array so the generated client kept working; over-fetch-by-1 page detection server-side. New indexes on both tables.
  - **Contract:** openapi.yaml extended (auth endpoints, query params, 401s); orval codegen regenerated api-zod + api-client-react; api-zod barrel got an explicit re-export resolving an orval naming collision (TS2308).
  - **Frontend:** sign-in/sign-up call the real API with error display; AuthProvider + AuthGate (guard /chat) + GuestOnly (redirect signed-in users) added; routes wired in App.tsx.
  - **Migration aid:** `AUTH_AUTO_PROVISION=1` makes the first registered account adopt pre-auth conversations (rows with NULL userId). `SESSION_SECRET` documented in .env.example + README.
- **Verified by:** 24/24 tests (18 api-server incl. 8 new auth tests; 6 api-client-react); full typecheck; production build. Commits 875c51a, 96d10d3.
- **Related:** Audit 1 finding 5 area; Session 3; features.md "Authentication", "Conversation persistence", "Sign-in / Sign-up pages".

### BUG-002 — SSE provider errors stream as mid-stream event instead of HTTP error status
- **Severity / Status:** Low / Fixed (2026-10-02, Session 2)
- **Where:** `artifacts/api-server/src/routes/openai/index.ts` — POST `/openai/conversations/:id/messages`; frontend `artifacts/lumina/src/lib/stream-message.ts`.
- **Symptom (original):** provider failure produced HTTP 200 + SSE headers, then a single `data: {"error":...}` frame; clients could not distinguish provider failure from a normal empty stream and could not retry via HTTP status.
- **Root cause:** SSE headers were set before the provider call, so status could no longer change once the route began responding.
- **Fix applied:** SSE headers are now withheld until the first provider content chunk (`startSse()` helper with `sseStarted` guard + `res.flushHeaders()`). Failures before any content return a clean `502 {error}` JSON response; failures after streaming began keep the in-band SSE error frame (the only option once headers are sent). Successful-but-empty completions still emit valid SSE framing. Frontend `stream-message.ts` now parses the JSON error body of non-2xx responses and surfaces `error` detail instead of a generic `HTTP 502` string. Files: artifacts/api-server/src/routes/openai/index.ts, artifacts/lumina/src/lib/stream-message.ts; new regression tests in artifacts/api-server/test/bug-002.spec.ts (3 tests). Commit 16177c8.
- **Verified by:** `pnpm --filter @workspace/api-server test` (9/9 pass incl. 3 new regression tests); root typecheck + production build green.
- **Related:** Audit 1 finding 3 context; Session 2; features.md "Chat with streaming responses".

### BUG-001 — Vulnerable transitive dependencies (18 advisories incl. 14 high in dev chain, qs prod)
- **Severity / Status:** Medium / Fixed (2026-10-02, Session 1)
- **Where:** transitive deps — prod: `qs` via express in artifacts/api-server; dev chain: fast-uri/brace-expansion/js-yaml/nanoid/markdown-it via orval@8.23.0 + typedoc + Vite/postcss.
- **Symptom:** `pnpm audit` → 18 advisories (14 high, 3 moderate, 1 low); `qs` DoS advisories on the production server path.
- **Root cause:** transitive ranges (`>=3.0.0 <3.1.x` etc.) resolving to vulnerable versions; pnpm 11 ignores `pnpm.overrides` in package.json, so the first fix attempt in package.json was a no-op (warned: 'The "pnpm" field ... no longer read').
- **Fix applied:** `pnpm up -r qs` → 6.16.0; added `overrides` block to `pnpm-workspace.yaml` (merged into the existing platform-binary exclusion block after a duplicate-key YAML parse error): brace-expansion 5.0.12, fast-uri 3.1.8, js-yaml 4.3.2, markdown-it 14.3.1, nanoid 3.3.18 — all same-major. Files: pnpm-workspace.yaml, pnpm-lock.yaml. Result: 1 remaining advisory (low, esbuild<0.28.1) intentionally left because esbuild is pinned 0.27.3 by esbuild-plugin-pino.
- **Verified by:** `pnpm audit` count 18→1; resolved versions confirmed via `node_modules/.pnpm` listing; typecheck/build/tests green after upgrade.
- **Related:** Audit 1 finding 2; Session 1.

## Won't Fix

_(none)_
