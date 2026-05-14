/**
 * Qor AI — Icecat Category Namer
 *
 * Reads scripts/icecat_cats.json (produced by icecat_discover_cats.js),
 * samples one Product_ID per top-N category from the index, fetches each
 * via live.icecat.biz, and writes scripts/icecat_cats_named.json with the
 * resolved English category name + sample product name.
 *
 * USAGE
 *   node scripts/icecat_name_cats.js --top=120
 */
'use strict';

const path  = require('path');
const fs    = require('fs');
const https = require('https');
const zlib  = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const CATS = path.join(__dirname, 'icecat_cats.json');
const OUT  = path.join(__dirname, 'icecat_cats_named.json');

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
const TOP = parseInt(getOpt('top', '120'));

const cats   = JSON.parse(fs.readFileSync(CATS, 'utf8')).categories.slice(0, TOP);
const wanted = new Map(cats.map(c => [String(c.catId), { catId: c.catId, count: c.count, productId: null }]));

const USER = ENV.ICECAT_USERNAME, PASS = ENV.ICECAT_PASSWORD;
const auth = Buffer.from(`${USER}:${PASS}`).toString('base64');
const url  = 'https://data.icecat.biz/export/freexml.int/EN/files.index.xml';

console.log(`[name] streaming index to find sample product per cat (top ${TOP})…`);

https.get(url, {
  headers: {
    Authorization:    `Basic ${auth}`,
    'Accept-Encoding': 'gzip, deflate',
    'User-Agent':      'QorAI-Ingestor/1.0',
  },
}, res => {
  let stream = res;
  if ((res.headers['content-encoding'] || '').includes('gzip')) {
    stream = res.pipe(zlib.createGunzip());
  }
  let buf = '';
  let needed = wanted.size;
  stream.on('data', chunk => {
    if (!needed) return;
    buf += chunk.toString('utf8');
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const ln of lines) {
      if (!ln.includes('<file ')) continue;
      const mc = ln.match(/Catid="(\d+)"/);
      const mp = ln.match(/Product_ID="(\d+)"/);
      if (!mc || !mp) continue;
      const slot = wanted.get(mc[1]);
      if (slot && !slot.productId) {
        slot.productId = mp[1];
        needed--;
        if (!needed) { stream.destroy(); resolveAll(); return; }
      }
    }
  });
  stream.on('end', resolveAll);
  stream.on('error', e => { console.error(e); process.exit(1); });
}).on('error', e => { console.error(e); process.exit(1); });

async function resolveAll() {
  console.log(`[name] found sample IDs for ${[...wanted.values()].filter(v => v.productId).length}/${wanted.size} cats. Resolving names…`);
  const out = [];
  let i = 0;
  for (const slot of wanted.values()) {
    i++;
    if (!slot.productId) {
      out.push({ catId: slot.catId, count: slot.count, name: null, sample: null });
      continue;
    }
    try {
      const j = await fetchOne(slot.productId);
      const gi = j?.data?.GeneralInfo || {};
      const name = gi.Category?.Name?.Value || null;
      const sample = `${gi.BrandInfo?.BrandName || gi.Brand || ''} ${gi.BrandPartCode || gi.ProductName || ''}`.trim();
      out.push({ catId: slot.catId, count: slot.count, name, sample });
      if (i % 10 === 0) console.log(`  resolved ${i}/${wanted.size}`);
    } catch (e) {
      out.push({ catId: slot.catId, count: slot.count, name: null, sample: null, error: e.message });
    }
    await new Promise(r => setTimeout(r, 250));
  }
  fs.writeFileSync(OUT, JSON.stringify({ scannedAt: new Date().toISOString(), categories: out }, null, 2));
  console.log(`\n[name] wrote ${OUT}`);
  console.log('\ncatId   count       name                                              sample');
  for (const c of out) {
    console.log(
      String(c.catId).padEnd(7) + ' ' +
      String(c.count.toLocaleString()).padEnd(10) + ' ' +
      String(c.name || '???').padEnd(50) + ' ' +
      String(c.sample || '').slice(0, 60)
    );
  }
}

function fetchOne(id) {
  const u = `https://live.icecat.biz/api/?UserName=${encodeURIComponent(USER)}&Language=EN&icecat_id=${id}`;
  return new Promise((resolve, reject) => {
    https.get(u, res => {
      let s = '';
      res.on('data', c => s += c);
      res.on('end', () => {
        try { resolve(JSON.parse(s)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}
