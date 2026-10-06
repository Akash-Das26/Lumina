import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

// `vite build` never serves on a port, but the Lumina and mockup-sandbox Vite
// configs read PORT and BASE_PATH while loading and throw when either is
// missing. Default them here (an existing value always wins) so a plain
// `pnpm run build` works locally, without exporting the two variables first.
// Mirror of the env setup in scripts/dev-local.mjs.
const env = {
  ...process.env,
  PORT: process.env.PORT || '5173',
  BASE_PATH: process.env.BASE_PATH || '/',
};

const build = spawn(pnpm, ['-r', '--if-present', 'run', 'build'], {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
});

build.on('error', (error) => {
  console.error('Unable to start the build:', error.message);
  process.exit(1);
});

build.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
