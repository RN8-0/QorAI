'use strict';
/**
 * Remove the ENTIRE Geizhals footprint from live data:
 *   1) every product whose source/sourceUrl is Geizhals (the German-spec records)
 *   2) every `offers` row written by the Geizhals→Amazon.de price bridge
 * from BOTH PocketBase and Typesense.
 *
 * Every deleted record is written to a timestamped JSON backup first, so the
 * operation is fully reversible. Dry-run by default; pass --yes to apply.
 *
 *   node scripts/remove_geizhals_all.js            # dry run (counts + backup)
 *   node scripts/remove_geizhals_all.js --yes      # apply deletion
 */
const { req: pb } = require('../migration/pb');
const { req: ts } = require('../migration/ts');
const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--yes');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

const PRODUCT_FILTER = '(source = "geizhals.eu" || source = "geizhals" || sourceUrl ~ "geizhals")';
const OFFER_FILTER = '(source = "geizhals" || network = "geizhals_best")';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// PB on this RAM-constrained host throws transient 400/5xx under load / cold
// start, so every read is retried a few times before giving up.
async function pbRetry(method, url, body, tries = 5) {
  let last;
  for (let i = 0; i < tries; i++) {
    const r = await pb(method, url, body);
    if (r.status === 200 || r.status === 204 || r.status === 404) return r;
    last = r;
    await sleep(800 * (i + 1));
  }
  return last;
}

async function fetchAll(collection, filter) {
  const out = [];
  for (let page = 1; ; page++) {
    const url = `/api/collections/${collection}/records?page=${page}&perPage=200&skipTotal=1`
      + `&filter=${encodeURIComponent(filter)}`;
    const r = await pbRetry('GET', url);
    if (r.status !== 200) {
      throw new Error(`${collection} list ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
    }
    const items = r.body.items || [];
    out.push(...items);
    if (items.length < 200) break;
  }
  return out;
}

function backup(name, records) {
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `geizhals_${name}_${STAMP}.json`);
  fs.writeFileSync(file, JSON.stringify(records, null, 2));
  console.log(`  backup → ${file} (${records.length} records)`);
}

async function deleteFromPb(collection, id) {
  const r = await pbRetry('DELETE', `/api/collections/${collection}/records/${id}`);
  if (r.status !== 204 && r.status !== 404) {
    throw new Error(`PB delete ${collection}/${id} → ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
  }
}

async function deleteFromTs(collection, id) {
  const r = await ts('DELETE', `/collections/${collection}/documents/${encodeURIComponent(id)}`);
  if (![200, 202, 204, 404].includes(r.status)) {
    throw new Error(`TS delete ${collection}/${id} → ${r.status}: ${JSON.stringify(r.body).slice(0, 200)}`);
  }
}

async function purge({ label, collection, filter, tsCollection }) {
  console.log(`\n=== ${label} ===`);
  const records = await fetchAll(collection, filter);
  console.log(`  found ${records.length} record(s) in ${collection}`);
  if (!records.length) return 0;
  backup(collection, records);
  if (!APPLY) {
    console.log(`  [dry] would delete ${records.length} from ${collection}`
      + (tsCollection ? ` + Typesense ${tsCollection}` : ''));
    return records.length;
  }
  let done = 0;
  for (const rec of records) {
    await deleteFromPb(collection, rec.id);
    if (tsCollection) await deleteFromTs(tsCollection, rec.id);
    if (++done % 50 === 0) console.log(`  deleted ${done}/${records.length}…`);
  }
  console.log(`  ✓ deleted ${done} from ${collection}${tsCollection ? ` (+ Typesense)` : ''}`);
  return done;
}

(async () => {
  console.log(APPLY ? '>>> APPLY MODE — records will be deleted <<<' : '>>> DRY RUN (no deletion) — pass --yes to apply <<<');

  const prods = await purge({
    label: 'Geizhals products',
    collection: 'products',
    filter: PRODUCT_FILTER,
    tsCollection: 'products',
  });

  // Offers written by the Geizhals price bridge. Backed up + removed too; these
  // all belong to the products above (the bridge only prices Geizhals-URL items).
  let offers = 0;
  try {
    offers = await purge({
      label: 'Geizhals price-bridge offers',
      collection: 'offers',
      filter: OFFER_FILTER,
      tsCollection: null,
    });
  } catch (e) {
    console.log(`  (offers cleanup skipped: ${e.message.slice(0, 120)})`);
  }

  console.log(`\n${APPLY ? 'DONE' : 'DRY RUN'} — products: ${prods}, offers: ${offers}`);
  if (!APPLY) console.log('Re-run with --yes to apply.');
})().catch(e => { console.error(e); process.exit(1); });
