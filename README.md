# Lumina AI

Lumina is an AI workspace with Chat, Search, Write, Artist, and Translate modes, source-backed search, document context, and conversation exports.

## Run locally

Requirements:

- Node.js 20+
- pnpm 9+
- PostgreSQL 14+
- An OpenAI-compatible API key

From the project root:

```bash
pnpm install
cp .env.example .env
```

Set `DATABASE_URL`, `OPENAI_API_KEY`, and `AI_INTEGRATIONS_OPENAI_BASE_URL` in `.env`. Then initialize the schema:

```bash
pnpm db:push
```

PostgreSQL must already be running and the database named in `DATABASE_URL` must exist. For a local database, create one with your PostgreSQL tooling (for example, `createdb lumina`) before running the command. The schema command automatically reads the root `.env`.

Start the API and frontend together:

```bash
pnpm dev
```

Open http://localhost:5173. The launcher starts the API on port 8080, Vite on port 5173, loads `.env`, proxies `/api/*` to the API, and shuts down both services together.

If a port is already in use:

```bash
API_PORT=19080 WEB_PORT=19173 pnpm dev
```

## Validate and build

```bash
pnpm run typecheck
PORT=5173 BASE_PATH=/ pnpm run build
```

Actual AI responses and saved conversations require a reachable PostgreSQL database and a valid provider key. Keep those values in `.env`, not in source control.