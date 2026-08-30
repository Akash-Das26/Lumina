# Lumina

An AI-powered chat and assistant application with conversation management, search, image generation, and multiple modes.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (requires `PORT` env var, defaults to 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env for api-server: `PORT` — port the server listens on (default 5000)
- Required env for api-server: `OPENAI_API_KEY` — OpenAI API key (or `AI_INTEGRATIONS_OPENAI_API_KEY`)
- Required env for api-server: `AI_INTEGRATIONS_OPENAI_BASE_URL` — OpenAI API base URL (e.g., `https://api.groq.com/openai/v1`)
- Required env for lumina: `PORT` — port the frontend dev server listens on (default 3000)
- Required env for lumina: `BASE_PATH` — base path for the frontend app

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle for api-server)
- Frontend: Vite + React 19 + Tailwind CSS v4
- OpenAI integration: `openai` SDK (server-side), React hooks (client-side)

## Where things live

- **API contracts (source of truth)**: `lib/api-spec/openapi.yaml`
- **DB schema**: `lib/db/src/schema/index.ts` (tables in `lib/db/src/schema/`)
- **Generated Zod schemas**: `lib/api-zod/src/generated/`
- **Generated React hooks/client**: `lib/api-client-react/src/generated/`
- **API server**: `artifacts/api-server/src/` (routes in `src/routes/`)
- **Frontend app**: `artifacts/lumina/src/` (pages in `src/pages/`)
- **OpenAI server integration**: `lib/integrations-openai-ai-server/src/`
- **OpenAI React integration**: `lib/integrations-openai-ai-react/src/`
- **DB config**: `lib/db/drizzle.config.ts`
- **Orval config**: `lib/api-spec/orval.config.ts`
- **Scripts**: `scripts/`
- **Root tsconfig**: `tsconfig.base.json`

## Architecture decisions

- OpenAPI spec at `lib/api-spec/openapi.yaml` is the single source of truth — Orval generates both Zod schemas and React hooks from it, ensuring type safety across the stack
- Zod schemas use `zod/v4` with `drizzle-zod` to auto-generate insert schemas from Drizzle tables
- The API server uses Express 5 with `pino` for structured logging; all routes validate input with generated Zod schemas before touching the DB
- `artifacts/` contains deployable server/bundled apps; `lib/` contains shared library packages consumed via workspace protocol
- esbuild bundles the api-server into a single CJS `.mjs` file with `globalThis.require` shim for CJS-only deps like Express

## Product

Lumina is an AI assistant app featuring:
- **Chat** — multi-turn conversations with streaming responses (modes: chat, search, write, artist, translate)
- **Search** — grounded answers with live source retrieval from Wikipedia and DuckDuckGo
- **Image generation** — text-to-image via OpenAI
- **Conversation management** — create, list, get, and delete conversations with message history
- **Usage stats** — view conversation and message counts

## User preferences

- Uses the `PNPM_WORKSPACE` stack in Replit
- OpenAI base URL is set to `https://api.groq.com/openai/v1` (Groq inference) via `AI_INTEGRATIONS_OPENAI_BASE_URL`
- Always run `pnpm install --frozen-lockfile` after pulling changes, then `pnpm --filter @workspace/db push` if schema changed
- The `postMerge` hook (`scripts/post-merge.sh`) runs `pnpm install --frozen-lockfile` and `pnpm --filter db push` automatically

## Gotchas

- `DATABASE_URL` must be set before running any DB-related commands; the app will throw if it's missing
- The api-server `dev` script sets `NODE_ENV=development` inline — on some shells this may not propagate; use `pnpm run build && pnpm run start` for reliability
- `artifacts/lumina` requires both `PORT` and `BASE_PATH` env vars to start
- The `api-server` port is determined by the `PORT` env var, not hardcoded
- The `post-merge` hook uses `pnpm --filter db push` (directory-based filter); `pnpm --filter @workspace/db push` also works

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
