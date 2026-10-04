#!/usr/bin/env node
// Re-verifies the ImageLightbox in a real browser.
//
//     pnpm verify:lightbox
//
// It bundles scripts/browser/lightbox-harness.tsx (which mounts the real
// component), serves it on a random local port, launches headless Chrome with
// a random DevTools port and drives it over the Chrome DevTools Protocol with
// genuine input events (mouse wheel, double-click, drag, keyboard and touch).
//
// Requires Node 22+ (global WebSocket) and a local Chrome/Chromium.
// Env: CHROME (binary path), HEADED=1 (show the window), KEEP=1 (keep the
// temporary build/profile directory for inspection).
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { launchChrome, sleep } from './chrome.mjs';
import { connect, createDriver } from './cdp.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const LUMINA = path.join(ROOT, 'artifacts/lumina');

function loadEsbuild() {
  const pnpmDir = path.join(ROOT, 'node_modules/.pnpm');
  const dir = fs.readdirSync(pnpmDir).find((entry) => entry.startsWith('esbuild@'));
  if (!dir) throw new Error('esbuild not found in node_modules/.pnpm — run `pnpm install`.');
  return require(path.join(pnpmDir, dir, 'node_modules/esbuild/lib/main.js'));
}

async function buildBundle(outDir) {
  const esbuild = loadEsbuild();
  const srcDir = path.join(LUMINA, 'src');
  const atAliasPlugin = {
    name: 'at-alias',
    setup(build) {
      build.onResolve({ filter: /^@\// }, async (args) => {
        const target = path.join(srcDir, args.path.slice(2));
        const resolved = await build.resolve(target, { resolveDir: srcDir, kind: args.kind });
        if (resolved.errors.length) return { errors: resolved.errors };
        return { path: resolved.path };
      });
    },
  };
  await esbuild.build({
    entryPoints: [path.join(HERE, 'lightbox-harness.tsx')],
    outfile: path.join(outDir, 'bundle.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    jsx: 'automatic',
    loader: { '.tsx': 'tsx', '.ts': 'ts', '.jsx': 'jsx' },
    nodePaths: [path.join(LUMINA, 'node_modules'), path.join(ROOT, 'node_modules')],
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [atAliasPlugin],
    logLevel: 'warning',
  });
}

function startStaticServer(dir) {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  const server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];
    const file = path.join(dir, urlPath === '/' ? 'index.html' : urlPath);
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function runChecks(send, results) {
  await send('Runtime.enable');
  await send('Page.enable');
  const d = createDriver(send);
  const { evaluate, key, wheel, drag, doubleClick, clickSelector, focusDialog } = d;

  const zoomText = () => evaluate(`document.querySelector('[data-testid=lightbox-zoom]').textContent`);
  const transform = () => evaluate(`document.querySelector('[data-testid=image-lightbox]').style.transform`);
  const counter = () => evaluate(`document.querySelector('[data-testid=lightbox-counter]').textContent`);
  const src = () => evaluate(`document.querySelector('[data-testid=image-lightbox]').src`);
  const isDisabled = (sel) => evaluate(`document.querySelector(${JSON.stringify(sel)}).disabled === true`);
  const panHint = () => evaluate(`!!document.querySelector('[data-testid=lightbox-pan-hint]')`);
  const touchAction = () =>
    evaluate(`getComputedStyle(document.querySelector('[data-testid=image-lightbox-stage]')).touchAction`);

  await d.waitFor('[data-testid=image-lightbox]', 'lightbox');
  const stage = await d.rect('[data-testid=image-lightbox-stage]');
  const img = await d.rect('[data-testid=image-lightbox]');
  results.fixture = { image: { w: img.w, h: img.h }, stage: { w: stage.w, h: stage.h } };

  // --- mouse / keyboard -------------------------------------------------------------
  results.initial = { zoom: await zoomText(), transform: await transform(), counter: await counter() };

  await doubleClick(stage.x, stage.y);
  results.afterDoubleClick = { zoom: await zoomText(), transform: await transform() };
  await doubleClick(stage.x, stage.y);
  results.afterDoubleClickAgain = { zoom: await zoomText(), transform: await transform() };

  await wheel(stage.x, stage.y, -100);
  results.afterWheelIn = { zoom: await zoomText(), transform: await transform() };
  await wheel(stage.x, stage.y, -100, 2); // ctrl held → fine step
  results.afterCtrlWheelIn = { zoom: await zoomText() };

  await focusDialog();
  await key('0', 'Digit0', 48);
  results.afterKeyZero = { zoom: await zoomText(), transform: await transform() };

  await doubleClick(stage.x, stage.y);
  await drag(stage.x, stage.y, 30, 20);
  results.afterDrag30 = { transform: await transform(), panHint: await panHint() };
  await drag(stage.x, stage.y, 1000, 1000);
  results.afterDragFar = { transform: await transform() };

  await focusDialog();
  await key('ArrowRight', 'ArrowRight', 39);
  await key('ArrowLeft', 'ArrowLeft', 37);
  results.indexChanges = await evaluate(`JSON.stringify(window.__log.indexChanges)`);

  await focusDialog();
  await key('Escape', 'Escape', 27);
  results.closedCount = await evaluate(`window.__log.closed`);

  await focusDialog();
  await key('0', 'Digit0', 48);
  await doubleClick(stage.x, stage.y);
  results.beforeIndexChange = { zoom: await zoomText() };
  await evaluate(`window.__setIndex(1)`);
  await sleep(150);
  results.afterIndexChange = { zoom: await zoomText(), transform: await transform(), counter: await counter() };

  // --- gallery navigation -----------------------------------------------------------
  await evaluate(`window.__setIndex(0)`);
  await sleep(150);
  results.navAtFirst = {
    counter: await counter(),
    src: await src(),
    prevDisabled: await isDisabled('[data-testid=button-lightbox-prev]'),
    nextDisabled: await isDisabled('[data-testid=button-lightbox-next]'),
  };
  await clickSelector('[data-testid=button-lightbox-next]');
  results.navAfterNext = { counter: await counter(), src: await src(), prevDisabled: await isDisabled('[data-testid=button-lightbox-prev]') };
  await clickSelector('[data-testid=button-lightbox-next]');
  results.navAtLast = { counter: await counter(), src: await src(), nextDisabled: await isDisabled('[data-testid=button-lightbox-next]') };
  await clickSelector('[data-testid=button-lightbox-prev]');
  results.navAfterPrev = { counter: await counter(), src: await src() };

  await focusDialog();
  await key('ArrowRight', 'ArrowRight', 39);
  results.navAfterArrowRight = { counter: await counter(), src: await src() };
  await key('ArrowLeft', 'ArrowLeft', 37);
  results.navAfterArrowLeft = { counter: await counter(), src: await src() };

  // Zooming then navigating must reset zoom/pan for the new image.
  await focusDialog();
  await key('0', 'Digit0', 48);
  await doubleClick(stage.x, stage.y);
  results.navResetBefore = { zoom: await zoomText(), counter: await counter() };
  await clickSelector('[data-testid=button-lightbox-next]');
  results.navResetAfter = { zoom: await zoomText(), transform: await transform(), panHint: await panHint(), counter: await counter() };

  // --- touch ------------------------------------------------------------------------
  await evaluate(`window.__setIndex(0)`); // back to the first image at fit
  await sleep(150);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: true });

  results.touchActionAtFit = await touchAction();
  await d.touchDrag(stage.x, stage.y, 60, 40);
  results.transformAfterTouchAtFit = await transform();

  await focusDialog();
  for (let i = 0; i < 4; i += 1) await key('+', 'Equal', 187);
  results.zoomAfterTouchSection = await zoomText();
  results.touchActionZoomed = await touchAction();
  const scale = parseFloat(results.zoomAfterTouchSection) / 100;
  results.scale = scale;
  results.maxX = 200 * (scale - 1);
  results.maxY = 150 * (scale - 1);

  await d.touchDrag(stage.x, stage.y, 40, 30);
  results.transformAfterTouchDrag = await transform();
  await d.touchDrag(stage.x, stage.y, 1000, 1000);
  results.transformAfterTouchFarDrag = await transform();
  results.touchPointers = await evaluate(`JSON.stringify(window.__pointers.filter((p) => p.pointerType === 'touch'))`);
}

