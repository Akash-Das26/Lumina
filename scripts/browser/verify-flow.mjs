#!/usr/bin/env node
// End-to-end browser verification of the sign-up + image-generation flow, plus
// the provider-failure path of BUG-014.
//
//     pnpm verify:flow
//
// It stands up a throwaway stack — an ephemeral PostgreSQL, the real API
// server and Vite dev server (via scripts/dev-local.mjs) and a stub
// OpenAI-compatible provider — then drives headless Chrome over the Chrome
// DevTools Protocol: sign up, start an Artist conversation, generate an image
// and open it in the lightbox. It then starts a Chat conversation, where the
// stub rejects the key with the real provider's `401 Incorrect API key
// provided: …` message, and asserts the UI shows the mapped copy, offers Retry
// on the failed message, and never displays the provider's text.
//
// It does NOT modify the repo's .env: connection settings are passed straight
// to the child processes and to `db:push`.
//
// Requires Node 22+ (global WebSocket), a local Chrome/Chromium and PostgreSQL
// (12+). Skips (exit 0) when a prerequisite is missing unless REQUIRE=1.
// Env: CHROME, PG_BIN (PostgreSQL bin dir), HEADED=1, KEEP=1, REQUIRE=1.
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findChrome, launchChrome, sleep } from './chrome.mjs';
import { connect, createDriver } from './cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const PNPM = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

const freePort = () =>
  new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

function findPgBin() {
  const candidates = [];
  if (process.env.PG_BIN) candidates.push(process.env.PG_BIN);
  const base = '/usr/lib/postgresql';
  if (fs.existsSync(base)) for (const version of fs.readdirSync(base)) candidates.push(path.join(base, version, 'bin'));
  const which = spawnSync('which', ['initdb'], { encoding: 'utf8' });
  if (which.status === 0 && which.stdout.trim()) candidates.push(path.dirname(which.stdout.trim()));
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'initdb')) && fs.existsSync(path.join(dir, 'pg_ctl'))) return dir;
  }
  return null;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  if (result.status !== 0) {
    throw new Error(
      `command failed: ${command} ${args.join(' ')}\n${(result.stdout || '') + (result.stderr || '')}`.trim(),
    );
  }
  return result;
}

