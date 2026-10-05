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
| BUG-007 | Rate limiters keyed on proxy IP; no `trust proxy` handling | Medium | Open | Audit 3 (2026-10-05) | — |
| BUG-008 | GET conversation returns all messages; images persisted as base64 data URIs in message text | Medium | Open | Audit 3 (2026-10-05) | — |
| BUG-009 | Abandoned SSE streams never aborted (billable provider work continues) | Medium | Open | Audit 3 (2026-10-05) | — |
| BUG-010 | Unused root dependency `@replit/connectors-sdk` | Medium | Open | Audit 3 (2026-10-05) | — |

## Open

### BUG-006 — CI never runs the vitest test suite
- **Severity / Status:** High / **Fixed** (2026-10-05, Session 20) — Audit 3 finding F-01.
- **Root cause:** .github/workflows/browser-tests.yml only ran `pnpm run typecheck`, `verify:lightbox`, and `verify:flow`; the 123-test vitest suite existed but was never executed in CI, so a red suite could not fail a build.
- **Fix applied:** new step "Unit and component tests (Audit 3 F-01 / BUG-006)" running `pnpm test` before the browser-harness steps. Workflow YAML re-parsed after the edit (all 7 steps present and ordered). The step command was verified locally: `pnpm test` exit 0, 123 passed + 2 env-gated skipped. Commit a14cd34.
- **Test added:** none needed (the fix *is* running the existing tests in CI); verification = local run of the exact step command + YAML structure check.
- **Files changed:** .github/workflows/browser-tests.yml.

### BUG-010 — Unused root dependency `@replit/connectors-sdk`
- **Severity / Status:** Medium / Open — Audit 3 (2026-10-05), finding F-05.
- **Where:** package.json:19 (`"dependencies": { "@replit/connectors-sdk": "^0.4.1" }`).
- **Evidence:** no import of the package anywhere in artifacts/lib/scripts (`grep -rn "@replit/connectors-sdk" artifacts lib scripts` → nothing); nothing in the lockfile depends on it.
- **Fix:** remove the dependency (verify no Replit deployment hook relies on it first). Effort: Small.

### BUG-009 — Abandoned SSE streams never aborted
- **Severity / Status:** Medium / Open — Audit 3 (2026-10-05), finding F-04.
- **Where:** artifacts/api-server/src/routes/openai/index.ts:345-366 (POST /openai/conversations/:id/messages provider loop).
- **Symptom:** a client that disconnects mid-stream leaves the server consuming the provider stream (billable tokens) and writing to a dead socket until the model finishes; `grep -n "close\|abort\|destroy"` in the route returns nothing in the SSE handler.
- **Fix:** wrap the provider call in an AbortController and abort from `req.on("close")` once SSE has started; skip the assistant-message persist if aborted before completion (or persist a truncated marker, by decision). Effort: Small.

### BUG-008 — GET conversation returns all messages; images persisted as base64 data URIs
- **Severity / Status:** Medium / Open — Audit 3 (2026-10-05), finding F-03.
- **Where:** artifacts/api-server/src/routes/openai/index.ts:195-200 (unbounded `select` on messages); :455/:473 (image markdown with full base64 data URI persisted as message content); consumers: chat page refetches on every send/generate.
- **Symptom:** payload and DB storage grow without bound — a 1024×1024 PNG is ~1.5 MB of base64 per message; image-heavy conversations multiply refetch cost linearly and re-render everything on each invalidation. The list endpoints were paginated in BUG-003 but this endpoint was left fetching all.
- **Fix:** bound the GET (last N messages or cursor pagination) and/or move image blobs out of the messages table (object storage / dedicated table). Effort: Medium.

### BUG-007 — Rate limiters keyed on proxy IP; no `trust proxy` handling
- **Severity / Status:** Medium / Open (Needs verification of production topology) — Audit 3 (2026-10-05), finding F-02.
- **Where:** artifacts/api-server/src/app.ts:63-67 (limiter mounting); no `app.set("trust proxy", ...)` anywhere.
- **Symptom:** behind the Vite dev proxy or any reverse proxy, `req.ip` is the proxy address, so every client shares one bucket for chatLimiter (30/min), authLimiter (10/15min) and registerLimiter (10/h) — lockout risk and lost per-user throttling. The middleware comment acknowledges the dev warning but not the shared-bucket behavior.
- **Fix:** set `trust proxy` to the real hop count for the deployment and/or additionally key sensitive limiters on `req.userId`. Effort: Small.

### BUG-006 — CI never runs the vitest test suite
- **Severity / Status:** High / Open — Audit 3 (2026-10-05), finding F-01.
- **Where:** .github/workflows/browser-tests.yml — steps are typecheck, `verify:lightbox`, `verify:flow`; no `pnpm test` anywhere in the workflow.
- **Symptom:** the 123-test suite (api-server, lumina, api-client-react) only runs on developer machines; CI can pass while the suite is red, so regressions ship undetected.
- **Fix:** add a `pnpm test` step (or job) before the browser harnesses; ~40s of CI time. Effort: Small.

## In Progress

_(none)_

## Fixed

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