function check(results) {
  const failures = [];
  const eq = (label, actual, expected) => {
    if (actual !== expected) failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };
  const approx = (label, actual, expected, tol = 1) => {
    const n = parseFloat(String(actual));
    if (!(Math.abs(n - expected) <= tol)) failures.push(`${label}: expected ~${expected}, got ${actual}`);
  };

  eq('initial.zoom', results.initial.zoom, '100%');
  eq('initial.transform', results.initial.transform, 'translate(0px, 0px) scale(1)');
  eq('initial.counter', results.initial.counter, '1 / 3');
  eq('doubleClick.zoom', results.afterDoubleClick.zoom, '200%');
  eq('doubleClick.transform', results.afterDoubleClick.transform, 'translate(0px, 0px) scale(2)');
  eq('doubleClickAgain.zoom', results.afterDoubleClickAgain.zoom, '100%');
  eq('wheelIn.zoom', results.afterWheelIn.zoom, '110%');
  eq('ctrlWheelIn.zoom', results.afterCtrlWheelIn.zoom, '112%');
  eq('keyZero.zoom', results.afterKeyZero.zoom, '100%');
  eq('drag30.panHint', results.afterDrag30.panHint, true);
  eq('drag30.transform', results.afterDrag30.transform, 'translate(30px, 20px) scale(2)');
  eq('dragFar.clamped', results.afterDragFar.transform, 'translate(200px, 150px) scale(2)');
  eq('indexChanges', results.indexChanges, JSON.stringify([1, 0]));
  if (results.closedCount < 1) failures.push(`closedCount: expected >= 1, got ${results.closedCount}`);
  eq('beforeIndexChange.zoom', results.beforeIndexChange.zoom, '200%');
  eq('afterIndexChange.zoom', results.afterIndexChange.zoom, '100%');
  eq('afterIndexChange.transform', results.afterIndexChange.transform, 'translate(0px, 0px) scale(1)');
  eq('afterIndexChange.counter', results.afterIndexChange.counter, '2 / 3');

  // gallery navigation
  eq('nav.atFirst.counter', results.navAtFirst.counter, '1 / 3');
  eq('nav.atFirst.prevDisabled', results.navAtFirst.prevDisabled, true);
  eq('nav.atFirst.nextDisabled', results.navAtFirst.nextDisabled, false);
  eq('nav.afterNext.counter', results.navAfterNext.counter, '2 / 3');
  eq('nav.afterNext.prevDisabled', results.navAfterNext.prevDisabled, false);
  eq('nav.atLast.counter', results.navAtLast.counter, '3 / 3');
  eq('nav.atLast.nextDisabled', results.navAtLast.nextDisabled, true);
  eq('nav.afterPrev.counter', results.navAfterPrev.counter, '2 / 3');
  eq('nav.afterArrowRight.counter', results.navAfterArrowRight.counter, '3 / 3');
  eq('nav.afterArrowLeft.counter', results.navAfterArrowLeft.counter, '2 / 3');
  // the displayed image actually changes and returns
  eq('nav.afterPrev.src returns', results.navAfterPrev.src, results.navAfterNext.src);
  eq('nav.afterArrowRight.src', results.navAfterArrowRight.src, results.navAtLast.src);
  if (new Set([results.navAtFirst.src, results.navAfterNext.src, results.navAtLast.src]).size !== 3) {
    failures.push('navigation did not show 3 distinct images');
  }
  // navigation resets zoom/pan
  eq('nav.resetBefore.zoom', results.navResetBefore.zoom, '200%');
  eq('nav.resetBefore.counter', results.navResetBefore.counter, '2 / 3');
  eq('nav.resetAfter.zoom', results.navResetAfter.zoom, '100%');
  eq('nav.resetAfter.transform', results.navResetAfter.transform, 'translate(0px, 0px) scale(1)');
  eq('nav.resetAfter.panHint', results.navResetAfter.panHint, false);
  eq('nav.resetAfter.counter', results.navResetAfter.counter, '3 / 3');

  eq('touchActionAtFit', results.touchActionAtFit, 'auto');
  eq('no pan at fit', results.transformAfterTouchAtFit, 'translate(0px, 0px) scale(1)');
  eq('touchActionZoomed', results.touchActionZoomed, 'none');
  if (!(results.scale > 1)) failures.push('touch section did not zoom in: ' + results.zoomAfterTouchSection);
  eq('touchDrag.transform', results.transformAfterTouchDrag, `translate(40px, 30px) scale(${results.scale})`);
  eq('touchFarDrag.clamped', results.transformAfterTouchFarDrag, `translate(${results.maxX}px, ${results.maxY}px) scale(${results.scale})`);
  const touchPointers = JSON.parse(results.touchPointers || '[]');
  const types = new Set(touchPointers.map((p) => p.type));
  for (const t of ['pointerdown', 'pointermove', 'pointerup']) {
    if (!types.has(t)) failures.push(`missing touch ${t} pointer event (saw ${[...types].join(',') || 'none'})`);
  }

  approx('image width', results.fixture.image.w, 400);
  approx('image height', results.fixture.image.h, 300);
  return failures;
}

