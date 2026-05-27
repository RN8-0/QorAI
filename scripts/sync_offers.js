/**
 * Qor AI — offer sync orchestrator
 *
 * Runs every configured affiliate connector over the catalog and writes the
 * results to the `offers` collection (and the product price rollup) through
 * scripts/lib/offers.js.
 *
 *   node scripts/sync_offers.js                    all primary products
 *   node scripts/sync_offers.js --cat=laptops      one category
 *   node scripts/sync_offers.js --limit=200        cap product count
 *   node scripts/sync_offers.js --all-variants     include non-primary SKUs
 *   node scripts/sync_offers.js --missing-only     only products with no
 *                                                  offers yet (incremental —
 *                                                  use this for automation)
 *   node scripts/sync_offers.js --auto             size the run to whatever
 *                                                  is left of the eBay daily
 *                                                  API quota (never overruns)
 *
 * Connectors with no credentials are skipped — add keys to migration/.env
 * (see scripts/connectors/*.js headers) to enable eBay / Amazon / …
 */
'use strict';

const { req } = require('../migration/pb');
const { upsertOffer } = require('./lib/offers');

const CONNECTORS = [
  require('./connectors/ebay'),
  require('./connectors/amazon'),
];

const ebay = require('./connectors/ebay');

const argv = process.argv.slice(2);
const ONLY_CAT = (argv.find(a => a.startsWith('--cat=')) || '').split('=')[1] || '';
let LIMIT = parseInt((argv.find(a => a.startsWith('--limit=')) || '').split('=')[1] || '0', 10);
const ALL_VARIANTS = argv.includes('--all-variants');
// --missing-only (alias --new): only enrich products that have no offers yet.
// Use this after every scrape batch — it skips the thousands of products
// already covered, so a daily/automated run stays cheap as the catalog grows.
const MISSING_ONLY = argv.includes('--missing-only') || argv.includes('--new');
// --auto: size the run to whatever is left of the eBay daily API quota, so
// the job never blows the limit.
const AUTO = argv.includes('--auto');
// Parallel worker pool size. eBay's daily quota is the real ceiling
// (5000 Browse calls), not concurrency — they happily accept 8 in-flight
// requests from one app key. With CALLS_PER_PRODUCT ≈ 6, 8 workers move
// us from ~1.5 products/sec to ~8 products/sec → 219 products goes from
// ~22 min to ~30 sec.
const CONCURRENCY = Math.max(1, parseInt((argv.find(a => a.startsWith('--concurrency=')) || '').split('=')[1] || '8', 10));
// Tiny inter-task spacing so we never burst right at eBay's per-second cap.
const TASK_GAP_MS = 60;

