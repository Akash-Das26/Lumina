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
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const LUMINA = path.join(ROOT, 'artifacts/lumina');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const found = spawnSync('which', [name], { encoding: 'utf8' });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  }
  throw new Error('No Chrome/Chromium found. Set CHROME=/path/to/chrome.');
}

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

function startServer(dir) {
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

async function launchChrome(profileDir) {
  const chromePath = findChrome();
  const args = [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=0',
    '--remote-allow-origins=*',
    `--user-data-dir=${profileDir}`,
    '--window-size=1280,900',
    'about:blank',
  ];
  if (process.env.HEADED !== '1') args.unshift('--headless=new');

  const child = spawn(chromePath, args, { stdio: 'ignore' });
  let exited = false;
  child.on('exit', () => (exited = true));

  const activePortFile = path.join(profileDir, 'DevToolsActivePort');
  for (let i = 0; i < 100; i += 1) {
    if (exited) throw new Error('Chrome exited before exposing a DevTools port.');
    if (fs.existsSync(activePortFile)) {
      const [port] = fs.readFileSync(activePortFile, 'utf8').split('\n');
      if (port && Number(port) > 0) return { child, port: Number(port) };
    }
    await sleep(100);
  }
  child.kill('SIGKILL');
  throw new Error('Timed out waiting for Chrome DevTools port.');
}

async function connect(cdpPort, pageUrl) {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(pageUrl)}`, { method: 'PUT' });
      if (!res.ok) throw new Error('status ' + res.status);
      const target = await res.json();
      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve, reject) => {
        ws.onopen = resolve;
        ws.onerror = () => reject(new Error('websocket failed'));
      });
      let msgId = 0;
      const pending = new Map();
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) {
          const { resolve, reject } = pending.get(msg.id);
          pending.delete(msg.id);
          if (msg.error) reject(new Error(JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      };
      const send = (method, params = {}) =>
        new Promise((resolve, reject) => {
          const id = ++msgId;
          pending.set(id, { resolve, reject });
          ws.send(JSON.stringify({ id, method, params }));
        });
      return { ws, send };
    } catch {
      await sleep(250);
    }
  }
  throw new Error('Could not attach to a Chrome page target.');
}

async function runChecks({ send, results }) {
  await send('Runtime.enable');
  await send('Page.enable');

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };
  const q = (s) => JSON.stringify(s);
  const exists = (sel) => evaluate(`!!document.querySelector(${q(sel)})`);
  const zoomText = () => evaluate(`document.querySelector('[data-testid=lightbox-zoom]').textContent`);
  const transform = () => evaluate(`document.querySelector('[data-testid=image-lightbox]').style.transform`);
  const counter = () => evaluate(`document.querySelector('[data-testid=lightbox-counter]').textContent`);
  const panHint = () => evaluate(`!!document.querySelector('[data-testid=lightbox-pan-hint]')`);
  const touchAction = () => evaluate(`getComputedStyle(document.querySelector('[data-testid=image-lightbox-stage]')).touchAction`);
  const rect = (sel) =>
    evaluate(
      `(()=>{const e=document.querySelector(${q(sel)});const b=e.getBoundingClientRect();return {w:Math.round(b.width),h:Math.round(b.height),x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};})()`,
    );
  const focusDialog = () => evaluate(`document.querySelector('[role=dialog]').focus()`);

  async function clickAt(x, y, clickCount) {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount, buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount, buttons: 0 });
  }
  async function doubleClick(x, y) {
    await clickAt(x, y, 1);
    await sleep(40);
    await clickAt(x, y, 2);
    await sleep(140);
  }
  async function drag(x0, y0, dx, dy) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y: y0, button: 'left', clickCount: 1, buttons: 1 });
    await sleep(30);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + dx, y: y0 + dy, button: 'left', buttons: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x0 + dx, y: y0 + dy, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(90);
  }
  async function wheel(x, y, deltaY, modifiers = 0) {
    await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY, modifiers });
    await sleep(90);
  }
  async function key(k, code, vk) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
    await sleep(80);
  }
  async function touchDrag(x0, y0, dx, dy, steps = 6) {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
    await sleep(40);
    for (let i = 1; i <= steps; i += 1) {
      await send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: Math.round(x0 + (dx * i) / steps), y: Math.round(y0 + (dy * i) / steps), id: 1 }],
      });
      await sleep(25);
    }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(100);
  }

  for (let i = 0; i < 100; i += 1) {
    if (await exists('[data-testid=image-lightbox]')) break;
    await sleep(100);
  }
  if (!(await exists('[data-testid=image-lightbox]'))) throw new Error('lightbox did not mount');

  const stage = await rect('[data-testid=image-lightbox-stage]');
  const img = await rect('[data-testid=image-lightbox]');
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

  // --- touch ------------------------------------------------------------------------
  await evaluate(`window.__setIndex(0)`); // back to the first image at fit
  await sleep(150);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: true });

  results.touchActionAtFit = await touchAction();
  await touchDrag(stage.x, stage.y, 60, 40);
  results.transformAfterTouchAtFit = await transform();

  await focusDialog();
  for (let i = 0; i < 4; i += 1) await key('+', 'Equal', 187);
  results.zoomAfterTouchSection = await zoomText();
  results.touchActionZoomed = await touchAction();
  const scale = parseFloat(results.zoomAfterTouchSection) / 100;
  results.scale = scale;
  results.maxX = 200 * (scale - 1);
  results.maxY = 150 * (scale - 1);

  await touchDrag(stage.x, stage.y, 40, 30);
  results.transformAfterTouchDrag = await transform();
  await touchDrag(stage.x, stage.y, 1000, 1000);
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
  if (typeof WebSocket === 'undefined') {
    throw new Error('This script needs Node 22+ (global WebSocket).');
  }
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-lightbox-'));
  const profileDir = path.join(workDir, 'chrome-profile');
  fs.mkdirSync(profileDir, { recursive: true });
  let server;
  let chrome;
  let session;
  let exitCode = 0;
  try {
    console.log('• bundling harness…');
    fs.copyFileSync(path.join(HERE, 'index.html'), path.join(workDir, 'index.html'));
    await buildBundle(workDir);

    server = await startServer(workDir);
    const webPort = server.address().port;
    const pageUrl = `http://127.0.0.1:${webPort}/`;
    console.log(`• harness served on ${pageUrl}`);

    console.log('• launching Chrome…');
    const launched = await launchChrome(profileDir);
    chrome = launched.child;
    console.log(`• Chrome DevTools on :${launched.port}`);

    session = await connect(launched.port, pageUrl);
    const results = {};
    await runChecks({ send: session.send, results });

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
