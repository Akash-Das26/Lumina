# Lumina

An AI-powered chat and assistant application with conversation management, search, image generation, and multiple modes.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `PORT`, `OPENAI_API_KEY` or `AI_INTEGRATIONS_OPENAI_API_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Frontend: Vite + React 19 + Tailwind CSS v4
- OpenAI integration: `openai` SDK and React hooks

## Where things live

- **API contracts:** `lib/api-spec/openapi.yaml`
- **DB schema:** `lib/db/src/schema/`
- **API server:** `artifacts/api-server/src/`
- **Frontend app:** `artifacts/lumina/src/`
- **Shared integrations:** `lib/integrations-openai-ai-*`

## Architecture decisions

- OpenAPI is the source of truth for generated client and validation code.
- `artifacts/` contains deployable apps; `lib/` contains shared workspace packages.
- The API server bundles with esbuild.

## Product

Lumina provides Chat, Search, Write, Artist, and Translate modes; live source retrieval; image generation; conversation management; and usage stats.

## Gotchas

- `DATABASE_URL` must be set before DB commands.
- The API server uses the `PORT` environment variable.
- Lumina requires `PORT` and `BASE_PATH`.
- The OpenAI-compatible base URL may point to the configured Groq inference endpoint.

## Pointers

- See the pnpm-workspace skill for workspace structure and TypeScript setup.