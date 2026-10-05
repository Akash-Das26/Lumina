# Audit Log

One entry per deep audit. Append new audits below.

---

### Audit 3 - 2026-10-05
- **Scope:** Entire repository (artifacts/api-server, artifacts/lumina, lib/*, scripts, CI, docs) — read-only audit; no source changes made, only docs.
- **State audited:** branch `fix/audit-2` @ `2284f2dc4dd43b19e3ce9ba1b67dd00bb88f190e` ("Add Session 18 review entry covering the Audit 2 pass", 2026-10-05); working tree clean except the pre-existing untracked `scripts/browser/decode-png.js`.
- **Method / commands run:** read docs/{features,bug,review,audit}.md; full source read of routes (auth, openai, health), session/password libs, app.ts, middleware, db schema, chat page, auth provider, sign-in, markdown renderer, chat input, custom-fetch, image-media lib; `pnpm test` (exit 0: 123 passed + 2 env-gated skipped); `pnpm typecheck` (exit 0); `pnpm audit` (4 advisories: 1 high braces ≤3.0.3 via mockup-sandbox>fast-glob, 2 moderate vitest/@vitest/mocker, 1 low esbuild — all dev-chain); `pnpm --filter @workspace/api-server build` (exit 0) and lumina production build (exit 0, needs PORT/BASE_PATH); `pnpm install --frozen-lockfile --dry-run` (lockfile in sync); `git log --all -S "sk-"` secret scan (nothing); git history grep for orphan/duplicated code; dist size and gitignore checks; CI workflow review.
- **Findings table (sorted by severity):**

| ID | Sev | Area | Location | Title |
|---|---|---|---|---|
| F-01 | High | Tests/CI | .github/workflows/browser-tests.yml | CI never runs the vitest suite (only typecheck + browser harnesses) |
| F-02 | Medium | Security | artifacts/api-server/src/app.ts:63-67 | Rate limiters keyed on proxy IP: no `trust proxy` handling |
| F-03 | Medium | Performance | routes/openai/index.ts:195-200; db schema | GET conversation returns ALL messages; images stored as base64 data URIs in message text |
| F-04 | Medium | Bugs/error handling | routes/openai/index.ts:345-366 | Abandoned SSE streams are never aborted (no req close handler) |
| F-05 | Medium | Dependencies/build | package.json:19 | `@replit/connectors-sdk` declared at root but never imported |
| F-06 | Medium | Code quality | lib/integrations/openai_ai_integrations/ | Orphaned duplicate integration package (11 tracked files, no package.json, zero references) |
| F-07 | Low | Security | lib/session.ts:50-53 | Session cookie lacks `Secure` attribute |
| F-08 | Low | Correctness | lib/api-zod generated + routes | Message `content` has no max length (1 MB body limit is the only cap) |
| F-09 | Low | Code quality | artifacts/api-server/package.json | `cookie-parser` declared but never imported |
| F-10 | Low | Tests | artifacts/api-server/test/ | No tests for GET /openai/stats or auth/me cache-refresh behavior |
| F-11 | Low | Docs/config | replit.md vs README.md | Node version claims disagree (24 vs "20+"); features.md cites a stale line range |
| F-12 | Info | Security | lib/markdown.tsx:24-34 | Markdown img renders any URI found in assistant output |
| F-13 | Info | Correctness | chat-conversation.tsx:76 | `/chat/:id` with non-numeric id renders an empty conversation instead of an error |

- **Detailed findings:**

  **F-01 (High, Tests/CI) — CI never runs the unit test suite.** *Fixed (Session 20):* `pnpm test` step added to .github/workflows/browser-tests.yml before the harness steps; step command verified locally (exit 0, 123 passed + 2 skipped) and workflow YAML re-parsed. Commit a14cd34. BUG-006 closed.
  - Location: `.github/workflows/browser-tests.yml` (only steps: `pnpm run typecheck`, `pnpm run verify:lightbox`, `pnpm run verify:flow`; a grep for `pnpm.*test` in the workflow matches zero lines).
  - Evidence: workflow source lines 70-77. The 123-test vitest suite (api-server, lumina, api-client-react) runs only on developer machines; CI could pass while the suite is red.
  - Recommended fix: add a step (or separate job) running `pnpm test` before the browser harnesses; ~40s of CI time.
  - Effort: Small.

  **F-02 (Medium, Security) — rate limiters keyed on proxy IP; no `trust proxy` configuration.**
  - Location: artifacts/api-server/src/app.ts:63-67 (limiter mounting); no `app.set("trust proxy", ...)` anywhere in the server.
  - Evidence: `grep -n "trust proxy" artifacts/api-server/src` → no matches. `req.ip` is the socket address; behind the Vite dev proxy or any reverse proxy every client shares one IP, so the 30/min chatLimiter, 10/15min authLimiter and 10/h registerLimiter buckets are shared across all users (lockout risk) and per-user throttling is lost. The code comment in middleware/rate-limit.ts acknowledges the dev warning but not the prod bucket-sharing. *Needs verification of the production topology; if the API is only ever reached same-origin without a proxy this is Low.*
  - Recommended fix: set `app.set("trust proxy", <hops>)` matching the deployment and/or key sensitive limiters on `req.userId` as well as IP.
  - Effort: Small.

  **F-03 (Medium, Performance) — unbounded message fetch + base64 image storage.**
  - Location: artifacts/api-server/src/routes/openai/index.ts:195-200 (`const msgs = await db.select().from(messages).where(eq(messages.conversationId, conv.id)).orderBy(asc(messages.createdAt)); res.json({ ...conv, messages: msgs });`) and routes/openai/index.ts:455/473 (image markdown with full base64 data URI persisted as message `content`).
  - Description: unlike the paginated list endpoints (BUG-003 work), GET /openai/conversations/:id fetches every message on every load; a 1024×1024 PNG is roughly 1.5 MB of base64 in the text column, so image-heavy conversations multiply DB/storage/refetch cost linearly with no limit. The frontend then re-renders all of it on each refetch.
  - Recommended fix: paginate (or truncate to the last N messages) in the GET handler and/or move image blobs out of the messages table (object storage or a dedicated table fetched on demand).
  - Effort: Medium.

  **F-04 (Medium, Bugs/error handling) — abandoned SSE streams never aborted.** *Fixed (Session 20):* the messages handler now owns an AbortController; `res.on("close")` with `!writableEnded` aborts it (req `close` never fires here because express.json already consumed the body), the signal is passed via the create options arg, the chunk loop breaks on abort, and the assistant message is not persisted after an abort. Regression spec sse-abort.spec.ts (2 tests). Commit 83104be; BUG-009 closed.
  - Location: artifacts/api-server/src/routes/openai/index.ts:345-366 — `openai.chat.completions.create({ stream: true })` consumed in `for await` with no `req.on("close")`/AbortController.
  - Evidence: `grep -n "close\|abort\|destroy" artifacts/api-server/src/routes/openai/index.ts` returns nothing in the messages handler. A client that closes the tab or navigates mid-stream leaves the server consuming the provider stream (billable tokens) and writing to a dead socket until completion.
  - Recommended fix: attach an AbortController to the provider call and abort it from `req.on("close")` when SSE has started.
  - Effort: Small.

  **F-05 (Medium, Dependencies/build) — unused root dependency `@replit/connectors-sdk`.** *Fixed (Session 20):* removed via `pnpm remove` after re-verifying zero references in artifacts/lib/scripts/.github; tests, typecheck and build green. Commit 7888739; BUG-010 closed.
  - Location: package.json:19 (`"dependencies": { "@replit/connectors-sdk": "^0.4.1" }`).
  - Evidence: `grep -rn "@replit/connectors-sdk" artifacts lib scripts` → zero source references; `pnpm why` has no consumers.
  - Recommended fix: remove the dependency (reduces install surface; check no Replit deployment hook needs it first).
  - Effort: Small.

  **F-06 (Medium, Code quality) — orphaned duplicate integration package.** *Fixed (Session 20):* `git rm -r lib/integrations/` (11 files, 837 lines) and the `lib/integrations/*` workspace glob removed from pnpm-workspace.yaml; re-verified zero references first; tests + typecheck green. Commit 706ad47.
  - Location: `lib/integrations/openai_ai_integrations/` — 11 tracked files (audio clients/hooks, batch, image clients) with no package.json, not in tsconfig references, imported by nothing.
  - Evidence: `git ls-files lib/integrations | wc -l` → 11; `grep -rn openai_ai_integrations --include=package.json` → no matches; the live code uses `lib/integrations-openai-ai-server`. `diff` shows the two image clients have already diverged.
  - Description: stale near-duplicate of `lib/integrations-openai-ai-server` that will rot silently and confuses navigation (the workspace glob `lib/integrations/*` keeps it discoverable).
  - Recommended fix: `git rm -r lib/integrations/` and drop the workspace glob, or give it a package.json and a purpose.
  - Effort: Small.

  **F-07 (Low, Security) — session cookie without `Secure`.**
  - Location: artifacts/api-server/src/lib/session.ts:50-53 — `Set-Cookie ... HttpOnly; SameSite=Lax; Max-Age=...`.
  - Description: over TLS the cookie is not flagged `Secure`, so a mixed-content downgrade or link prefetch could carry it. Dev runs plain HTTP, so this needs an env-aware flag rather than a hardcode. *Needs verification of the production TLS story.*
  - Recommended fix: add `; Secure` when `NODE_ENV === "production"` (or behind a COOKIE_SECURE env override).
  - Effort: Small.

  **F-08 (Low, Correctness) — unbounded message content.** *Fixed (Session 20):* `maxLength: 100000` declared on OpenaiMessageInput.content in openapi.yaml; orval codegen regenerated `SendOpenaiMessageBody` with `.max(100000)` (api-zod + api-client-react). The messages route already 400s on schema failure, so enforcement needed no route change. Regression spec message-content-limit.spec.ts (2 tests: 100,001 chars → 400 with no provider call and no insert; exactly 100,000 accepted). Verified failing-first by temporarily reverting the generated schema. Commit 1893c9b.
  - Location: lib/api-zod/src/generated/api.ts:200 (`"content": zod.string()`, no `.max()`); enforced nowhere in the messages route.
  - Evidence: only the global `express.json({ limit: "1mb" })` bounds a request; a 1 MB message is persisted verbatim and replayed into the provider context (history slice(-20)) on later turns, multiplying provider costs.
  - Recommended fix: add `.max(100_000)` (or similar) to content in openapi.yaml and regenerate; reject oversized messages with 400.
  - Effort: Small.

  **F-09 (Low, Code quality) — unused `cookie-parser` dependency.** *Fixed (Session 20):* removed from artifacts/api-server along with `@types/cookie-parser` via `pnpm remove`; cookie handling is done by the custom HMAC session lib. Tests + typecheck green. Commit 28994e8.
  - Location: artifacts/api-server/package.json:18 (`"cookie-parser": "^1.4.7"`); no `import` of it exists (session.ts parses cookies manually).
  - Recommended fix: remove from package.json.
  - Effort: Small.

  **F-10 (Low, Tests) — coverage gaps: stats route and auth/me edge cases.** *Fixed (Session 20):* new stats-and-auth-me.spec.ts (6 tests) covering the stats payload shape (per-user counts + 5 most recent conversations, zeroed when empty, 401 without a session) and /auth/me (200 with the user, 401 once the user row is deleted despite the valid cookie signature, 401 without a session). Commit d189877.
  - Location: artifacts/api-server/test/ (10 spec files, none covering GET /openai/stats or /auth/me with a deleted user).
  - Evidence: `grep -rln stats artifacts/api-server/test/` → no matches; auth.spec.ts covers register/login/logout/409/429 but not the `/auth/me` 401-when-user-deleted path (routes/auth.ts:88-97).
  - Recommended fix: add a stats test (counts + scoping) and an /auth/me deleted-user test.
  - Effort: Small.

  **F-11 (Low, Docs/config) — version/date drift across docs.** *Fixed (Session 20):* README now says "Node.js 20+ (CI validates against Node 22)" and replit.md says Node 22 instead of 24; the features.md stale line cite was already resolved. Commit b404331.
  - Location: replit.md ("Node.js 24") vs README.md ("Node.js 20+") vs CI (`NODE_MAJOR: 22`); docs/features.md line 59 still cites "chat-conversation.tsx ~line 124-138" for search-source fetching (actual: line ~170).
  - Recommended fix: settle on the supported Node range in one place (README) and reference it; fix the features.md line cite.
  - Effort: Small.

  **F-12 (Info, Security) — markdown renderer renders any `![...](uri)` src.** *Fixed (Session 20):* the generic renderer now emits an `<img>` only when the src starts with `data:image/` (the shape the app persists); any other URI — external URLs, non-image data URIs — stays as plain text. 3 new markdown.spec.tsx tests. Commit 4be24fe.
  - Location: artifacts/lumina/src/lib/markdown.tsx:24-34 (`<img src={src} .../>` with src from the assistant message).
  - Description: model output could embed external image URLs (tracking pixels / mixed content). React blocks `javascript:` URLs in img src and no `dangerouslySetInnerHTML` is used, so this is an Info-level hygiene note, not an XSS. The dedicated MessageBubble path (`extractImageSrc`) is used for generated images; only this generic renderer is affected.
  - Recommended fix (optional): restrict generic markdown images to `data:image/` URIs.
  - Effort: Small.

  **F-13 (Info, Correctness) — non-numeric conversation id renders an empty page.** *Fixed (Session 20):* chat-conversation.tsx now redirects to /chat when the route id is non-numeric (NaN) instead of rendering the disabled-query empty state; new chat-id-redirect.spec.tsx (2 tests). Commit bfdc974.
  - Location: artifacts/lumina/src/pages/chat-conversation.tsx:76 (`const id = params.id ? Number(params.id) : null;`) — `/chat/abc` yields NaN, the query is disabled, and the page shows the "Start the conversation" empty state instead of a not-found message.
  - Recommended fix: redirect to /chat when `Number.isNaN(id)`.
  - Effort: Small.

- **Summary:** 0 Critical, 1 High, 5 Medium, 5 Low, 2 Info. Overall health: **good — 7.5/10**. The test suite is green and genuinely regression-focused, typecheck and both production builds pass, the lockfile is in sync, the API surface is consistently user-scoped with sensible validation, secrets history is clean, and Session 18's hardening (body-pollution fix, media-type sniffing, graceful shutdown) all verify. The score is held back mainly by the CI gap (the green suite is not actually enforced anywhere), the proxy-IP rate-limit keying question, and accumulating architecture debt around unbounded conversation payloads (base64 images in message text). The remaining findings are small, well-isolated cleanups.
- **Top 5 priorities:**
  1. F-01 — run `pnpm test` in CI (the whole safety net is currently unenforced).
  2. F-02 — `trust proxy` / limiter keying (auth brute-force protection depends on it).
  3. F-04 — abort abandoned SSE streams (direct cost control).
  4. F-03 — bound the conversation payload (data-URI images in message text won't scale).
  5. F-05 + F-06 + F-09 — remove the three dead dependency/code blocks in one small sweep.
- **Follow-up (bug.md):** F-01→BUG-006, F-02→BUG-007, F-03→BUG-008, F-04→BUG-009, F-05→BUG-010 recorded as Open. F-07..F-13 are Low/Info and were not filed as bugs per the tracker's severity practice; they live in this audit entry for triage.

---

### Audit 1 - 2026-10-02
- **Scope:** Whole repo. Secrets (working tree + full git history), repo hygiene/bloat, dependency vulnerabilities, build/type health, runtime API security posture.
- **Method:** `git rev-list --all` + `git grep` regex scan for API-key/URL/PEM patterns across every commit; `git cat-file --batch-check` blob-size ranking; `unzip -l` inspection of committed zips; `.gitignore` review; `pnpm audit` (+ `--prod`); `pnpm why` dependency-tree tracing; `pnpm run typecheck`; production `pnpm run build`; manual review of app.ts, routes/openai/index.ts, db/src/index.ts, .env.example, scripts/dev-local.mjs, lumina key-handling greps.
- **Findings:**
  1. **Medium — Bloat:** `exports/lumina-ai-github.zip` (674KB ×2) + `exports/lumina-local.zip` (668KB) + `attached_assets/*` (357KB png + ~70KB pasted logs) tracked in git; ~2.7MB of scratch archives. Fix: `git rm -r`; history rewrite only if clone size matters. *(fixed this session — attached_assets removed; exports already gone from HEAD)*
  2. **Medium — Dependencies:** 18 advisories (14 high: fast-uri/brace-expansion/js-yaml/nanoid/markdown-it in orval+typedoc+Vite dev chain; 2 moderate prod: qs<6.16.0 via express; 2 other moderate/low incl. esbuild<0.28.1). Fix: update qs + same-major overrides. *(fixed this session; 1 low esbuild advisory intentionally remains)*
  3. **Medium — API hardening:** `app.use(cors())` allowed all origins; `express.json({limit:"50mb"})`; no helmet; no rate limiting on costly AI routes (artifacts/api-server/src/app.ts:28-30). *(fixed this session)*
  4. **Low — No tests:** zero test files in the entire workspace. *(fixed this session: 12 smoke/unit tests added)*
  5. **Low — DB pool init:** `lib/db/src/index.ts:7-13` throws at import time if `DATABASE_URL` unset (no lazy fallback); acceptable but blocks any tooling that imports the package without env. *(open, acceptable)*
  6. **Low — Sourcemap size:** api-server production `dist/index.mjs.map` ≈ 6.6MB. Suggest `sourcemap: false` or external maps in build.mjs. *(open)*
  7. **Info — Clean secrets:** no real keys anywhere in history; only placeholders (`YOUR_PASSWORD`, `postgres:postgres`) in .env.example/README; commit `bce9e14` "sensitive configuration file" touched only .env.example+README (false alarm); zips contained only .env.example. `.gitignore` correctly covers `.env*` with `!.env.example`.
  8. **Info — Vite build warnings:** benign sourcemap warnings on shadcn `tooltip.tsx`/`label.tsx`.
- **Summary:** 0 Critical, 0 High, 3 Medium, 3 Low, 2 Info. Overall health: good — clean secret history, green typecheck/build, well-structured pnpm monorepo; main risks were dependency vulns and an unhardened API, both remediated same-day.
- **Follow-up:** Findings 1–4 fixed in Session 1 (see review.md) and cross-filed as BUG-001/BUG-002/BUG-003 in bug.md. Findings 5–6 left open as minor items. Git identity still unconfigured (`git config` user.name/user.email) — commits currently use env overrides.
- **Update (Session 2, 2026-10-02):** BUG-002 (SSE error handling, surfaced during Audit 1 route review) fixed — pre-stream provider failures now return HTTP 502; see bug.md and review.md Session 2.
- **Update (Session 3, 2026-10-02):** Audit 1 finding 5 area resolved by BUG-003 fix — conversations/messages are now user-scoped with cursor pagination and real authentication (users table, scrypt, signed session cookies); lib/db/src/index.ts import-time throw is now the only remaining form of that finding.
- **Update (Session 4, 2026-10-02):** Live end-to-end verification of the BUG-002 502 path and BUG-003 scoping/pagination found BUG-004 (cursor direction) — fixed and covered by new env-gated integration tests. Lesson recorded in review.md: mocked unit tests do not exercise real SQL ordering; run live verification after behavioral changes.
- **Update (Session 6, 2026-10-03):** Finding 3 follow-through completed for the auth surface — `/api/auth/login` (failed attempts only) and `/api/auth/register` now carry rate limiters (`authLimiter`, `registerLimiter` in middleware/rate-limit.ts), closing the "login is brute-forceable" limitation recorded under Authentication. Note the limiter store is in-memory/per-process: it resets on restart and is not shared across replicas (acceptable for the current single-process deployment).
- **Update (Session 11, 2026-10-03):** Finding 4 (no tests) is now closed across all three surfaces — the frontend gained a Vitest + React Testing Library setup (artifacts/lumina/vitest.config.ts, test/setup.ts, 22 component/unit tests) alongside the api-server and api-client-react suites. Workspace total: 56 passed + 2 env-gated skipped. Note: test files stay out of the app tsconfig by convention, so they are exercised by vitest but not by `pnpm typecheck`.
- **Update (Sessions 13–14, 2026-10-03):** frontend coverage grew to 40 tests (lightbox drag-to-pan, AuthGate/GuestOnly guards, AuthProvider signOut, sign-in form); workspace total is now 74 passed + 2 env-gated skipped.
- **Update (Session 15, 2026-10-03):** frontend coverage grew to 65 tests (lightbox scroll-wheel zoom with clamping and double-click fit↔2× toggle and keyboard shortcuts: navigate/zoom hints backed by real key handlers; sign-up form mirroring the sign-in spec; chat-header account menu + sign-out flow; conversation list sidebar — new-chat, loading skeleton, empty state, sorted list + active highlight, delete invalidation); workspace total is now 99 passed + 2 env-gated skipped (6 api-client-react + 28 api-server + 65 lumina).
- **Update (Session 16, 2026-10-03):** lightbox coverage grew to 66 tests (+1): `Escape` now closes the lightbox and is shown in the zoom/close shortcut hint; `handleKeyDown` gained an `Escape` branch. Workspace total 100 passed + 2 env-gated skipped.
- **Update (Session 17, 2026-10-04):** lightbox shortcut hints gained accessible names (`aria-label` on each `<kbd>`); double-click zoom toggle now has its own always-on shortcut hint (`lightbox-double-click-hint`) in the control row; `handleKeyDown` is unchanged. The hint test was corrected to read the accessible names directly (`getByLabelText`) after discovering `<kbd>` is not exposed with a `button` role — `getAllByRole('button', { name })` was matching the real prev/next/zoom controls instead. Frontend coverage is now 68 tests (added a zoom/pan reset-on-image-change case); workspace total is 102 passed + 2 env-gated skipped. See review.md Sessions 16–17 for the detailed work log. The lightbox interactions were additionally verified in a real browser (headless Chrome 151 driven over the DevTools Protocol with genuine input events), the complete flow (sign-up → image generation → lightbox) was driven end-to-end against the live dev stack, touch panning (with `touch-action` and touch pointer events) was verified using simulated touch input, and the checks are now committed as reusable harnesses: `pnpm verify:lightbox` (lightbox interactions incl. gallery navigation) and `pnpm verify:flow` (sign-up → image generation → lightbox against an ephemeral stack), under scripts/browser/.

### Audit 2 - 2026-10-05
- **Scope:** Audit 2 code review of the api-server routes layer and contract surfaces (findings recorded in the session brief; F-01..F-10).
- **Findings (severity, status):**
  - **F-01 (Medium) — DELETE conversations params schema accepts body-polluted input.** *Fixed Session 18:* see BUG-005 in bug.md; commit c93fc6a. Route validates only the numeric path segment; regression spec test/delete-no-body-parsing.spec.ts (5 tests).
  - **F-02 (Medium) — Search N+1: Wikipedia and DuckDuckGo fetched serially.** *Fixed Session 18:* `searchPublicSources` now runs both fetches concurrently via `Promise.allSettled` (per-source failure isolation preserved — one provider down never costs the other's results; ≤6 result cap unchanged). Regression spec test/search-sources.spec.ts (5 tests); commit 415d1fb.
  - **F-03 (Medium) — Re-generate disabled for persisted images.** *Could not reproduce (Session 18):* the gating (`msg.id != null && imagePrompt`) holds for every persisted image — the server always inserts the user prompt before the assistant image and the conversation fetch orders by `createdAt` asc. New chat-page regression tests lock the behavior in (commit 8a7ed05); if the original report was observed live, it needs a fresh reproduction.
  - **F-04 (Low) — base64 contract: server labels provider output `data:image/png` while the provider may return WebP bytes.** *Fixed (Session 18, user-approved "sniff & label" option):* new magic-byte sniffer (artifacts/api-server/src/lib/image-media.ts — PNG/WebP/JPEG, PNG fallback, no dependencies) drives the persisted data URI label; the generate-image response gained a required `media_type` field (openapi.yaml + orval codegen regenerated); the frontend uses it for the optimistic message and derives the download extension from the data URI. Commits bac5993 (+ tests: image-media.spec.ts 6 tests, WebP-provider route test, 2 download-extension tests). Browsers still render mislabeled legacy rows by sniffing, so persisted old data needs no migration.
  - **F-06 (Low) — plain-array responses instead of generated client types.** *Deferred by decision (Session 18):* the list endpoints return bare arrays per the documented BUG-003 decision (breaking change avoided then so the generated client kept working). Moving to a page envelope (e.g. `{items, nextCursor}`) is a contract change: it requires openapi.yaml + orval codegen regeneration and updates to every consumer (conversation-list, chat message paging). Left as a deliberate follow-up, not a defect fix.
  - **F-07 (Low) — duplicate `res.json({ b64_json })` in generate-image.** *Not applicable (Session 18):* the route contains exactly one `res.json({ b64_json })` (routes/openai/index.ts:485); every other path in the handler returns via 400/404/502. No change needed.
  - **F-08 (Info) — `db.end()` never called (pool not closed on shutdown).** *Fixed (Session 18):* SIGTERM/SIGINT now close the HTTP server then the pool via idempotent `closePool()` in lib/db; force-exit after 10s if a socket hangs. Verified by a tsx smoke run (TERM → "Shutting down" → clean exit); commit 1833354.
  - **F-09 (Info) — `isOctober` date-based logic.** *Not applicable (Session 18):* no `isOctober` or any month-gated logic exists in the working tree or any branch/history of the repo. Nothing to fix.
  - **F-10 (Info) — scripts/ devDependencies duplicate root/workspace deps.** *Not applicable (Session 18):* scripts/package.json declares `@types/node` and `tsx` via `catalog:` refs — the workspace's single-source-of-truth dedup mechanism, not duplication.
- **Summary:** 0 Critical, 0 High, 3 Medium, 3 Low, 3 Info. No dependency changes made for this audit; `pnpm audit` advisories unchanged (1 high braces ≤3.0.3, 2 moderate vitest/@vitest/mocker, 1 low esbuild — pre-existing).
- **Update (Session 18, 2026-10-05):** F-01/F-05 fixed and committed (c93fc6a); F-02 fixed and committed (415d1fb) — note the initial Promise.all rewrite would have turned a single-provider outage into a 502; the committed fix uses Promise.allSettled to preserve the old failure isolation, caught by the new spec before commit.
