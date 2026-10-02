# Bug Tracker

Summary table + Open / In Progress / Fixed sections. Never delete entries; move them between sections and fill in fix details.

## Summary

| ID | Title | Severity | Status | Found | Fixed |
|---|---|---|---|---|---|
| BUG-001 | Vulnerable transitive dependencies (18 advisories incl. 14 high in dev chain, qs prod) | Medium | Fixed | Audit 1 (2026-10-02) | 2026-10-02 (Session 1) |
| BUG-002 | SSE provider errors stream as mid-stream event instead of HTTP error status | Low | Fixed | Audit 1 / Session 1 review of routes/openai/index.ts | 2026-10-02 (Session 2) |
| BUG-003 | No DB pagination and no per-user ownership on conversations/messages | Low | Open | Audit 1 review of routes + db schema | — |

## Open

### BUG-003 — No DB pagination and no per-user ownership on conversations/messages
- **Severity / Status:** Low / Open
- **Where:** `artifacts/api-server/src/routes/openai/index.ts` — GET /openai/conversations (selects all rows), GET /openai/conversations/:id (all messages); `lib/db/src/schema/conversations.ts`, `lib/db/src/schema/messages.ts` (no user/owner column).
- **Repro:** create many conversations → list endpoint returns unbounded rows; any client can read/modify any conversation by id.
- **Expected vs actual:** expected cursor/limit pagination and per-user scoping; actual is global, unbounded data access. Acceptable for local single-user use today.
- **Root cause:** product is currently single-user/local; auth does not exist yet (sign-in/sign-up pages are UI-only — see features.md).
- **Next step:** when auth lands, add `userId` columns + indexes, scope queries, and add `limit`/`cursor` params to list endpoints.
- **Related:** Audit 1 finding 5 area; features.md "Conversation persistence", "Sign-in / Sign-up pages".

## In Progress

_(none)_

## Fixed

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
