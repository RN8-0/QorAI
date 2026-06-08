#!/usr/bin/env node
/**
 * Qor AI — AWIN datafeed downloader
 *
 * AWIN's "Create-a-Feed" gives a programmatic download URL on
 * productdata.awin.com using a feed-specific apikey (NOT the account API
 * token). The newer ui.awin.com "darwin" URL is browser-session only, but the
 * classic productdata.awin.com/datafeed/download/... endpoint works headless
 * with the feed apikey + a numeric fid.
 *
 * URLs live in migration/.env (gitignored) as AWIN_FEED_<NAME>_URL=...  and the
 * file is written to feeds/<name>.csv.gz where the offer importer picks it up.
 *
 *   node scripts/awin-download.js            # download every AWIN_FEED_*_URL
 *   node scripts/awin-download.js coolblue   # just AWIN_FEED_COOLBLUE_URL
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FEEDS_DIR = path.join(ROOT, 'feeds');

function readEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

// AWIN_FEED_<NAME>_URL  →  feeds/<name>.csv.gz
function feedTargets(env, only) {
  const targets = [];
  for (const [key, url] of Object.entries(env)) {
    const m = key.match(/^AWIN_FEED_(.+)_URL$/);
    if (!m || !/^https?:\/\//i.test(url)) continue;
    const name = m[1].toLowerCase();
    if (only && name !== only.toLowerCase()) continue;
    targets.push({ name, url, file: path.join(FEEDS_DIR, `${name}.csv.gz`) });
  }
  return targets;
}

async function download(url, dest) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  // AWIN returns a JSON/HTML error body (not gzip) on a bad feed id / apikey.
  if (!(buf[0] === 0x1f && buf[1] === 0x8b)) {
    throw new Error(`not gzip (got ${buf.length}b: ${buf.toString('utf8').slice(0, 120)})`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function main() {
  const only = process.argv[2];
  const env = readEnv(path.join(ROOT, 'migration', '.env'));
  const targets = feedTargets(env, only);
  if (!targets.length) {
    console.error('No AWIN_FEED_*_URL entries found in migration/.env' + (only ? ` matching "${only}"` : ''));
    process.exit(1);
  }
  let ok = 0;
  for (const t of targets) {
    process.stdout.write(`  ↓ ${t.name} … `);
    try {
      const bytes = await download(t.url, t.file);
      console.log(`${(bytes / 1024).toFixed(0)} KB → feeds/${t.name}.csv.gz`);
      ok++;
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
  }
  if (!ok) process.exit(1);
}

main().catch((e) => { console.error('  ✗', e.message); process.exit(1); });
