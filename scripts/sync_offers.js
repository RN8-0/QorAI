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

const argv = process.argv.slice(2);
const ONLY_CAT = (argv.find(a => a.startsWith('--cat=')) || '').split('=')[1] || '';
const LIMIT = parseInt((argv.find(a => a.startsWith('--limit=')) || '').split('=')[1] || '0', 10);
const ALL_VARIANTS = argv.includes('--all-variants');
const DELAY = 250; // ms between products — be gentle with retailer APIs

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchProducts() {
  const out = [];
  const parts = [];
  if (!ALL_VARIANTS) parts.push('variantPrimary=true');
  if (ONLY_CAT) parts.push(`category="${ONLY_CAT.replace(/"/g, '\\"')}"`);
  const filter = parts.length ? `&filter=${encodeURIComponent(parts.join(' && '))}` : '';
  let page = 1;
  for (;;) {
    const r = await req('GET',
      `/api/collections/products/records?perPage=500&page=${page}&sort=id` +
      `&fields=id,name,brand,gtin,mpn,category${filter}`);
    if (r.status !== 200) throw new Error(`fetch page ${page}: ${r.status}`);
    out.push(...(r.body.items || []));
    if (LIMIT && out.length >= LIMIT) return out.slice(0, LIMIT);
    if (page >= (r.body.totalPages || 1)) break;
    page++;
  }
  return out;
}

async function main() {
  console.log('\n  Offer sync\n');
  const active = CONNECTORS.filter(c => c.isConfigured());
  if (!active.length) {
    console.log('  No affiliate connector is configured.');
    console.log('  Add credentials to migration/.env — see scripts/connectors/*.js headers:');
    CONNECTORS.forEach(c => console.log(`    • ${c.id}`));
    console.log('');
    return;
  }
  console.log(`  Active connectors: ${active.map(c => c.id).join(', ')}`);

  const products = await fetchProducts();
  console.log(`  ${products.length} products to enrich\n`);

  let offersWritten = 0, noMatch = 0, errors = 0;
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    for (const conn of active) {
      try {
        const offers = await conn.searchOffers(p);
        for (const offer of offers) {
          offer.productId = offer.productId || p.id; // we already know the product
          const res = await upsertOffer(offer);
          if (res.ok) offersWritten++;
          else noMatch++;
        }
      } catch (e) {
        errors++;
        if (errors <= 10) console.log(`  ! ${conn.id} / ${p.id}: ${e.message}`);
      }
    }
    if ((i + 1) % 100 === 0) console.log(`   …${i + 1}/${products.length} — ${offersWritten} offers`);
    await sleep(DELAY);
  }
  console.log(`\n  Done — ${offersWritten} offers written, ${noMatch} unmatched, ${errors} errors.\n`);
}

main().catch(e => { console.error('  ✗', e.message); process.exit(1); });