async function waitForHttp(url, label, timeoutMs = 90000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status < 500) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${label} at ${url}`);
}

/**
 * Clicks an element that is really on screen.
 *
 * The generated image arrives as an <img> that has no height until its bytes
 * decode, and the transcript scrolls as messages land, so a plain
 * `clickSelector` can fire at coordinates that hold nothing (or nothing yet).
 * This waits for a non-zero box, brings it into view and checks the click point
 * is inside the viewport before dispatching it.
 */
async function clickInView(d, selector, label = selector, timeout = 45000) {
  const start = Date.now();
  let box = null;
  while (Date.now() - start < timeout) {
    if (await d.exists(selector)) {
      box = await d.rect(selector);
      if (box && box.w > 0 && box.h > 0) break;
    }
    box = null;
    await sleep(150);
  }
  if (!box) throw new Error(`timeout waiting for a clickable ${label} (${selector})`);

  await d.evaluate(
    `document.querySelector(${d.q(selector)}).scrollIntoView({ block: 'center', inline: 'center' })`,
  );
  await sleep(250);
  box = await d.rect(selector);
  const viewport = await d.evaluate(`({ w: innerWidth, h: innerHeight })`);
  if (box.x < 0 || box.y < 0 || box.x > viewport.w || box.y > viewport.h) {
    throw new Error(`${label} is outside the viewport (${box.x},${box.y} of ${viewport.w}x${viewport.h})`);
  }
  await d.clickSelector(selector);
}

async function runFlow(session, webUrl, results) {
  await session.send('Runtime.enable');
  await session.send('Page.enable');
  await session.send('Network.enable');
  const d = createDriver(session.send);

  await d.waitFor('[data-testid=input-name]', 'sign-up form');
  await d.typeInto('[data-testid=input-name]', 'Browser Tester');
  await d.typeInto('[data-testid=input-email]', `browser-${Date.now()}@example.com`);
  await d.typeInto('[data-testid=input-password]', 'hunter2hunter2');
  await d.clickSelector('[data-testid=button-sign-up]');

  await d.waitFor('[data-testid=mode-artist]', 'chat home after sign-up');
  results.urlAfterSignUp = await d.evaluate('location.href');

  await d.clickSelector('[data-testid=mode-artist]');
  await d.clickSelector('[data-testid=button-start-conversation]');
  await d.waitFor('[data-testid=input-chat-message]', 'conversation composer');
  results.urlInConversation = await d.evaluate('location.href');
  await d.clickSelector('[data-testid=mode-artist]'); // ensure Artist mode is active
  await sleep(200);

  await d.typeInto('[data-testid=input-chat-message]', 'a calm blue rectangle');
  await d.clickSelector('[data-testid=button-send-message]');
  await d.waitFor('[data-testid=button-open-image-lightbox]', 'generated image', 45000);
  results.imageMessagePresent = await d.exists('[data-testid=button-open-image-lightbox]');

  await clickInView(d, '[data-testid=button-open-image-lightbox]', 'generated image');
  await d.waitFor('[data-testid=image-lightbox]', 'lightbox');
  // Let the dialog's open animation settle before measuring the stage.
  await sleep(400);
  results.lightboxCounter = await d.evaluate(`document.querySelector('[data-testid=lightbox-counter]').textContent`);
  results.lightboxZoom = await d.evaluate(`document.querySelector('[data-testid=lightbox-zoom]').textContent`);
  results.lightboxSrc = await d.evaluate(`document.querySelector('[data-testid=image-lightbox]').src`);

  const zoom = () => d.evaluate(`document.querySelector('[data-testid=lightbox-zoom]').textContent`);
  let current = await zoom();
  for (let attempt = 0; attempt < 3 && current === '100%'; attempt += 1) {
    const stage = await d.rect('[data-testid=image-lightbox-stage]');
    await d.doubleClick(stage.x, stage.y);
    await sleep(150);
    current = await zoom();
  }
  results.zoomAfterDoubleClick = current;

  await d.focusDialog();
  await d.key('Escape', 'Escape', 27);
  await d.waitGone('[data-testid=image-lightbox]', 'lightbox after Escape', 5000);
  results.lightboxClosedByEscape = !(await d.exists('[data-testid=image-lightbox]'));

  await runProviderFailureFlow(session, d, webUrl, results);
}

/**
 * BUG-014: the stub provider rejects the API key, so every chat request fails
 * with the provider's own 401. The user must see the mapped copy and a Retry
 * control on their message — and never the provider's text, its URL, or the key
 * fragment it echoes.
 */
async function runProviderFailureFlow(session, d, webUrl, results) {
  await session.send('Page.navigate', { url: `${webUrl}/chat` });
  await d.waitFor('[data-testid=mode-chat]', 'chat home after the image flow');
  await d.clickSelector('[data-testid=mode-chat]');
  await d.clickSelector('[data-testid=button-start-conversation]');
  await d.waitFor('[data-testid=input-chat-message]', 'chat composer');

  await d.typeInto('[data-testid=input-chat-message]', 'does the provider key work?');
  await d.clickSelector('[data-testid=button-send-message]');
  await d.waitFor('[data-testid=button-retry-message]', 'failed message with Retry', 30000);

  results.failedMessageText = await d.evaluate(
    `document.querySelector('[data-testid=message-failed]').textContent`,
  );
  results.failedMessageStillShown = await d.evaluate(
    `document.body.innerText.includes('does the provider key work?')`,
  );
  results.mappedCopyInToast = await d.evaluate(
    `document.body.innerText.includes('The AI service is not configured correctly. Please contact the administrator.')`,
  );
  results.providerTextInPage = await d.evaluate(
    `/Incorrect API key|platform\\.openai\\.com|replace-|invalid_api_key/.test(document.body.innerText)`,
  );
  results.retryVisible = await d.exists('[data-testid=button-retry-message]');

  // Retry must resend the same message (a second request), not just clear the state.
  await d.clickSelector('[data-testid=button-retry-message]');
  await d.waitFor('[data-testid=button-retry-message]', 'Retry after resending', 30000);
  results.retryVisibleAgain = await d.exists('[data-testid=button-retry-message]');
}

function collect(session, results) {
  const responses = session.events
    .filter((e) => e.method === 'Network.responseReceived')
    .map((e) => ({ url: e.params.response.url, status: e.params.response.status }))
    .filter((r) => /\/api\//.test(r.url));
  results.apiResponses = responses.filter((r) => /register|generate-image|conversations/.test(r.url));
  // One entry per chat send: the original attempt plus each Retry (BUG-014).
  results.chatSendStatuses = responses
    .filter((r) => /\/openai\/conversations\/\d+\/messages$/.test(r.url))
    .map((r) => r.status);
  results.pageErrors = session.events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => e.params.exceptionDetails?.exception?.description || e.params.exceptionDetails?.text || 'exception');
}

function check(results, webUrl) {
  const failures = [];
  const eq = (label, actual, expected) => {
    if (actual !== expected) failures.push(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  };
  const status = (fragment, expected) => {
    const hits = (results.apiResponses || []).filter((r) => r.url.includes(fragment));
    if (!hits.length) return failures.push(`no network response for ${fragment}`);
    if (!hits.some((h) => h.status === expected)) {
      failures.push(`${fragment}: expected HTTP ${expected}, got ${hits.map((h) => h.status).join(',')}`);
    }
  };

  if (!/\/chat(\/|$)/.test(results.urlAfterSignUp || '')) failures.push('did not land on /chat after sign-up: ' + results.urlAfterSignUp);
  if (!/\/chat\/\d+/.test(results.urlInConversation || '')) failures.push('did not enter a conversation: ' + results.urlInConversation);
  status('/api/auth/register', 201);
  status('/api/openai/conversations', 201);
  status('/api/openai/generate-image', 200);
  eq('imageMessagePresent', results.imageMessagePresent, true);
  eq('lightboxCounter', results.lightboxCounter, '1 / 1');
  eq('lightboxZoom', results.lightboxZoom, '100%');
  // The optimistic message renders a `data:image/png;base64,…` URI, while the
  // persisted message references the server-hosted bytes
  // (`/api/openai/images/<id>.png`, Audit 3 F-03 / BUG-008). Both are the
  // generated PNG and both are accepted here; anything else is a regression.
  const lightboxSrc = String(results.lightboxSrc || '');
  const isGeneratedPng =
    lightboxSrc.startsWith('data:image/png;base64') ||
    /\/api\/openai\/images\/\d+\.png$/.test(lightboxSrc);
  if (!isGeneratedPng) {
    failures.push('lightbox image is not the generated PNG: ' + lightboxSrc.slice(0, 60));
  }
  eq('zoomAfterDoubleClick', results.zoomAfterDoubleClick, '200%');
  eq('lightboxClosedByEscape', results.lightboxClosedByEscape, true);

  // BUG-014: a rejected provider key becomes safe copy + a retryable message.
  eq('mappedCopyInToast', results.mappedCopyInToast, true);
  eq('providerTextInPage', results.providerTextInPage, false);
  eq('retryVisible', results.retryVisible, true);
  eq('retryVisibleAgain', results.retryVisibleAgain, true);
  eq('failedMessageStillShown', results.failedMessageStillShown, true);
  if (!/Message failed to send/.test(results.failedMessageText || '')) {
    failures.push('failed message is not marked: ' + results.failedMessageText);
  }
  const chatStatuses = results.chatSendStatuses || [];
  if (chatStatuses.length < 2) {
    failures.push('Retry did not resend the message (chat sends: ' + chatStatuses.join(',') + ')');
  }
  if (chatStatuses.some((status) => status !== 502)) {
    failures.push('provider 401 was not mapped to 502: ' + chatStatuses.join(','));
  }
  if (results.pageErrors && results.pageErrors.length) failures.push('page errors: ' + results.pageErrors.join(' | '));
  return failures;
}

async function main() {
  if (typeof WebSocket === 'undefined') throw new Error('This script needs Node 22+ (global WebSocket).');

  const pgBin = findPgBin();
  const chromePath = (() => {
    try {
      return findChrome();
    } catch {
      return null;
    }
  })();
  const missing = [];
  if (!pgBin) missing.push('PostgreSQL (set PG_BIN=/path/to/postgresql/bin)');
  if (!chromePath) missing.push('Chrome/Chromium (set CHROME=/path/to/chrome)');
  if (missing.length) {
    console.log('SKIPPED: missing ' + missing.join(' and ') + '.');
    process.exit(process.env.REQUIRE === '1' ? 1 : 0);
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-flow-'));
  const pgData = path.join(workDir, 'pgdata');
  const pgSock = path.join(workDir, 'pgsock');
  fs.mkdirSync(pgSock, { recursive: true });

  let stub;
  let dev;
  let chrome;
  let session;
  let exitCode = 0;
  const sessionsDir = pgData;

  try {
    const pgPort = await freePort();
    const apiPort = await freePort();
    const webPort = await freePort();
    const stubPort = await freePort();

    console.log('• initdb…');
    run(path.join(pgBin, 'initdb'), ['-D', sessionsDir, '-U', 'postgres', '--auth-local=trust', '--auth-host=trust'], { stdio: 'ignore' });
    console.log(`• starting postgres on :${pgPort}`);
    run(path.join(pgBin, 'pg_ctl'), [
      '-D',
      sessionsDir,
      '-o',
      `-p ${pgPort} -k ${pgSock} -h 127.0.0.1`,
      '-l',
      path.join(workDir, 'pg.log'),
      'start',
    ]);

    const databaseUrl = `postgresql://postgres@127.0.0.1:${pgPort}/postgres`;
    console.log('• applying schema (drizzle-kit push)…');
    run(PNPM, ['--filter', '@workspace/db', 'run', 'push-force'], { env: { ...process.env, DATABASE_URL: databaseUrl } });

    console.log(`• starting stub provider on :${stubPort}`);
    stub = spawn(process.execPath, [path.join(HERE, 'stub-provider.mjs')], {
      env: { ...process.env, PORT: String(stubPort) },
      stdio: 'ignore',
    });

    console.log(`• starting dev stack (api :${apiPort}, web :${webPort})…`);
    dev = spawn(process.execPath, [path.join(ROOT, 'scripts/dev-local.mjs')], {
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
        OPENAI_API_KEY: 'stub-key',
        AI_INTEGRATIONS_OPENAI_BASE_URL: `http://127.0.0.1:${stubPort}/v1`,
        API_PORT: String(apiPort),
        WEB_PORT: String(webPort),
      },
      stdio: 'ignore',
      detached: true,
    });

    const apiUrl = `http://127.0.0.1:${apiPort}`;
    const webUrl = `http://127.0.0.1:${webPort}`;
    await waitForHttp(`${apiUrl}/api/healthz`, 'api');
    await waitForHttp(`${webUrl}/`, 'web');
    console.log('• services ready');

    console.log('• launching Chrome…');
    const launched = await launchChrome(path.join(workDir, 'chrome-profile'));
    chrome = launched.child;

    session = await connect(launched.port, `${webUrl}/sign-up`);
    const results = {};
    await runFlow(session, webUrl, results);
    collect(session, results);

    console.log('\n' + JSON.stringify(results, null, 2) + '\n');
    const failures = check(results, webUrl);
    if (failures.length) {
      console.error('FLOW BROWSER VERIFICATION FAILED:');
      for (const f of failures) console.error(' - ' + f);
      exitCode = 1;
    } else {
      console.log('FLOW BROWSER VERIFICATION PASSED (real Chrome, sign-up → generate → lightbox)');
    }
  } catch (error) {
    console.error('harness error:', error && error.message ? error.message : error);
    exitCode = 2;
  } finally {
    if (session) session.ws.close();
    if (chrome) chrome.kill('SIGKILL');
    if (dev) {
      dev.kill('SIGTERM');
      await sleep(2500);
      try {
        dev.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }
    if (stub) stub.kill('SIGKILL');
    if (pgBin) {
      spawnSync(path.join(pgBin, 'pg_ctl'), ['-D', sessionsDir, '-m', 'fast', 'stop'], { stdio: 'ignore' });
    }
    if (process.env.KEEP === '1') console.log('• kept artifacts in ' + workDir);
    else fs.rmSync(workDir, { recursive: true, force: true });
  }
  process.exit(exitCode);
}

main();
