import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const envPath = resolve(projectRoot, '.env');

function loadEnvFile() {
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const assignment = trimmed.replace(/^export\s+/, '');
    const separator = assignment.indexOf('=');
    if (separator < 1) continue;
    const key = assignment.slice(0, separator).trim();
    let value = assignment.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile();

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const apiPort = process.env.API_PORT || '8080';
const webPort = process.env.WEB_PORT || '5173';
const sharedEnv = { ...process.env };

const api = spawn(
  pnpm,
  ['--filter', '@workspace/api-server', 'run', 'dev'],
  {
    cwd: projectRoot,
    env: { ...sharedEnv, NODE_ENV: 'development', PORT: apiPort },
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  },
);

const web = spawn(
  pnpm,
  ['--filter', '@workspace/lumina', 'run', 'dev'],
  {
    cwd: projectRoot,
    env: {
      ...sharedEnv,
      NODE_ENV: 'development',
      LOCAL_DEV: 'true',
      PORT: webPort,
      BASE_PATH: '/',
      API_URL: process.env.API_URL || `http://localhost:${apiPort}`,
    },
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  },
);

let shuttingDown = false;
function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of [api, web]) {
    if (!child.pid) continue;
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/t', '/f']);
      } else {
        process.kill(-child.pid, signal);
      }
    } catch {
      child.kill(signal);
    }
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

for (const child of [api, web]) {
  child.on('error', (error) => {
    console.error('Unable to start local service:', error.message);
    shutdown();
  });
  child.on('exit', (code) => {
    if (!shuttingDown && code !== 0) {
      console.error(`A local service exited with code ${code ?? 'unknown'}.`);
      shutdown();
    }
  });
}