async function main() {
  if (typeof WebSocket === 'undefined') throw new Error('This script needs Node 22+ (global WebSocket).');
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-lightbox-'));
  let server;
  let chrome;
  let session;
  let exitCode = 0;
  try {
    console.log('• bundling harness…');
    fs.copyFileSync(path.join(HERE, 'index.html'), path.join(workDir, 'index.html'));
    await buildBundle(workDir);

    server = await startStaticServer(workDir);
    const pageUrl = `http://127.0.0.1:${server.address().port}/`;
    console.log(`• harness served on ${pageUrl}`);

    console.log('• launching Chrome…');
    const launched = await launchChrome(path.join(workDir, 'chrome-profile'));
    chrome = launched.child;
    console.log(`• Chrome DevTools on :${launched.port}`);

    session = await connect(launched.port, pageUrl);
    const results = {};
    await runChecks(session.send, results);

    console.log('\n' + JSON.stringify(results, null, 2) + '\n');
    const failures = check(results);
    if (failures.length) {
      console.error('LIGHTBOX BROWSER VERIFICATION FAILED:');
      for (const f of failures) console.error(' - ' + f);
      exitCode = 1;
    } else {
      console.log('LIGHTBOX BROWSER VERIFICATION PASSED (real Chrome, CDP input events)');
    }
  } catch (error) {
    console.error('harness error:', error && error.message ? error.message : error);
    exitCode = 2;
  } finally {
    if (session) session.ws.close();
    if (chrome) chrome.kill('SIGKILL');
    if (server) server.close();
    if (process.env.KEEP === '1') console.log('• kept artifacts in ' + workDir);
    else fs.rmSync(workDir, { recursive: true, force: true });
  }
  process.exit(exitCode);
}

main();
