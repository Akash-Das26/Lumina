# Lumina AI

Lumina is a focused AI workspace with Chat, Search, Write, Artist, and Translate modes. This folder is self-contained: it includes the frontend, API server, shared packages, database schema, generated API types, and local development scripts.

## Run locally

Requirements:

- Node.js 20 or newer
- pnpm 9 or newer
- PostgreSQL 14 or newer
- An OpenAI-compatible API key

From this folder:

```bash
pnpm install
cp .env.example .env
```

Edit `.env` and set:

- `DATABASE_URL` to a database you can access locally
- `OPENAI_API_KEY` to your provider key
- `AI_INTEGRATIONS_OPENAI_BASE_URL` to `https://api.openai.com/v1`, or to another compatible provider

Create/update the database schema:

```bash
pnpm db:push
```

Start both the API and web app with one command:

```bash
pnpm dev
```

Open http://localhost:5173.

The local launcher:

- Runs the API on port `8080`
- Runs Vite on port `5173`
- Proxies `/api/*` from the web app to the API
- Loads variables from `.env`
- Stops both processes together with Ctrl+C

To run services separately:

```bash
pnpm dev:api
pnpm dev:web
```

## Validate and build

```bash
pnpm run typecheck
PORT=5173 BASE_PATH=/ pnpm run build
```

The API requires `DATABASE_URL`, `OPENAI_API_KEY` (or `AI_INTEGRATIONS_OPENAI_API_KEY`), and `AI_INTEGRATIONS_OPENAI_BASE_URL` at runtime. Never commit `.env` or paste keys into source control.