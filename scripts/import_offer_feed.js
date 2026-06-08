/**
 * Qor AI — generic merchant/feed offer importer
 *
 * Imports CSV/TSV/JSON/XML product feeds from Awin, Admitad, Kelkoo, direct
 * merchant feeds or manually exported partner files. It deliberately matches
 * only by productId, GTIN/EAN or MPN+brand; fuzzy title-only matching is
 * skipped so accessories and wrong variants do not pollute prices.
 *
 * Examples:
 *   node scripts/import_offer_feed.js --config=scripts/offer_feeds.example.json --dry-run
 *   node scripts/import_offer_feed.js --file=feeds/mediamarkt.csv --network=awin --store=MediaMarkt --country=DE --currency=EUR
 *   node scripts/import_offer_feed.js --url=https://.../feed.csv --network=admitad --store=Teknosa --country=TR --currency=TRY --limit=500
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { Readable } = require('stream');
const csv = require('csv-parser');
const { XMLParser } = require('fast-xml-parser');
const { upsertOffer } = require('./lib/offers');
const { buildAffiliateUrl } = require('./lib/affiliate');

const DEFAULT_FIELDS = {
  productId: ['productId', 'product_id', 'qorProductId', 'qor_product_id'],
  gtin: ['gtin', 'ean', 'EAN', 'barcode', 'upc', 'UPC', 'isbn'],
  mpn: ['mpn', 'manufacturer_part_number', 'model', 'model_number', 'sku'],
  brand: ['brand', 'manufacturer', 'vendor', 'make'],
  title: ['title', 'name', 'product_name', 'productName', 'ProductName'],
  merchantProductId: ['merchantProductId', 'merchant_product_id', 'item_id', 'product_id', 'sku'],
  price: ['price', 'current_price', 'sale_price', 'search_price', 'price_amount'],
  shipping: ['shipping', 'shipping_price', 'delivery_cost', 'shippingCost'],
  currency: ['currency', 'currency_code', 'price_currency'],
  url: ['url', 'product_url', 'merchant_url', 'link', 'aw_deep_link', 'deeplink'],
  affiliateUrl: ['affiliateUrl', 'affiliate_url', 'tracking_url', 'aw_deep_link', 'deeplink', 'click_url'],
  availability: ['availability', 'stock', 'in_stock', 'stock_status'],
  condition: ['condition', 'item_condition'],
};

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    if (eq === -1) out[body] = true;
    else out[body.slice(0, eq)] = body.slice(eq + 1);
  }
  return out;
}

function usage() {
  console.log(`
  Usage:
    node scripts/import_offer_feed.js --config=feeds.json [--dry-run]
    node scripts/import_offer_feed.js --file=feed.csv --network=awin --store=MediaMarkt --country=DE --currency=EUR

  Field overrides:
    --gtin-field=ean --price-field=sale_price --url-field=product_url --affiliate-url-field=deeplink
`);
}

function getPath(obj, key) {
  if (!obj || !key) return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  const lower = key.toLowerCase();
  const direct = Object.keys(obj).find(k => k.toLowerCase() === lower);
  if (direct) return obj[direct];
  if (key.includes('.')) {
    let cur = obj;
    for (const part of key.split('.')) {
      if (!cur || typeof cur !== 'object') return undefined;
      cur = cur[part];
    }
    return cur;
  }
  return undefined;
}

function firstValue(row, aliases) {
  for (const key of aliases || []) {
    const value = getPath(row, key);
    if (value != null && String(value).trim() !== '') return value;
  }
  return '';
}

function fieldAliases(feed, name) {
  const explicit = feed.fields && feed.fields[name];
  const dashName = `${name.replace(/[A-Z]/g, m => '-' + m.toLowerCase())}-field`;
  if (feed[dashName]) return [feed[dashName]];
  if (feed[`${name}Field`]) return [feed[`${name}Field`]];
  if (explicit) return Array.isArray(explicit) ? explicit : [explicit];
  return DEFAULT_FIELDS[name] || [name];
}

function parsePrice(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let s = String(value || '').trim();
  if (!s) return 0;
  s = s.replace(/\s/g, '').replace(/[^\d,.-]/g, '');
  if (!s) return 0;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    s = s.replace(/,/g, '');
  } else {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
}

function cleanGtin(value) {
  const s = String(value || '').replace(/[^\d]/g, '');
  return s.length >= 8 ? s : '';
}

function normalizeCondition(value) {
  const s = String(value || '').toLowerCase();
  if (!s) return 'new';
  if (/used|2\.?\s*el|ikinci|gebraucht|preowned/.test(s)) return 'used';
  if (/refurb|renew|yenilen|generalüberholt/.test(s)) return 'refurbished';
  return 'new';
}

function normalizeAvailability(value) {
  const s = String(value || '').toLowerCase();
  if (!s) return 'in_stock';
  if (/out|sold|stokta yok|tükendi|nicht verfügbar|unavailable/.test(s)) return 'out_of_stock';
  return 'in_stock';
}

async function readSource(feed) {
  const src = feed.url || feed.file;
  if (!src) throw new Error('feed needs url or file');
  let buf;
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src, { headers: feed.headers || {} });
    if (!res.ok) throw new Error(`download ${res.status}: ${src}`);
    buf = Buffer.from(await res.arrayBuffer());
  } else {
    buf = fs.readFileSync(path.resolve(src));
  }
  if (/\.gz$/i.test(src) || (buf[0] === 0x1f && buf[1] === 0x8b)) buf = zlib.gunzipSync(buf);
  return buf.toString(feed.encoding || 'utf8');
}

function findFirstArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['products', 'product', 'items', 'item', 'offers', 'records', 'record']) {
    const found = findFirstArray(value[key]);
    if (found.length) return found;
  }
  for (const child of Object.values(value)) {
    const found = findFirstArray(child);
    if (found.length) return found;
  }
  return [];
}

function parseCsv(text, separator) {
  return new Promise((resolve, reject) => {
    const rows = [];
    Readable.from([text])
      .pipe(csv({ separator }))
      .on('data', row => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

async function parseRows(text, feed) {
  const src = feed.url || feed.file || '';
  const format = String(feed.format || '').toLowerCase()
    || (/\.json(\.gz)?$/i.test(src) ? 'json' : /\.xml(\.gz)?$/i.test(src) ? 'xml' : /\.tsv(\.gz)?$/i.test(src) ? 'tsv' : 'csv');
  if (format === 'json') {
    const root = JSON.parse(text);
    return Array.isArray(root) ? root : findFirstArray(root);
  }
  if (format === 'xml') {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
    return findFirstArray(parser.parse(text));
  }
  return parseCsv(text, feed.delimiter || (format === 'tsv' ? '\t' : ','));
}

function buildOffer(row, feed) {
  const productId = String(firstValue(row, fieldAliases(feed, 'productId')) || '').trim();
  const gtin = cleanGtin(firstValue(row, fieldAliases(feed, 'gtin')));
  const mpn = String(firstValue(row, fieldAliases(feed, 'mpn')) || '').trim();
  const brand = String(firstValue(row, fieldAliases(feed, 'brand')) || '').trim();
  if (!productId && !gtin && !(mpn && brand)) return { skipped: 'no-safe-match-key' };

  const condition = normalizeCondition(firstValue(row, fieldAliases(feed, 'condition')));
  if (condition === 'used' || (condition === 'refurbished' && !feed.allowRefurbished)) {
    return { skipped: `condition-${condition}` };
  }

  const price = parsePrice(firstValue(row, fieldAliases(feed, 'price')));
  const shipping = parsePrice(firstValue(row, fieldAliases(feed, 'shipping')));
  const currency = String(firstValue(row, fieldAliases(feed, 'currency')) || feed.currency || '').toUpperCase();
  const url = String(firstValue(row, fieldAliases(feed, 'url')) || '').trim();
  const affiliateRaw = String(firstValue(row, fieldAliases(feed, 'affiliateUrl')) || '').trim();
  const network = String(feed.network || 'direct').toLowerCase();
  const country = String(feed.country || '').toUpperCase();
  // A single AWIN download can bundle several advertisers (e.g. Coolblue +
  // inateck in one feed). When `storeField` is set we read the merchant name
  // from the row so each offer is attributed to the right store; otherwise we
  // fall back to the fixed feed.store.
  const rowStore = feed.storeField
    ? String(firstValue(row, Array.isArray(feed.storeField) ? feed.storeField : [feed.storeField]) || '').trim()
    : '';
  const store = rowStore || feed.store || feed.merchant || '';
  const title = String(firstValue(row, fieldAliases(feed, 'title')) || '').trim();
  const merchantProductId = String(firstValue(row, fieldAliases(feed, 'merchantProductId')) || '').trim();
  const availability = normalizeAvailability(firstValue(row, fieldAliases(feed, 'availability')));
  const finalUrl = affiliateRaw || buildAffiliateUrl(network, url, {
    country,
    mid: feed.awinMid || feed.mid,
    clickref: `qorai-${(productId || gtin || mpn).slice(0, 18)}`,
  });

  return {
    productId,
    gtin,
    mpn,
    brand,
    merchantProductId,
    title,
    store,
    network,
    country,
    price,
    shipping,
    totalPrice: price > 0 ? Math.round((price + shipping) * 100) / 100 : 0,
    currency,
    priceUnknown: !(price > 0),
    url,
    affiliateUrl: finalUrl || url,
    condition,
    availability,
    inStock: availability !== 'out_of_stock',
    source: feed.source || `${network}-feed`,
    matchConfidence: productId || gtin ? 1 : 0.85,
  };
}

async function importFeed(feed, globalOpts = {}) {
  const label = `${feed.store || feed.merchant || feed.network || 'feed'} ${feed.country || ''}`.trim();
  const text = await readSource(feed);
  const rows = await parseRows(text, feed);
  const limit = Number(feed.limit || globalOpts.limit || 0);
  let scanned = 0, written = 0, skipped = 0, errors = 0;
  const matchedIds = new Set();
  for (const row of rows) {
    if (limit && scanned >= limit) break;
    scanned++;
    const offer = buildOffer(row, feed);
    if (offer.skipped) { skipped++; continue; }
    if (globalOpts.dryRun || feed.dryRun) {
      written++;
      continue;
    }
    try {
      const res = await upsertOffer(offer);
      if (res.ok) { written++; if (res.productId) matchedIds.add(res.productId); }
      else skipped++;
    } catch (err) {
      errors++;
      if (errors <= 8) console.error(`  ! ${label} row ${scanned}: ${err.message}`);
    }
  }
  console.log(`  ${label}: ${written} written · ${skipped} skipped · ${errors} errors · ${scanned}/${rows.length} rows`);
  return { scanned, written, skipped, errors, matchedIds: [...matchedIds] };
}

async function loadConfig(opts) {
  if (opts.config) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(opts.config), 'utf8'));
    return Array.isArray(raw) ? raw : (raw.feeds || []);
  }
  if (!opts.file && !opts.url) return [];
  return [{
    file: opts.file,
    url: opts.url,
    format: opts.format,
    delimiter: opts.delimiter,
    network: opts.network,
    store: opts.store,
    storeField: opts['store-field'] || opts.storeField,
    merchant: opts.merchant,
    country: opts.country,
    currency: opts.currency,
    awinMid: opts.awinMid || opts.mid,
    allowRefurbished: opts.allowRefurbished,
    fields: {
      gtin: opts['gtin-field'],
      mpn: opts['mpn-field'],
      brand: opts['brand-field'],
      title: opts['title-field'],
      price: opts['price-field'],
      shipping: opts['shipping-field'],
      currency: opts['currency-field'],
      url: opts['url-field'],
      affiliateUrl: opts['affiliate-url-field'],
      availability: opts['availability-field'],
      condition: opts['condition-field'],
    },
  }];
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const feeds = await loadConfig(opts);
  if (!feeds.length) {
    usage();
    process.exitCode = 1;
    return;
  }
  console.log(`\n  Offer feed import${opts['dry-run'] || opts.dryRun ? ' (dry run)' : ''}\n`);
  let totalWritten = 0, totalErrors = 0;
  const allMatchedIds = new Set();
  for (const feed of feeds) {
    const res = await importFeed(feed, {
      dryRun: opts['dry-run'] || opts.dryRun,
      limit: opts.limit,
    });
    totalWritten += res.written;
    totalErrors += res.errors;
    for (const id of (res.matchedIds || [])) allMatchedIds.add(id);
  }
  // Re-upsert ONLY the matched products into Typesense so each card's stored
  // `_raw` carries the fresh per-country prices + affiliate links (the price
  // chip on list/home cards reads prices[country] from there). This is far
  // lighter than the full lowestPriceUSD backfill and keeps cards in sync.
  if (allMatchedIds.size > 0 && !(opts['dry-run'] || opts.dryRun) && !opts['skip-reindex']) {
    const { spawnSync } = require('child_process');
    const ids = [...allMatchedIds];
    console.log(`\n  Refreshing ${ids.length} matched products in Typesense (_raw + price)…`);
    const r = spawnSync('node', ['scripts/ts_fast_upsert_products.js'], {
      cwd: path.join(__dirname, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      env: { ...process.env, TS_FAST_IDS: ids.join(',') },
    });
    const tail = (r.stdout || '').trim().split(/\r?\n/).slice(-2).join(' · ');
    if (r.status === 0) console.log(`  ✓ TS upsert: ${tail}`);
    else console.log(`  ! TS upsert exit=${r.status}: ${(r.stderr || '').slice(0, 200)}`);
  }
  console.log(`\n  Done — ${totalWritten} offers ${opts['dry-run'] || opts.dryRun ? 'would be written' : 'written'} · ${totalErrors} errors\n`);
}

main().catch(err => { console.error('  ✗', err.message); process.exit(1); });
