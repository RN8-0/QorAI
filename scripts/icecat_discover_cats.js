/**
 * Qor AI — Icecat Category Discovery
 *
 * Streams files.index.xml from data.icecat.biz and counts how many products
 * each CategoryID has in the free Open Catalog. Outputs a sorted list so
 * we can pick the most populated categories to ingest.
 *
 * USAGE
 *   node scripts/icecat_discover_cats.js                  (writes icecat_cats.json)
 *   node scripts/icecat_discover_cats.js --top=80         (print top 80 to stdout)
 */
'use strict';

const path  = require('path');
const fs    = require('fs');
const https = require('https');
const zlib  = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const OUT  = path.join(__dirname, 'icecat_cats.json');

const envRaw = fs.readFileSync(path.join(ROOT, 'migration', '.env'), 'utf8');
const ENV    = Object.fromEntries(
  envRaw.split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const argv = process.argv.slice(2);
const getOpt = (n, d) => {
  const v = argv.find(a => a.startsWith(`--${n}=`));
  return v ? v.slice(n.length + 3) : d;
};
const TOP = parseInt(getOpt('top', '60'));

const USER = ENV.ICECAT_USERNAME, PASS = ENV.ICECAT_PASSWORD;
if (!USER || !PASS) {
  console.error('ICECAT_USERNAME / ICECAT_PASSWORD missing in migration/.env');
  process.exit(1);
}

const auth = Buffer.from(`${USER}:${PASS}`).toString('base64');
const url  = 'https://data.icecat.biz/export/freexml.int/EN/files.index.xml';

console.log(`[discover] streaming ${url} …`);

const counts = new Map(); // catId → count

https.get(url, {
  headers: {
    Authorization:    `Basic ${auth}`,
    'Accept-Encoding': 'gzip, deflate',
    'User-Agent':      'QorAI-Ingestor/1.0',
  },
}, res => {
  if (res.statusCode !== 200) {
    console.error(`HTTP ${res.statusCode}`);
    process.exit(1);
  }
  let stream = res;
  if ((res.headers['content-encoding'] || '').includes('gzip')) {
    stream = res.pipe(zlib.createGunzip());
  }

  let buf = '';
  let total = 0;
  stream.on('data', chunk => {
    buf += chunk.toString('utf8');
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const ln of lines) {
      if (ln.includes('<file ')) {
        const m = ln.match(/Catid="(\d+)"/);
        if (m) {
          const id = m[1];
          counts.set(id, (counts.get(id) || 0) + 1);
          total++;
          if (total % 100000 === 0) {
            process.stdout.write(`\r  scanned ${total.toLocaleString()} products (${counts.size} cats)…`);
          }
        }
      }
    }
  });
  stream.on('end', () => {
    console.log(`\n[discover] done. ${total.toLocaleString()} products, ${counts.size} categories.`);
    const sorted = [...counts.entries()]
      .map(([id, n]) => ({ catId: parseInt(id), count: n }))
      .sort((a, b) => b.count - a.count);

    fs.writeFileSync(OUT, JSON.stringify({ scannedAt: new Date().toISOString(), total, categories: sorted }, null, 2));
    console.log(`[discover] wrote ${OUT}`);

    console.log(`\nTOP ${TOP}:`);
    console.log('catId    count');
    for (const c of sorted.slice(0, TOP)) {
      console.log(String(c.catId).padEnd(8) + ' ' + c.count.toLocaleString());
    }
  });
  stream.on('error', e => { console.error(e); process.exit(1); });
}).on('error', e => { console.error(e); process.exit(1); });
