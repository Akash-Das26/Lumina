# Review Log

Session-by-session log of work. New entries go at the TOP.

---

### Session 3 - 2026-10-02
- **Goal:** Start BUG-003 (pagination + ownership scoping). User chose "full auth now" + backward-compatible limit/cursor pagination, expanding scope to a complete authentication feature.
- **Work done:**
  - DB: users table (lib/db/src/schema/users.ts); `conversations.userId` (nullable, FK cascade) + composite indexes on conversations and messages; schema barrel exports users.
  - Auth core: scrypt hashing (lib/password.ts), HMAC-signed `lumina_session` cookie + `requireAuth` (lib/session.ts, SESSION_SECRET env required), `/api/auth/*` routes (routes/auth.ts) with `AUTH_AUTO_PROVISION=1` orphan adoption.
  - API: all /api/openai routes behind requireAuth and scoped by req.userId; limit/cursor pagination on list endpoints (array response preserved); stats now per-user; openapi.yaml extended; orval codegen regenerated; api-zod barrel re-export fix for orval TS2308 collision; zod added to api-server deps (catalog).
  - Frontend: AuthProvider (queries /api/auth/me), AuthGate on /chat routes, GuestOnly on /sign-in|/sign-up; sign-in/sign-up submit to the real API with error + pending states.
  - Tests: auth.spec.ts (8 tests); existing specs updated with SESSION_SECRET + session cookies; .env.example + README document SESSION_SECRET and AUTH_AUTO_PROVISION.
  - Committed: 875c51a (API+schema+spec), 96d10d3 (frontend).
