'use strict';
// Batched Amazon affiliate sync.
// PocketBase offset limit hits at ~page 30 (15k rows). Fix: run --limit=500
// in a loop — each pass fetches from page 1 (products without offers), syncs
// them, then the next pass picks the next fresh batch automatically.
//
// Reindex is deferred: each batch runs with NO_REINDEX=1, and the full
// Typesense lowestPriceUSD backfill runs ONCE after the loop, not per batch.

const dns = require('dns');
const origLookup = dns.lookup.bind(dns);
const OVERRIDES = {
  'yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io': '46.225.95.201',
  'lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io': '46.225.95.201',
};
dns.lookup = function patchedLookup(hostname, options, cb) {
  if (typeof options === 'function') { cb = options; options = {}; }
  const ip = OVERRIDES[hostname];
  if (ip) {
    const family = ip.includes(':') ? 6 : 4;
    if (options && options.all) return setImmediate(() => cb(null, [{ address: ip, family }]));
    return setImmediate(() => cb(null, ip, family));
  }
  return origLookup(hostname, options, cb);
};

const { spawnSync } = require('child_process');
const path = require('path');

const BATCH = 2000;
const NODE = process.execPath;
const SCRIPT = path.join(__dirname, 'sync_offers.js');
const PATCH = path.join(__dirname, 'dns-patch.js');
const ROOT = path.join(__dirname, '..');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Count products still missing an Amazon offer. Retries a few times because a
// transient auth/network blip should not abort the whole run.
async function countMissing() {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      delete require.cache[require.resolve('../migration/pb')];
      const { req, auth } = require('../migration/pb');
      await auth();
      const r = await req('GET', '/api/collections/products/records?perPage=1&filter=' +
        encodeURIComponent('offerCount<1'));
      if (r.status === 200) return r.body?.totalItems ?? 0;
    } catch (e) {
      if (attempt === 4) console.error(`  countMissing failed: ${e.message}`);
    }
    await sleep(1500 * attempt);
  }
  return -1;
}

function runReindex() {
  console.log('\n  Final Typesense lowestPriceUSD reindex…');
  const r = spawnSync(NODE, ['--require', PATCH, 'scripts/ts_backfill_lowest_price.js', '--confirm'], {
    stdio: 'inherit',
    cwd: ROOT,
  });
  console.log(r.status === 0 ? '  ✓ reindex done' : `  ! reindex exit=${r.status}`);
}

async function main() {
  console.log('\n  Amazon affiliate sync — batched mode\n');
  let pass = 1;
  let anyWritten = false;
  for (;;) {
    const missing = await countMissing();
    if (missing === 0) { console.log('\n  All products have Amazon offers.'); break; }
    if (missing < 0) { console.error('  Could not count remaining products after retries.'); process.exitCode = 1; break; }
    console.log(`  Pass ${pass} — ~${missing} products still without offers`);
    const r = spawnSync(NODE, [
      '--require', PATCH,
      SCRIPT,
      '--connector=amazon',
      '--missing-only',
      `--limit=${BATCH}`,
      '--concurrency=12',
    ], {
      stdio: 'inherit',
      cwd: ROOT,
      env: { ...process.env, NO_REINDEX: '1' },
    });
    if (r.status !== 0) {
      console.error(`  Pass ${pass} failed (exit ${r.status}).`);
      process.exitCode = 1;
      break;
    }
    anyWritten = true;
    pass++;
    if (pass > 200) { console.error('  Safety: too many passes.'); break; }
  }
  if (anyWritten) runReindex();
}

main().catch(e => { console.error(e); process.exitCode = 1; });