// stdout is buffered when piped through the scraper-proxy spawn → user sees
// silence for tens of seconds. Wrapping console.log in a write+drain pattern
// flushes each line, so the UI's 2-second poll picks up real-time progress.
const _stdoutWrite = process.stdout.write.bind(process.stdout);
function log(line = '') {
  _stdoutWrite(line + '\n');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Cap LIMIT to the remaining eBay Browse quota / calls-per-product.
async function applyAutoLimit() {
  const rl = await ebay.getRateLimit();
  if (!rl) { console.log('  --auto: eBay rate limit unavailable, running uncapped.'); return; }
  const perProduct = ebay.CALLS_PER_PRODUCT || 6;
  // Keep a 10% safety margin so other calls (and rounding) never overrun.
  const safe = Math.max(0, Math.floor((rl.remaining * 0.9) / perProduct));
  console.log(`  eBay quota: ${rl.remaining}/${rl.limit} left → safe for ~${safe} products (resets ${rl.reset || '?'})`);
  if (safe <= 0) { LIMIT = -1; console.log('  Quota exhausted — nothing will run today.'); return; }
  LIMIT = (LIMIT > 0) ? Math.min(LIMIT, safe) : safe;
}

async function fetchProducts() {
  const out = [];
  const parts = [];
  if (!ALL_VARIANTS) parts.push('variantPrimary=true');
  if (ONLY_CAT) parts.push(`category="${ONLY_CAT.replace(/"/g, '\\"')}"`);
  if (MISSING_ONLY) parts.push('offerCount<1');
  const filter = parts.length ? `&filter=${encodeURIComponent(parts.join(' && '))}` : '';
  let page = 1;
  for (;;) {
    const r = await req('GET',
      `/api/collections/products/records?perPage=500&page=${page}&sort=id` +
      `&fields=id,name,brand,gtin,mpn,category${filter}`);
    if (r.status !== 200) throw new Error(`fetch page ${page}: ${r.status}`);
    out.push(...(r.body.items || []));
    if (LIMIT > 0 && out.length >= LIMIT) return out.slice(0, LIMIT);
    if (page >= (r.body.totalPages || 1)) break;
    page++;
  }
  return out;
}

async function main() {
  log('\n  Offer sync\n');
  const active = CONNECTORS.filter(c => c.isConfigured());
  if (!active.length) {
    log('  No affiliate connector is configured.');
    log('  Add credentials to migration/.env — see scripts/connectors/*.js headers:');
    CONNECTORS.forEach(c => log(`    • ${c.id}`));
    log('');
    return;
  }
  log(`  Active connectors: ${active.map(c => c.id).join(', ')}`);

  if (AUTO) await applyAutoLimit();
  if (LIMIT < 0) { log('\n  Skipped — eBay daily quota is used up.\n'); return; }

  const products = await fetchProducts();
  const t0 = Date.now();
  log(`  ${products.length} products to enrich · concurrency=${CONCURRENCY}\n`);

  let offersWritten = 0;
  let noMatch = 0;
  let errors = 0;
  let processed = 0;

  const processOne = async (p, idx) => {
    const tag = `[${String(idx + 1).padStart(4)}/${products.length}]`;
    const label = `${p.brand ? p.brand + ' ' : ''}${p.name || p.id}`.slice(0, 60);
    let productOffers = 0;
    const countries = [];
    for (const conn of active) {
      try {
        const offers = await conn.searchOffers(p);
        for (const offer of offers) {
          offer.productId = offer.productId || p.id;
          const res = await upsertOffer(offer);
          if (res.ok) {
            offersWritten++;
            productOffers++;
            if (offer.country) countries.push(offer.country);
          } else {
            noMatch++;
          }
        }
      } catch (e) {
        errors++;
        log(`  ! ${tag} ${label} — ${conn.id}: ${e.message}`);
      }
    }
    processed++;
    const sym = productOffers > 0 ? '✓' : '·';
    const cntStr = productOffers > 0 ? `${productOffers} offer · ${countries.join(',')}` : 'no match';
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const rate = (processed / Math.max(1, (Date.now() - t0) / 1000)).toFixed(1);
    log(`  ${sym} ${tag} ${label.padEnd(60)} ${cntStr.padEnd(30)} · ${elapsed}s · ${rate}/s · total ${offersWritten}`);
  };

  // Simple worker pool: keep CONCURRENCY tasks in flight.
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, products.length) }, async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= products.length) return;
      await processOne(products[idx], idx);
      if (TASK_GAP_MS > 0) await sleep(TASK_GAP_MS);
    }
  });
  await Promise.all(workers);

  const totalSec = ((Date.now() - t0) / 1000).toFixed(1);
  log(`\n  Done — ${offersWritten} offers written · ${noMatch} unmatched · ${errors} errors · ${totalSec}s`);

  // Push the freshly-computed lowestPriceUSD into Typesense so the admin
  // Products page (and any Typesense-backed listing on the website) sees
  // the "Fiyatlı" filter return the right rows immediately. Without this
  // step the index lagged PB by hours/days and the dropdown looked broken.
  if (offersWritten > 0) {
    try {
      const { spawnSync } = require('child_process');
      log(`\n  Reindexing Typesense lowestPriceUSD…`);
      const r = spawnSync('node', ['scripts/ts_backfill_lowest_price.js', '--confirm'], {
        cwd: require('path').join(__dirname, '..'),
        stdio: ['ignore', 'pipe', 'pipe'],
        encoding: 'utf8',
      });
      const tail = (r.stdout || '').trim().split(/\r?\n/).slice(-2).join(' · ');
      if (r.status === 0) log(`  ✓ TS reindex: ${tail}`);
      else log(`  ! TS reindex exit=${r.status}: ${(r.stderr || '').slice(0, 200)}`);
    } catch (e) {
      log(`  ! TS reindex failed to spawn: ${e.message}`);
    }
  }
  log('');
}

main().catch(e => { log('  ✗ ' + e.message); process.exit(1); });
