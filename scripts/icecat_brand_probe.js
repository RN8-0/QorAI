/**
 * Qor AI — Open Icecat brand-coverage probe
 *
 * Answers: "which big brands are missing from Open Icecat?" so we know which
 * brands must be sourced from Epey instead.
 *
 * Method: reservoir-sample real products from scripts/icecat_queue.jsonl (the
 * parsed Open Catalog index), look each up on the Icecat live API, read the
 * BrandName, and tally brand frequency per category. A brand absent from a
 * large random sample is effectively absent from Open Icecat.
 *
 *   node scripts/icecat_brand_probe.js [perCat]   # default 130 per category
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');

const QUEUE = path.join(__dirname, 'icecat_queue.jsonl');
const PER_CAT = parseInt(process.argv[2] || '130', 10);
const CONCURRENCY = 4;

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', 'migration', '.env'), 'utf8')
    .split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const USER = env.ICECAT_USERNAME;

// Categories to probe (Icecat CategoryID → label)
const CATS = {
  151:  'Laptops',
  153:  'Desktops',
  1893: 'Smartphones',
  897:  'Tablets',
  222:  'Monitors',
  1584: 'TVs',
};

// Big consumer brands we explicitly want a yes/no answer for.
const WATCH = [
  'Apple', 'Samsung', 'Xiaomi', 'Huawei', 'Honor', 'Google', 'OnePlus', 'Oppo',
  'Vivo', 'Realme', 'Nothing', 'Sony', 'LG', 'HP', 'Dell', 'Lenovo', 'ASUS',
  'Acer', 'MSI', 'Microsoft', 'Razer', 'TCL', 'Nokia', 'Motorola', 'Casper',
  'Monster', 'Panasonic', 'Philips', 'Toshiba',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function fetchBrand(icecatId, retries = 2) {
  return new Promise(resolve => {
    const url = `https://live.icecat.biz/api/?UserName=${encodeURIComponent(USER)}&Language=EN&icecat_id=${icecatId}`;
    https.get(url, { headers: { Accept: 'application/json', 'User-Agent': 'QorAI-probe/1.0' } }, res => {
      if (res.statusCode === 429 && retries > 0) {
        res.resume();
        return sleep(3000).then(() => resolve(fetchBrand(icecatId, retries - 1)));
      }
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(raw);
          const gi = (j.data || {}).GeneralInfo || {};
          const brand = (gi.BrandInfo || {}).BrandName || gi.Brand || (j.data || {}).Supplier || '';
          resolve(String(brand).trim());
        } catch { resolve(''); }
      });
    }).on('error', () => resolve(''));
  });
}

async function reservoirSample() {
  const buckets = {};
  for (const id of Object.keys(CATS)) buckets[id] = [];
  const seen = {};
  for (const id of Object.keys(CATS)) seen[id] = 0;

  const rl = readline.createInterface({ input: fs.createReadStream(QUEUE), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const cat = String(rec.catId);
    if (!buckets[cat]) continue;
    seen[cat]++;
    const b = buckets[cat];
    if (b.length < PER_CAT) b.push(rec.id);
    else {
      const j = Math.floor(Math.random() * seen[cat]);
      if (j < PER_CAT) b[j] = rec.id;
    }
  }
  return { buckets, seen };
}

async function main() {
  if (!fs.existsSync(QUEUE)) {
    console.error('icecat_queue.jsonl not found — run an Icecat Phase 1 first.');
    process.exit(1);
  }
  console.log(`\nOpen Icecat brand probe — sampling ${PER_CAT} products / category\n`);
  const { buckets, seen } = await reservoirSample();
  for (const [cat, label] of Object.entries(CATS)) {
    console.log(`  ${label.padEnd(12)} index size ~${(seen[cat] || 0).toLocaleString()}, sampling ${buckets[cat].length}`);
  }
  console.log('\nLooking up brands on the Icecat live API…\n');

  const perCatBrands = {};   // catLabel -> { brand: count }
  const overall = {};        // brand(lower) -> { name, count }
  let done = 0, fail = 0;
  const total = Object.values(buckets).reduce((a, b) => a + b.length, 0);

  for (const [cat, label] of Object.entries(CATS)) {
    perCatBrands[label] = {};
    const ids = buckets[cat];
    for (let i = 0; i < ids.length; i += CONCURRENCY) {
      const chunk = ids.slice(i, i + CONCURRENCY);
      const brands = await Promise.all(chunk.map(id => fetchBrand(id)));
      for (const brand of brands) {
        done++;
        if (!brand) { fail++; continue; }
        perCatBrands[label][brand] = (perCatBrands[label][brand] || 0) + 1;
        const key = brand.toLowerCase();
        if (!overall[key]) overall[key] = { name: brand, count: 0 };
        overall[key].count++;
      }
      if (done % 80 === 0) process.stdout.write(`\r  ${done}/${total} looked up…`);
      await sleep(120);
    }
  }
  process.stdout.write(`\r  ${done}/${total} looked up (${fail} failed/empty)\n`);

  console.log('\n══ Brands found per category (top 12) ══');
  for (const [label, brands] of Object.entries(perCatBrands)) {
    const top = Object.entries(brands).sort((a, b) => b[1] - a[1]).slice(0, 12);
    console.log(`\n  ${label}:`);
    for (const [b, c] of top) console.log(`    ${b.padEnd(22)} ${c}`);
  }

  const foundKeys = new Set(Object.keys(overall));
  const isFound = name => {
    const n = name.toLowerCase();
    return [...foundKeys].some(k => k === n || k.includes(n) || n.includes(k));
  };

  console.log('\n══ Big-brand checklist (Open Icecat) ══');
  const missing = [];
  for (const brand of WATCH) {
    const hit = overall[brand.toLowerCase()];
    const present = hit ? `IN  (${hit.count} in sample)` : (isFound(brand) ? 'IN  (fuzzy)' : 'MISSING');
    if (present === 'MISSING') missing.push(brand);
    console.log(`  ${brand.padEnd(14)} ${present}`);
  }

  console.log('\n══ VERDICT — scrape these from Epey (brand-based) ══');
  console.log('  ' + (missing.length ? missing.join(', ') : '(none missing in this sample)'));
  console.log('\n  Everything else above can come from Icecat; Epey fills the gaps.\n');
}

main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
