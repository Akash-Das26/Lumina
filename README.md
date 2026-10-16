# Lumina AI

Lumina is an AI workspace with Chat, Search, Write, Artist, and Translate modes, source-backed search, document context, and conversation exports.

## Run locally

Requirements:

- Node.js 20+ (CI validates against Node 22)
- pnpm 9+
- PostgreSQL 14+
- An OpenAI-compatible API key (used by every AI feature — see below)

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

Set `DATABASE_URL`, `OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`, and `SESSION_SECRET` in `.env` (generate a session secret with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).

**One provider key covers every AI feature.** Chat, Search, Write and Translate call the provider's chat-completions API; Artist calls its images API. Get an OpenAI key from <https://platform.openai.com/account/api-keys> (any OpenAI-compatible provider works — set its key page's key and its base URL). The server reads `.env` **once at startup**, so restart `pnpm dev` after editing it. An empty key or the placeholder from `.env.example` (`replace-with-your-key`) is treated as *not configured* and the API exits before listening, naming the variable — it will not start a server that fails on your first message.

Then initialize the schema:

```bash
pnpm db:push
```

PostgreSQL must already be running and the database named in `DATABASE_URL` must exist. For a local database, create it with:

```bash
createdb lumina
```

If you followed the Ubuntu user/database setup above, make sure `.env` has the matching `lumina_user` connection string. `pnpm db:push` automatically reads the root `.env` and verifies the database connection while applying the schema. Do not start `pnpm dev` until it succeeds; otherwise database-backed API routes will fail because the tables are missing.

> **Upgrading an existing database:** re-run `pnpm db:push` after pulling these changes. It adds the `message_images` table that stores generated-image bytes; new images are persisted there and referenced from message text. Images saved before the upgrade keep working as inline `data:` URIs — no backfill is required.

Start the API and frontend together:

```bash
pnpm dev
```

Open http://localhost:5173. The launcher starts the API on port 8080, Vite on port 5173, loads `.env`, proxies `/api/*` to the API, and shuts down both services together.

The API checks the database **before** it starts listening: if PostgreSQL is unreachable or the schema was never pushed, it exits immediately with the reason and the fix (`pnpm db:push`) instead of starting a server whose every database-backed request would fail. Once it is running, the same check is available any time:

```bash
curl -s localhost:8080/api/health   # readiness: database reachable AND schema applied
curl -s localhost:8080/api/healthz  # liveness: the process is up (no database access)
```

`/api/health` answers `{"status":"ok","database":"ok"}` when the setup is usable, or `503` with `"database":"unreachable"` / `"schema-missing"` plus the command that fixes it.

If a port is already in use:

```bash
API_PORT=19080 WEB_PORT=19173 pnpm dev
```

## Troubleshooting local setup

**The UI says "Unable to create your account. Please try again." or "Can't reach the server."**

These are the API's own failure classes: the first is a server-side error (5xx), the second means the request never reached the API at all. Find the real cause in this order:

```bash
curl -s localhost:8080/api/health   # is the API up, and can it reach the database?
```

- `curl: command not found` / connection refused → the API is not running: check the `pnpm dev` terminal, or start it with `pnpm --filter @workspace/api-server run dev`.
- `"database":"unreachable"` → PostgreSQL is not running, or `DATABASE_URL` in `.env` has the wrong host, port, user or password (see below).
- `"database":"schema-missing"` → the database is reachable but empty: run `pnpm db:push`.

Every 500 is also logged by the API itself, as one JSON line at `error` level with the request id, the request and the real error (including the stack). The client is never sent the stack, SQL text or connection details — that is what the banner hides, and the log line is where it lives.

**`password authentication failed for user "…"`**

`DATABASE_URL` and the running PostgreSQL disagree about that user's password (PostgreSQL reports the same message when the role does not exist at all, so check both). Run these as the `postgres` superuser:

