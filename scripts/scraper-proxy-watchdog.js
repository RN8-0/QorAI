#!/usr/bin/env node
/**
 * Auto-restart wrapper for scraper-proxy.js.
 *
 * Why this exists:
 *   The proxy occasionally needs a hard restart — either because Cloudflare
 *   has completely flagged the current IP/session, or because the underlying
 *   Puppeteer browser has hit an unrecoverable state. Asking the user to
 *   `Ctrl+C` and `npm run scraper:proxy` again after every burn is brittle:
 *   they have to babysit a multi-thousand-product scrape for hours.
 *
 *   This watchdog spawns the proxy as a child, forwards stdio, and respawns
 *   it whenever it exits (whether crashed, killed, or asked nicely via
 *   `/deep-restart`). The scraper UI can then trigger a fresh fingerprint by
 *   simply hitting `/deep-restart` and polling `/health` until the watchdog
 *   has the new instance ready.
 *
 * Usage:
 *   npm run scraper:proxy        (now wired to this script)
 *   node scripts/scraper-proxy-watchdog.js [port]
 */

const { spawn } = require('child_process');
const path = require('path');

const PROXY_SCRIPT = path.join(__dirname, 'scraper-proxy.js');
const RESTART_DELAY_MS = 5000;
const MAX_RESTARTS_PER_MINUTE = 6; // hard cap to avoid tight crash loops

const args = process.argv.slice(2);
let restartTimestamps = [];
let shuttingDown = false;
let child = null;

function spawnChild() {
  console.log(`\n[watchdog] starting proxy → ${PROXY_SCRIPT} ${args.join(' ')}`);
  child = spawn(process.execPath, [PROXY_SCRIPT, ...args], {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    const now = Date.now();
    restartTimestamps = restartTimestamps.filter((t) => now - t < 60_000);
    restartTimestamps.push(now);

    console.log(
      `\n[watchdog] proxy exited (code=${code} signal=${signal || 'none'}). ` +
        `Restart ${restartTimestamps.length}/${MAX_RESTARTS_PER_MINUTE} in last 60s.`
    );

    if (restartTimestamps.length > MAX_RESTARTS_PER_MINUTE) {
      console.error(
        `[watchdog] too many restarts in 60s — bailing out so we don't burn CPU. ` +
          `Investigate scraper-proxy.js logs above before retrying.`
      );
      process.exit(1);
    }

    setTimeout(spawnChild, RESTART_DELAY_MS);
  });

  child.on('error', (err) => {
    console.error(`[watchdog] failed to spawn proxy: ${err.message}`);
  });
}

function shutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[watchdog] received ${sig} — shutting down child and exiting.`);
  if (child && !child.killed) {
    try {
      child.kill(sig);
    } catch (_) {}
  }
  setTimeout(() => process.exit(0), 1500);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGHUP', () => shutdown('SIGHUP'));

spawnChild();
