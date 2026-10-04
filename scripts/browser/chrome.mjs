// Shared Chrome helpers for the browser verification harnesses.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const found = spawnSync('which', [name], { encoding: 'utf8' });
    if (found.status === 0 && found.stdout.trim()) return found.stdout.trim();
  }
  throw new Error('No Chrome/Chromium found. Set CHROME=/path/to/chrome.');
}

/**
 * Launch Chrome and wait for its DevTools endpoint. Uses `--remote-debugging-port=0`
 * and reads the chosen port from the profile's DevToolsActivePort file, so it never
 * clashes with another browser or a running dev stack.
 */
export async function launchChrome(profileDir) {
  const chromePath = findChrome();
  fs.mkdirSync(profileDir, { recursive: true });
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
