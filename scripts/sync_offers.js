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
 *   node scripts/sync_offers.js --connector=awin   run one connector only
 *   node scripts/sync_offers.js --all-variants     include non-primary SKUs
 *   node scripts/sync_offers.js --missing-only     only products with no
 *                                                  offers yet (incremental —
 *                                                  use this for automation)
 *   node scripts/sync_offers.js --auto             accepted for backwards
 *                                                  compatibility; currently no-op
 *
 * Connectors with no credentials are skipped — add keys to migration/.env
 * (see scripts/connectors/*.js headers) to enable Amazon / Awin / …
 */
'use strict';

const { req } = require('../migration/pb');
const { upsertOffer, deleteOffersForProductNetwork, refreshProductRollup } = require('./lib/offers');

const CONNECTORS = [
  require('./connectors/amazon'),
  require('./connectors/awin'),
  require('./connectors/admitad'),
  require('./connectors/jsonld'),
  require('./connectors/epey_amazon'),
  require('./connectors/geizhals_best'),
  require('./connectors/amazon_direct'),
];

const argv = process.argv.slice(2);
const ONLY_CAT = (argv.find(a => a.startsWith('--cat=')) || '').split('=')[1] || '';
let LIMIT = parseInt((argv.find(a => a.startsWith('--limit=')) || '').split('=')[1] || '0', 10);
const ALL_VARIANTS = argv.includes('--all-variants');
// --missing-only (alias --new): only enrich products that have no offers yet.
// Use this after every scrape batch — it skips the thousands of products
// already covered, so a daily/automated run stays cheap as the catalog grows.
const MISSING_ONLY = argv.includes('--missing-only') || argv.includes('--new');
const CONNECTOR_FILTER = ((argv.find(a => a.startsWith('--connector=')) ||
  argv.find(a => a.startsWith('--only=')) || '').split('=')[1] || '')
  .trim()
  .toLowerCase();
// --sort=<pb sort expr>: pick WHICH products a capped run enriches. The price
// cron uses this for its two passes: refresh (`bestOfferCheckedAt` — oldest
// checked first; rollup stamps scan time even when no offer was found) and
// discovery (`bestOfferCheckedAt,-techScore` — never-checked flagships first).
const SORT = (argv.find(a => a.startsWith('--sort=')) || '').slice('--sort='.length).trim() || 'id';
// --filter-extra=<pb filter expr>, AND-ed into the product query. Example:
//   --filter-extra=pricedOfferCount>0     only products currently showing a price
const FILTER_EXTRA = (argv.find(a => a.startsWith('--filter-extra=')) || '').slice('--filter-extra='.length).trim();
// --auto is kept as a harmless compatibility flag for the admin UI/proxy.
// It used to size runs around an external marketplace quota; no quota-limited
// offer source is currently active.
const AUTO = argv.includes('--auto');
// Parallel worker pool size. With search-link connectors this mostly controls
// PocketBase write concurrency.
const CONCURRENCY = Math.max(1, parseInt((argv.find(a => a.startsWith('--concurrency=')) || '').split('=')[1] || '8', 10));
// Tiny inter-task spacing so downstream APIs and PocketBase are not bursty.
const TASK_GAP_MS = 60;
const SUPPORTED_CATEGORY_IDS = new Set([
  'smartphones',
  'feature_phones',
  'smartwatches',
  'smart_rings',
  'headphones',
  'powerbanks',
  'chargers',
  'laptops',
  'desktops',
  'tablets',
  'e_readers',
  'vr_headsets',
  'graphics_cards',
  'cpus',
  'motherboards',
  'ram',
  'ssd',
  'psu',
  'pc_cases',
  'ups',
  'flash_drives',
  'cpu_coolers',
  'laptop_coolers',
  'case_fans',
  'keyboards',
  'mice',
  'gamepads',
  'gaming_consoles',
  'webcams',
  'microphones',
  'printers',
  '3d_printers',
  'monitors',
  'tvs',
  'projectors',
  'speakers',
  'audio_systems',
  'av_receivers',
  'media_players',
  'camera_lenses',
  'ip_cameras',
  'dashcams',
  'gimbals',
  'drones',
  'routers',
  'modem_routers',
  'robot_vacuums',
  'hardware_wallets',
]);

function isSupportedProductCategory(category) {
  return SUPPORTED_CATEGORY_IDS.has(String(category || '').trim());
}

// stdout is buffered when piped through the scraper-proxy spawn → user sees
// silence for tens of seconds. Wrapping console.log in a write+drain pattern
// flushes each line, so the UI's 2-second poll picks up real-time progress.
const _stdoutWrite = process.stdout.write.bind(process.stdout);
function log(line = '') {
  _stdoutWrite(line + '\n');
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Kept for backwards compatibility with --auto.
async function applyAutoLimit() {
  if (AUTO) log('  --auto: no external quota source is active; running with the requested limit.');
}

async function fetchProducts() {
  const out = [];
  if (ONLY_CAT && !isSupportedProductCategory(ONLY_CAT)) return out;
  const parts = [];
  if (!ALL_VARIANTS) parts.push('variantPrimary=true');
  if (ONLY_CAT) parts.push(`category="${ONLY_CAT.replace(/"/g, '\\"')}"`);
  if (MISSING_ONLY) parts.push('offerCount<1');
  if (FILTER_EXTRA) parts.push(`(${FILTER_EXTRA})`);
  const filter = parts.length ? `&filter=${encodeURIComponent(parts.join(' && '))}` : '';
  let page = 1;
  for (;;) {
    const r = await req('GET',
      `/api/collections/products/records?perPage=500&page=${page}&sort=${encodeURIComponent(SORT)}` +
      `&fields=id,name,brand,gtin,mpn,category,sourceUrl${filter}`);
    if (r.status !== 200) throw new Error(`fetch page ${page}: ${r.status}`);
    for (const item of (r.body.items || [])) {
      if (isSupportedProductCategory(item.category)) out.push(item);
    }
    if (LIMIT > 0 && out.length >= LIMIT) return out.slice(0, LIMIT);
    if (page >= (r.body.totalPages || 1)) break;
    page++;
  }
  return out;
}

async function main() {
  log('\n  Offer sync\n');
  const selected = CONNECTOR_FILTER
    ? CONNECTORS.filter(c => c.id === CONNECTOR_FILTER)
    : CONNECTORS;
  if (CONNECTOR_FILTER && !selected.length) {
    log(`  Unknown connector: ${CONNECTOR_FILTER}`);
    log(`  Available connectors: ${CONNECTORS.map(c => c.id).join(', ')}`);
    log('');
    process.exitCode = 1;
    return;
  }
  const active = selected.filter(c => c.isConfigured());
  if (!active.length) {
    log(CONNECTOR_FILTER
      ? `  ${CONNECTOR_FILTER} connector is not configured.`
      : '  No affiliate connector is configured.');
    log('  Add credentials to migration/.env — see scripts/connectors/*.js headers:');
    selected.forEach(c => log(`    • ${c.id}`));
    log('');
    return;
  }
  log(`  Active connectors: ${active.map(c => c.id).join(', ')}`);

  if (AUTO) await applyAutoLimit();
  if (LIMIT < 0) { log('\n  Skipped — limit is exhausted.\n'); return; }

  const products = await fetchProducts();
  const t0 = Date.now();
  log(`  ${products.length} products to enrich · concurrency=${CONCURRENCY}\n`);

  let offersWritten = 0;
  let noMatch = 0;
  let errors = 0;
  let processed = 0;
  const offersByCountry = {}; // e.g. { TR: 812, DE: 340, GB: 190 }

  const processOne = async (p, idx) => {
    const tag = `[${String(idx + 1).padStart(4)}/${products.length}]`;
    const label = `${p.brand ? p.brand + ' ' : ''}${p.name || p.id}`.slice(0, 60);
    let productOffers = 0;
    const countries = [];
    for (const conn of active) {
      try {
        const offers = await conn.searchOffers(p);
        const cleanup = await deleteOffersForProductNetwork(p.id, conn.id, { refresh: false });
        for (const offer of offers) {
          offer.productId = offer.productId || p.id;
          const res = await upsertOffer(offer);
          if (res.ok) {
            offersWritten++;
            productOffers++;
            if (offer.country) {
              countries.push(offer.country);
              const cc = String(offer.country).toUpperCase();
              offersByCountry[cc] = (offersByCountry[cc] || 0) + 1;
            }
          } else {
            noMatch++;
          }
        }
        if (!offers.length || cleanup.deleted) await refreshProductRollup(p.id);
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

  // Publish a run summary to public_config so the admin panel's scraper tab
  // can show price-sync health without server access.
  try {
    const status = {
      lastRunAt: new Date().toISOString(),
      connectors: active.map(c => c.id),
      scanned: products.length,
      offersWritten,
      offersByCountry,
      noMatch,
      errors,
      durationSec: Number(totalSec),
      args: argv.join(' '),
    };
    const found = await req('GET',
      `/api/collections/public_config/records?perPage=1&fields=id&filter=${encodeURIComponent('key="price_sync_status"')}`);
    const rec = { key: 'price_sync_status', value: status };
    if (found.status === 200 && found.body.items && found.body.items[0]) {
      await req('PATCH', `/api/collections/public_config/records/${found.body.items[0].id}`, rec);
    } else {
      await req('POST', '/api/collections/public_config/records', rec);
    }
  } catch (e) {
    log(`  ! status publish failed: ${e.message}`);
  }

  // Push the freshly-computed lowestPriceUSD into Typesense so the admin
  // Products page (and any Typesense-backed listing on the website) sees
  // the "Fiyatlı" filter return the right rows immediately. Without this
  // step the index lagged PB by hours/days and the dropdown looked broken.
  // Batched runners set NO_REINDEX=1 so the expensive full backfill (scans all
  // ~106k products, ~330s) runs once at the end instead of after every batch.
  if (offersWritten > 0 && !process.env.NO_REINDEX) {
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
