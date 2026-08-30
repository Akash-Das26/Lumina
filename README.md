# Lumina AI

Lumina is an AI workspace with Chat, Search, Write, Artist, and Translate modes, source-backed search, document context, and conversation exports.

## Run locally

Requirements:

- Node.js 20+
- pnpm 9+
- PostgreSQL 14+
- An OpenAI-compatible API key

If `createdb` prints `command not found` on macOS with zsh, install PostgreSQL and add its command-line tools:

```bash
brew install postgresql@16
brew services start postgresql@16
export PATH="$(brew --prefix postgresql@16)/bin:$PATH"
```

To keep that `PATH` change after restarting Terminal:

```bash
echo 'export PATH="$(brew --prefix postgresql@16)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

You can also create the database through `psql` if that command is available:

```bash
psql postgres -c "CREATE DATABASE lumina;"
```

On Ubuntu, install and start PostgreSQL with:

```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

Create a local database user and database:

```bash
sudo -u postgres createuser --pwprompt lumina_user
sudo -u postgres createdb -O lumina_user lumina
```

Then set `DATABASE_URL` in `.env` using the password you chose:

```env
DATABASE_URL=postgresql://lumina_user:YOUR_PASSWORD@localhost:5432/lumina
```

From the project root:

```bash
pnpm install
cp .env.example .env
```

Set `DATABASE_URL`, `OPENAI_API_KEY`, and `AI_INTEGRATIONS_OPENAI_BASE_URL` in `.env`. Then initialize the schema:

```bash
pnpm db:push
```

PostgreSQL must already be running and the database named in `DATABASE_URL` must exist. For a local database, create it with:

```bash
createdb lumina
```

If you followed the Ubuntu user/database setup above, use `lumina_user` and its password in `DATABASE_URL`, then verify the connection before pushing the schema:

```bash
psql "$DATABASE_URL" -c "select 1;"
pnpm db:push
```

The schema command automatically reads the root `.env`. Do not start `pnpm dev` until `pnpm db:push` succeeds; otherwise the frontend can start while database-backed API routes return errors because the tables are missing.

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