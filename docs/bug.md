# Bug Tracker

Summary table + Open / In Progress / Fixed sections. Never delete entries; move them between sections and fill in fix details.

## Summary

| ID | Title | Severity | Status | Found | Fixed |
|---|---|---|---|---|---|
| BUG-001 | Vulnerable transitive dependencies (18 advisories incl. 14 high in dev chain, qs prod) | Medium | Fixed | Audit 1 (2026-10-02) | 2026-10-02 (Session 1) |
| BUG-002 | SSE provider errors stream as mid-stream event instead of HTTP error status | Low | Fixed | Audit 1 / Session 1 review of routes/openai/index.ts | 2026-10-02 (Session 2) |
| BUG-003 | No DB pagination and no per-user ownership on conversations/messages | Low | Fixed | Audit 1 review of routes + db schema | 2026-10-02 (Session 3) |
| BUG-004 | Conversations cursor pagination repeated the first page (gt vs lt on desc order) | Medium | Fixed | Session 4 live verification (2026-10-02) | 2026-10-02 (Session 4) |

## Open

_(none)_

## In Progress

_(none)_

## Fixed

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
