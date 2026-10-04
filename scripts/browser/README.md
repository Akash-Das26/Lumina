# Browser verification harnesses

Real-browser checks driven over the Chrome DevTools Protocol with **genuine input
events** (mouse wheel, double-click, drag, keyboard and touch). No unit-test
runner is involved — each script bundles or boots what it needs, drives headless
Chrome, prints a JSON report and exits non-zero on failure.

```bash
pnpm verify:lightbox   # the ImageLightbox in isolation
pnpm verify:flow       # sign-up → image generation → lightbox, against the real stack
```

## `pnpm verify:lightbox`

Bundles `lightbox-harness.tsx` (which mounts the real component), serves it on an
ephemeral port, launches headless Chrome on an ephemeral DevTools port and checks:

Mouse / keyboard:

- initial state is fit at `100%` with counter `1 / 3`
- double-click toggles fit ↔ `200%`
- scroll wheel zooms in (`110%`) and `Ctrl`+wheel uses the fine step (`112%`)
- `0` resets the zoom
- drag-to-pan moves the image and clamps to `imageSize × (zoom − 1) / 2` per axis
- the pan hint appears only while zoomed
- `←`/`→` request index changes; `Escape` calls `onClose`
- switching image resets zoom/pan to fit

Gallery navigation:

- `next`/`prev` buttons and `←`/`→` keys step through the images
- the counter tracks the position (`1 / 3` → `2 / 3` → `3 / 3`)
- the displayed image actually changes and returns
- `prev` is disabled on the first image and `next` on the last
- navigating resets zoom and pan for the new image

Touch:

- at fit the stage advertises `touch-action: auto` and a touch drag does not pan
- when zoomed the stage switches to `touch-action: none`, a touch drag pans and a
  far drag clamps to the bounds
- the stage receives real `pointerdown`/`pointermove`/`pointerup` events with
  `pointerType: "touch"`

## `pnpm verify:flow`

Stands up a throwaway stack — an ephemeral PostgreSQL, the real API server and
Vite dev server (via `scripts/dev-local.mjs`) and the stub image provider
(`stub-provider.mjs`) — then drives Chrome through the actual app:

- loads `/sign-up` and registers (`POST /api/auth/register` → **201**), landing on `/chat`
- selects Artist mode and starts a conversation (`POST /api/openai/conversations` → **201**)
- sends a prompt (`POST /api/openai/generate-image` → **200**)
- the persisted image renders, opens the lightbox (`1 / 1`, `100%`, `data:image/png;base64,…`), double-clicks to `200%`, and `Escape` closes it
- asserts no page exceptions

It never touches the repo's `.env`: connection settings are passed directly to the
child processes and to `db:push`. Everything runs on ephemeral ports and the
temporary directory is removed afterwards (unless `KEEP=1`).

## Files

| File | Purpose |
|---|---|
| `verify-lightbox.mjs` | Lightbox harness runner |
| `lightbox-harness.tsx` | Mounts the real `ImageLightbox` with `window` hooks |
| `verify-flow.mjs` | Full sign-up + image-generation runner |
| `stub-provider.mjs` | OpenAI-compatible stub image provider returning a real PNG |
| `index.html` | Host page for the lightbox harness |
| `cdp.mjs` | Shared CDP session + input-event driver |
| `chrome.mjs` | Shared Chrome discovery and headless launch |

## Requirements

- Node 22+ (global `WebSocket`)
- a local Chrome/Chromium
- for `verify:flow`: PostgreSQL 12+ (`initdb`/`pg_ctl`). If it is not found the
  flow check **skips with exit 0** (set `REQUIRE=1` to fail instead).

## Environment

| Variable | Effect |
|---|---|
| `CHROME` | Path to the Chrome/Chromium binary (auto-detected otherwise) |
| `PG_BIN` | PostgreSQL `bin` directory (auto-detected otherwise) |
| `HEADED=1` | Show the browser window instead of headless |
| `KEEP=1` | Keep the temporary build/profile directory for inspection |
| `REQUIRE=1` | Make `verify:flow` fail (instead of skip) when prerequisites are missing |

Ports are chosen automatically (the static server, DevTools endpoint, dev stack
and Postgres all bind to ephemeral ports), so the scripts do not clash with a
running dev stack.
