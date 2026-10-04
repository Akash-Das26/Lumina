# Lightbox browser verification

Re-verify the `ImageLightbox` interactions in a real browser:

```bash
pnpm verify:lightbox
```

There are no unit-test dependencies here — the script bundles the harness, serves
it, launches headless Chrome and drives it over the Chrome DevTools Protocol with
**genuine input events**, then prints a JSON report and exits non-zero on failure.

## What it checks

Mouse / keyboard:

- initial state is fit at `100%` with counter `1 / 3`
- double-click toggles fit ↔ `200%`
- scroll wheel zooms in (`110%`) and `Ctrl`+wheel uses the fine step (`112%`)
- `0` resets the zoom
- drag-to-pan moves the image and clamps to `imageSize × (zoom − 1) / 2` per axis
- the pan hint appears only while zoomed
- `←`/`→` request index changes; `Escape` calls `onClose`
- switching image resets zoom/pan to fit

Touch:

- at fit the stage advertises `touch-action: auto` and a touch drag does not pan
- when zoomed the stage switches to `touch-action: none`, a touch drag pans and a
  far drag clamps to the bounds
- the stage receives real `pointerdown`/`pointermove`/`pointerup` events with
  `pointerType: "touch"`

## Files

- `lightbox-harness.tsx` — mounts the real component and exposes small `window`
  hooks (`__setIndex`, `__log`, `__pointers`) for the driver.
- `index.html` — host page with minimal dialog styling.
- `verify-lightbox.mjs` — bundles, serves, launches Chrome and drives it.

## Requirements

- Node 22+ (global `WebSocket`)
- a local Chrome/Chromium

## Environment

| Variable | Effect |
|---|---|
| `CHROME` | Path to the Chrome/Chromium binary (auto-detected otherwise) |
| `HEADED=1` | Show the browser window instead of headless |
| `KEEP=1` | Keep the temporary build/profile directory for inspection |

Ports are chosen automatically (the static server and the DevTools endpoint both
bind to an ephemeral port), so the script does not clash with a running dev stack.
