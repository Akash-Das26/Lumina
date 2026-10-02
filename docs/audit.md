# Audit Log

One entry per deep audit. Append new audits below.

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