```bash
# Debian/Ubuntu: connect as the postgres OS user over the local socket
# (no superuser role password needed; this is the setup the install steps above create)
sudo -u postgres psql -c "\du"                             # does the role exist? note its attributes
sudo -u postgres psql -c "ALTER ROLE lumina_user WITH PASSWORD 'new-password';"
# ...and if \du did not list it at all:
sudo -u postgres createuser --pwprompt lumina_user           # then: createdb -O lumina_user lumina

# macOS (Homebrew) or any server where the superuser has a password of its own
psql -U postgres -h localhost -c "\du"
```

`DATABASE_URL` must name the same user, password, host, port and database in one URL:

```env
DATABASE_URL=postgresql://lumina_user:new-password@localhost:5432/lumina
```

**Special characters in the password must be URL-encoded** in that URL — `@` → `%40`, `#` → `%23`, `/` → `%2F`, `:` → `%3A`, `?` → `%3F`, `%` → `%25` (PostgreSQL receives the decoded value). A password containing `@` is the most common cause of "the password is right but it still fails"; choosing a password of letters, digits, `-` and `_` avoids the question entirely.

Re-run `pnpm db:push` afterwards — until it succeeds the tables do not exist, and the API will refuse to start with `schema-missing`.

**`database "lumina" does not exist`**

```bash
createdb lumina            # or: sudo -u postgres createdb -O lumina_user lumina
```

**`relation "users" does not exist`** (or `database: schema-missing`)

The schema was never applied. `pnpm db:push` reads the root `.env`, applies every table and verifies the connection while doing it. Run it before `pnpm dev`, and re-run it after pulling changes that add tables.

**The API exits at startup**

That is intentional (see above): the printed line names the reason — a missing or placeholder provider key (`OPENAI_API_KEY is not set` / `OPENAI_API_KEY in .env still holds the placeholder value from .env.example`), a provider base URL that is missing or malformed, `unreachable`, or `schema-missing` — plus the underlying driver error. The provider checks run before the database ones. Fix it and start again — no request has to fail first.

**A reply fails with a message about "the AI service"**

The API never forwards the provider's own error text to the browser (it can contain part of your key, and it is not actionable for whoever is using the app). It is classified, answered with fixed copy, and the real provider status, code and message are logged server-side — redacted — with the request id, so `LOG_LEVEL=debug` plus the API terminal is where to look:

| Message shown | Status | Provider said | What to do |
|---|---|---|---|
| The AI service is not configured correctly. Please contact the administrator. | 502 | 401 / 403 | The key is wrong, revoked, or for another provider's base URL. Set a real `OPENAI_API_KEY` and a matching `AI_INTEGRATIONS_OPENAI_BASE_URL` in `.env`, then restart. |
| The AI service is busy or over quota. Please try again later. | 503 | 429 | Rate limit or exhausted quota on the provider account. Wait, or raise the limit. |
| The AI service did not respond. Please try again. | 504 | timeout / connection failure | The provider is unreachable or too slow (wrong `AI_INTEGRATIONS_OPENAI_BASE_URL`, no network, provider outage). |
| Internal server error | 500 | anything else | An unclassified provider failure or a bug: the API log line "provider request failed" carries the real cause with the request id. |

In the chat, a message that failed this way stays in the transcript with **Message failed to send** and a **Retry** button; the toast shows the mapped copy above. When the request never reached the API at all (API process down, browser offline), the text you typed is put back in the composer instead — nothing was saved anywhere, so nothing is lost.

## Validate and build

```bash
pnpm run typecheck
pnpm test
pnpm audit
pnpm run build
```

`pnpm run build` typechecks and builds every package; it defaults `PORT` and `BASE_PATH` for the web builds (see `scripts/build.mjs`), so no variables need to be exported first. Set either explicitly to override, e.g. `BASE_PATH=/app pnpm run build`. `pnpm test` runs the unit and component suites across the workspace (the API tests mock the database and need no Postgres; the env-gated integration suite is skipped unless `E2E_DATABASE_URL` is set). `pnpm audit` must report **no known vulnerabilities** — the workspace pins patched transitive versions with `overrides` in `pnpm-workspace.yaml`, so a new advisory there should be remediated there rather than ignored. CI runs the typecheck, the test suite, and the browser harnesses.

Actual AI responses and saved conversations require a reachable PostgreSQL database and a valid provider key. Keep those values in `.env`, not in source control.