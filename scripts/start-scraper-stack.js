#!/usr/bin/env node
'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPTS = path.join(ROOT, 'scripts');
const IS_WIN = process.platform === 'win32';
const NODE = process.execPath;
const NPM = IS_WIN ? 'npm.cmd' : 'npm';
const DOCKER = IS_WIN ? 'docker.exe' : 'docker';
const TRANSLATE_URL = 'http://127.0.0.1:8797/health';
const PROXY_URL = 'http://127.0.0.1:3456/health';
const FLARE_URL = 'http://127.0.0.1:8191/';

function log(message) {
  console.log(`[qorai-stack] ${message}`);
}

function exists(file) {
  try { return fs.existsSync(file); } catch { return false; }
}

function commandOk(cmd, args = ['--version']) {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'ignore', shell: false });
  return r.status === 0;
}

function run(cmd, args, label, opts = {}) {
  log(label || `${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: opts.capture ? 'pipe' : 'inherit',
    shell: false,
    env: { ...process.env, ...(opts.env || {}) },
    encoding: opts.capture ? 'utf8' : undefined,
  });
  if (r.status !== 0 && opts.required !== false) {
    const err = opts.capture ? (r.stderr || r.stdout || '').trim() : '';
    throw new Error(`${label || cmd} failed${err ? `: ${err}` : ''}`);
  }
  return r;
}

function get(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode, body }));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function waitFor(url, timeoutMs = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const r = await get(url, 1500);
    if (r && r.ok) return r;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return null;
}

async function healthJson(url) {
  const r = await get(url, 2000);
  if (!r || !r.ok) return null;
  try { return JSON.parse(r.body || '{}'); } catch { return {}; }
}

function ensureNodeDeps() {
  const required = [
    path.join(ROOT, 'node_modules', 'puppeteer-real-browser'),
    path.join(ROOT, 'node_modules', 'puppeteer-extra'),
    path.join(ROOT, 'node_modules', '@xenova', 'transformers'),
  ];
  if (required.every(exists)) {
    log('Node dependencies OK.');
    return;
  }
  if (!commandOk(NPM, ['--version'])) {
    throw new Error('npm was not found. Install Node.js LTS, then run this launcher again.');
  }
  run(NPM, ['install'], 'Installing missing Node dependencies');
}

function findPythonLauncher() {
  if (IS_WIN && commandOk('py.exe', ['-3', '--version'])) return { cmd: 'py.exe', prefix: ['-3'] };
  if (commandOk('python.exe', ['--version'])) return { cmd: 'python.exe', prefix: [] };
  if (commandOk('python3', ['--version'])) return { cmd: 'python3', prefix: [] };
  if (commandOk('python', ['--version'])) return { cmd: 'python', prefix: [] };
  return null;
}

function venvPythonPath() {
  return IS_WIN
    ? path.join(SCRIPTS, 'translate-venv', 'Scripts', 'python.exe')
    : path.join(SCRIPTS, 'translate-venv', 'bin', 'python');
}

function ensurePythonVenv() {
  const py = venvPythonPath();
  if (exists(py)) return py;
  const launcher = findPythonLauncher();
  if (!launcher) {
    log('Python was not found; local JS translate worker will be used instead.');
    return '';
  }
  run(
    launcher.cmd,
    [...launcher.prefix, '-m', 'venv', path.join(SCRIPTS, 'translate-venv')],
    'Creating scripts/translate-venv',
    { required: false }
  );
  return exists(py) ? py : '';
}

function pythonCanImport(py, modules) {
  if (!py || !exists(py)) return false;
  const code = modules.map(m => `import ${m}`).join('; ');
  const r = spawnSync(py, ['-c', code], { cwd: ROOT, stdio: 'ignore', shell: false });
  return r.status === 0;
}

function ensurePythonTranslateDeps(py) {
  if (!py || !exists(py)) return false;
  if (pythonCanImport(py, ['ctranslate2', 'sentencepiece', 'huggingface_hub'])) return true;
  run(py, ['-m', 'pip', 'install', '--upgrade', 'pip'], 'Upgrading translate pip', { required: false });
  const r = run(
    py,
    ['-m', 'pip', 'install', '--upgrade', 'ctranslate2', 'sentencepiece', 'huggingface_hub'],
    'Installing Python translate dependencies',
    { required: false }
  );
  return r.status === 0 && pythonCanImport(py, ['ctranslate2', 'sentencepiece', 'huggingface_hub']);
}

function cudaDeviceCount(py) {
  if (!py || !exists(py)) return 0;
  const r = run(
    py,
    ['-c', 'import ctranslate2; print(ctranslate2.get_cuda_device_count())'],
    'Checking CUDA for translate worker',
    { capture: true, required: false }
  );
  const n = parseInt(String(r.stdout || '').trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function ensureNllbModel(py) {
  const modelDir = path.join(SCRIPTS, 'nllb-ct2');
  const required = ['model.bin', 'sentencepiece.bpe.model', 'config.json']
    .map(name => path.join(modelDir, name));
  if (required.every(exists)) return true;
  if (!py || !exists(py)) return false;
  const hfCli = IS_WIN
    ? path.join(SCRIPTS, 'translate-venv', 'Scripts', 'huggingface-cli.exe')
    : path.join(SCRIPTS, 'translate-venv', 'bin', 'huggingface-cli');
  if (!exists(hfCli)) return false;
  const r = run(
    hfCli,
    [
      'download',
      'entai2965/nllb-200-distilled-600M-ctranslate2',
      '--local-dir',
      modelDir,
      '--local-dir-use-symlinks=False',
    ],
    'Downloading NLLB CTranslate2 model',
    { required: false }
  );
  return r.status === 0 && required.every(exists);
}

function spawnDetached(cmd, args, title, stdoutFile, stderrFile, env = {}) {
  fs.mkdirSync(path.dirname(stdoutFile), { recursive: true });
  const out = fs.openSync(stdoutFile, 'a');
  const err = fs.openSync(stderrFile, 'a');
  const child = spawn(cmd, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    detached: true,
    // windowsHide:true => CREATE_NO_WINDOW. Without it the detached worker still
    // attaches to the launcher's console, so closing that window delivers a
    // CTRL_CLOSE_EVENT and the (Fortran/MKL-backed) translate worker aborts with
    // "forrtl: error (200): program aborting due to window-CLOSE event". With no
    // console attached the worker truly runs in the background and survives the
    // launcher window being closed. Output already goes to the log files below.
    stdio: ['ignore', out, err],
    windowsHide: true,
    shell: false,
  });
  child.unref();
  log(`${title} started (PID ${child.pid}).`);
  log(`  stdout: ${stdoutFile}`);
  log(`  stderr: ${stderrFile}`);
  return child;
}

async function ensureTranslateWorker() {
  const existing = await healthJson(TRANSLATE_URL);
  if (existing) {
    log(`Translate worker already running (${existing.provider || existing.model || 'health OK'}).`);
    return;
  }

  const py = ensurePythonVenv();
  let command = NODE;
  let args = [path.join(SCRIPTS, 'local-translate-worker.mjs')];
  let label = 'JS translate worker';

  if (py && ensurePythonTranslateDeps(py) && ensureNllbModel(py)) {
    const cuda = cudaDeviceCount(py);
    if (cuda > 0) {
      command = py;
      args = [path.join(SCRIPTS, 'nllb-translate-worker.py')];
      label = `NLLB GPU translate worker (CUDA devices: ${cuda})`;
    } else {
      log('No CUDA device detected; using JS translate worker fallback for this PC.');
    }
  } else {
    log('Python NLLB worker setup is incomplete; using JS translate worker fallback.');
  }

  spawnDetached(
    command,
    args,
    label,
    path.join(ROOT, 'local-translate-worker.log'),
    path.join(ROOT, 'local-translate-worker.err'),
    { QORAI_TRANSLATE_PORT: '8797', QORAI_TRANSLATE_HOST: '127.0.0.1' }
  );

  const ok = await waitFor(TRANSLATE_URL, 20000);
  if (ok) log('Translate worker health OK.');
  else log('Translate worker is starting in the background; first model load can take a while.');
}

async function ensureFlareSolverr() {
  const existing = await get(FLARE_URL, 2000);
  if (existing && existing.ok) {
    log('FlareSolverr already running.');
    return;
  }
  if (!commandOk(DOCKER, ['--version'])) {
    log('Docker not found; FlareSolverr sidecar skipped. Proxy will still run with local Chrome fallback.');
    return;
  }
  const info = spawnSync(DOCKER, ['info'], { cwd: ROOT, stdio: 'ignore', shell: false });
  if (info.status !== 0) {
    log('Docker is installed but not running; start Docker Desktop to enable automatic Cloudflare solving.');
    return;
  }

  const inspect = spawnSync(DOCKER, ['inspect', 'flaresolverr'], { cwd: ROOT, stdio: 'ignore', shell: false });
  if (inspect.status === 0) {
    run(DOCKER, ['start', 'flaresolverr'], 'Starting existing FlareSolverr container', { required: false });
  } else {
    run(
      DOCKER,
      [
        'run', '-d',
        '--name', 'flaresolverr',
        '-p', '8191:8191',
        '-e', 'LOG_LEVEL=info',
        '-e', 'BROWSER_TIMEOUT=60000',
        '--restart', 'unless-stopped',
        'ghcr.io/flaresolverr/flaresolverr:latest',
      ],
      'Creating FlareSolverr container',
      { required: false }
    );
  }

  const ok = await waitFor(FLARE_URL, 30000);
  if (ok) log('FlareSolverr health OK.');
  else log('FlareSolverr did not answer yet; proxy will re-probe it every 60s.');
}

async function startProxy() {
  const existing = await healthJson(PROXY_URL);
  if (existing) {
    log(`Scraper proxy already running on localhost:3456 (version ${existing.version || 'unknown'}, PID ${existing.pid || '?'})`);
    log('Close the old "Qor AI Scraper Proxy" window and run this launcher again if you need the newest code loaded.');
    return;
  }
  log('Starting scraper proxy in this window.');
  const child = spawn(NODE, [path.join(SCRIPTS, 'scraper-proxy.js')], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env },
  });
  child.on('exit', (code) => process.exit(code || 0));
}

async function main() {
  log(`Repository: ${ROOT}`);
  ensureNodeDeps();
  await ensureFlareSolverr();
  await ensureTranslateWorker();
  await startProxy();
}

main().catch((err) => {
  console.error(`[qorai-stack] ERROR: ${err.message || err}`);
  process.exit(1);
});