- **Features touched:** Authentication (new, Done); Conversation persistence (ownership+pagination); Sign-in/Sign-up pages (Done); Usage stats API (per-user); Smoke tests.
- **Bugs fixed / found:** BUG-003 fixed. One new issue found and fixed in-session: auth router was mounted pathless so /register never matched (401s); fixed by using /auth/* route paths.
- **Decisions made:**
  - Full auth (users table + scrypt + signed cookie sessions, no session store) chosen by user over anonymous-cookie or schema-only options.
  - Limit/cursor with plain-array response over envelope, per user choice, so generated React Query hooks kept working without frontend cache changes.
  - userId nullable: NOT NULL would break `db:push` on existing local databases with data.
  - requireAuth typed to set a REQUIRED req.userId so route handlers need no undefined-checks.
  - Mock chain learned returning() — insert().returning() crashed register (500) until added.
- **Tests run:** api-server 18/18 (7 smoke + 3 bug-002 + 8 auth); api-client-react 6/6; full typecheck; production build.
- **Left unfinished:** docs not yet pushed; `pnpm db:push` not run against a live DB (schema verified by typecheck/tests only).
- **Next steps:** run `pnpm db:push` on a real database; push commits; consider sign-out UI in the chat header.

### Session 2 - 2026-10-02
- **Goal:** Fix BUG-002 — provider failures before SSE streaming begins should return a clean HTTP error instead of an in-band error frame.
- **Work done:**
  - Reworked POST `/openai/conversations/:id/messages` in artifacts/api-server/src/routes/openai/index.ts: added `startSse()` helper (with `sseStarted` guard + `flushHeaders()`) so SSE headers are only sent on the first content chunk; pre-stream provider failures now return `502 {error}` JSON; mid-stream failures keep the SSE error frame; empty-but-successful completions still emit valid SSE framing.
  - artifacts/lumina/src/lib/stream-message.ts: non-2xx responses now parse the JSON body and surface `error` detail instead of a generic `HTTP <status>` message.
  - Added artifacts/api-server/test/bug-002.spec.ts (3 regression tests) using `vi.hoisted` mocks for `@workspace/db` (incl. `conversations`/`messages` table exports and a Drizzle-like chain with `values`/`set`) and the provider integration.
  - Committed as 16177c8 (footer-free); updated docs (bug.md, review.md, audit.md follow-up, features.md limitation note).
- **Features touched:** Chat with streaming responses (error-path behavior changed).
- **Bugs fixed / found:** BUG-002 fixed (moved Open → Fixed in bug.md); BUG-003 remains open.
- **Decisions made:**
  - Withhold-headers-until-first-chunk over provider preflight/ping: no extra latency or provider round-trip; the first chunk is the natural proof the stream is healthy. Mid-stream failures still use the SSE error frame since HTTP status is no longer writable then.
  - Kept the `{error}` SSE frame contract for mid-stream failures rather than dropping the connection, so the existing frontend `onError` path keeps working unchanged.
  - 502 chosen (bad gateway to the upstream AI provider) with the provider's message passed through in `error`.
- **Tests run:** `pnpm --filter @workspace/api-server test` → 9/9 (6 smoke + 3 BUG-002 regression); `pnpm run typecheck` all green; production build green.
- **Left unfinished:** docs/ folder still untracked (user hasn't asked to commit it); BUG-003 open.
- **Next steps:** commit docs/; consider BUG-003 when auth lands; wire Artist mode to the image API.

---

### Session 1 - 2026-10-02
- **Goal:** Connect the repo to github.com/Akash-Das26/Lumina with a no-footer commit policy; deep audit the codebase; then fix the four top findings (deps, hardening, bloat, zero tests).
- **Work done:**
  - Connected `origin` and force-pushed local main (21 commits) over a junk remote stub (`db81fc2`, a 2-line README for a different Replit project); set upstream tracking.
  - Added `.agents/memory/no-commit-footer.md` and MEMORY.md index entry enforcing plain commit messages (user requirement).
  - Deep audit: full-history secret scan (40 commits), blob-size scan, `pnpm audit`, typecheck/build validation, runtime security review of `artifacts/api-server/src/app.ts`.
  - `pnpm up -r qs` → qs@6.16.0; added `overrides` (brace-expansion 5.0.12, fast-uri 3.1.8, js-yaml 4.3.2, markdown-it 14.3.1, nanoid 3.3.18) to `pnpm-workspace.yaml`.
  - Hardened `artifacts/api-server/src/app.ts`: CORS allowlist (+ optional `CORS_ORIGINS` env), helmet, 1MB body limit, rate limiters in new `artifacts/api-server/src/middleware/rate-limit.ts`; added `helmet@^8.1.0`, `express-rate-limit@^8.2.1`.
  - Added smoke tests: `artifacts/api-server/test/app.spec.ts` (6 tests) with `test/helpers/server.ts` + `vitest.config.ts`; `lib/api-client-react/test/custom-fetch.spec.ts` (6 tests) + `vitest.config.ts`; root `pnpm test` script; vitest devDependency.
  - `git rm -r attached_assets` (7 dev scratch files, incl. monica_homepage.png).
  - Committed 5 commits, all verified footer-free.
  - Created this docs system (docs/features.md, review.md, audit.md, bug.md).
- **Features touched:** API hardening (new), Smoke tests (new); statuses updated in features.md.
- **Bugs fixed / found:** BUG-001 fixed; BUG-002, BUG-003 logged as Open. See bug.md.
- **Decisions made:**
  - Force-push instead of merge: remote held only an unrelated stub commit.
  - Overrides go in `pnpm-workspace.yaml`: pnpm 11 ignores `pnpm.overrides` in package.json (warned at install).
  - All advisory pins are same-major bumps to avoid breaking the orval/Vite/esbuild-plugin-pino chain; left esbuild pinned at 0.27.3 (low-severity advisory, required by esbuild-plugin-pino).
  - Rate limiters live in `middleware/rate-limit.ts` not `routes/`, avoiding a circular import app.ts → routes → app.ts.
  - CORS allows empty-Origin requests (curl/same-origin via Vite proxy) and blocks unlisted browser origins; non-browser clients unaffected.
  - Tests avoid supertest (raw `node:http` helper) and mock `@workspace/db` so no Postgres is required in CI; env vars set via `vi.hoisted`-style ordering (before `await import` of app).
- **Tests run:** `pnpm run typecheck` (all 4 projects pass); `pnpm test` (12/12 pass); `PORT=5173 BASE_PATH=/ pnpm run build` (succeeds, 425.29 kB JS / 131.37 kB gzip).
- **Left unfinished:** none of the four remediation items; docs created.
- **Next steps:** push commits to GitHub; wire Artist mode to the image API; set `git config` identity; consider BUG-002/BUG-003 fixes.
