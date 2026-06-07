'use strict';
// Batched Amazon affiliate sync.
// PocketBase offset limit hits at ~page 30 (15k rows). Fix: run --limit=500
// in a loop — each pass fetches from page 1 (products without offers), syncs
// them, then the next pass picks the next fresh batch automatically.

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

const BATCH = 500;
const NODE = process.execPath;
const SCRIPT = path.join(__dirname, 'sync_offers.js');
const PATCH = path.join(__dirname, 'dns-patch.js');

function countMissing() {
  const { req, auth } = require('../migration/pb');
  return auth()
    .then(() => req('GET', '/api/collections/products/records?perPage=1&filter=' + encodeURIComponent('offerCount<1')))
    .then(r => r.body?.totalItems || 0)
    .catch(() => -1);
}

async function main() {
  console.log('\n  Amazon affiliate sync — batched mode\n');
  let pass = 1;
  for (;;) {
    const missing = await countMissing();
    if (missing === 0) { console.log('\n  All products have Amazon offers. Done.\n'); break; }
    if (missing < 0) { console.error('  Could not count remaining products.'); process.exitCode = 1; break; }
    console.log(`  Pass ${pass} — ~${missing} products still without offers`);
    const r = spawnSync(NODE, [
      '--require', PATCH,
      SCRIPT,
      '--connector=amazon',
      '--missing-only',
      `--limit=${BATCH}`,
    ], {
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    });
    if (r.status !== 0) {
      console.error(`  Pass ${pass} failed (exit ${r.status}).`);
      process.exitCode = 1;
      break;
    }
    pass++;
    if (pass > 500) { console.error('  Safety: too many passes.'); break; }
  }
}

main().catch(e => { console.error(e); process.exitCode = 1; });
