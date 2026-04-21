/* eslint-disable */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const Engine = require('../admin/js/scoring/score_engine.js');

const PB = process.env.POCKETBASE_URL;
const EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const PW = process.env.POCKETBASE_ADMIN_PASSWORD;

async function pbAuth() {
  const r = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: EMAIL, password: PW }),
  });
  if (!r.ok) throw new Error('PB auth failed: ' + r.status);
  return (await r.json()).token;
}

async function fetchAll(token, category) {
  const all = []; let page = 1;
  while (true) {
    const url = `${PB}/api/collections/products/records?page=${page}&perPage=200&filter=${encodeURIComponent(`category="${category}"`)}`;
    const r = await fetch(url, { headers: { Authorization: token } });
    if (!r.ok) throw new Error('PB fetch failed: ' + r.status);
    const j = await r.json();
    all.push(...j.items);
    if (j.items.length < 200 || page >= j.totalPages) break;
    page++;
  }
  return all;
}

function fmtBreakdown(b) {
  return Object.keys(b.breakdown).map(k => {
    const x = b.breakdown[k];
    return `  ${k.padEnd(18)} w=${String(x.weight).padStart(3)}% norm=${String(Math.round(x.norm)).padStart(3)} src=${(x.source || '-').toString().substring(0, 40)} type=${x.type} raw="${(x.raw || '').toString().substring(0, 50)}"`;
  }).join('\n');
}

function fmtRow(p, scored) {
  return `\n→ ${p.name} (id=${p.id})\n  score=${scored.score} (base=${scored.baseScore}, decay=${scored.decay}, year=${scored.year || '?'})\n  missing=[${scored.missing.join(', ') || 'none'}]\n${fmtBreakdown(scored)}`;
}

function dumpRawSpecs(p) {
  const flat = Object.keys(p.specs || {});
  const sections = {};
  for (const [k, v] of Object.entries(p.specSections || {})) {
    if (v && typeof v === 'object') sections[k] = Object.keys(v);
  }
  return `  flat keys: [${flat.join(' | ')}]\n  sections: ${JSON.stringify(sections, null, 2).split('\n').join('\n  ')}`;
}

(async () => {
  const token = await pbAuth();

  for (const cat of ['smartphones', 'laptops']) {
    console.log(`\n${'='.repeat(70)}\n${cat.toUpperCase()}`);
    const products = await fetchAll(token, cat);
    const scored = Engine.scoreCategory(products);
    const byId = new Map(scored.map(s => [s.id, s]));
    scored.sort((a, b) => b.score - a.score);

    // 1. Top 5 + bottom 5
    console.log(`\n--- TOP 5 ---`);
    scored.slice(0, 5).forEach(s => {
      const p = products.find(x => x.id === s.id);
      console.log(fmtRow(p, s));
    });
    console.log(`\n--- BOTTOM 5 ---`);
    scored.slice(-5).reverse().forEach(s => {
      const p = products.find(x => x.id === s.id);
      console.log(fmtRow(p, s));
    });

    // 2. Specific lookups
    const targets = cat === 'smartphones'
      ? ['Xiaomi 17 Ultra']
      : ['GameRaider FLUX GR16'];
    for (const t of targets) {
      const matches = products.filter(p => p.name && p.name.toLowerCase().includes(t.toLowerCase()));
      console.log(`\n--- TARGET: "${t}" (${matches.length} match) ---`);
      matches.slice(0, 2).forEach(p => {
        const s = byId.get(p.id);
        console.log(fmtRow(p, s));
        if (s.missing.length > 5) {
          console.log('  ⚠️ RAW SPECS DUMP:');
          console.log(dumpRawSpecs(p));
        }
      });
    }

    // 3. Top Redmi (smartphones only)
    if (cat === 'smartphones') {
      const redmi = scored
        .map(s => ({ s, p: products.find(x => x.id === s.id) }))
        .filter(x => x.p && /redmi/i.test(x.p.name))
        .slice(0, 1);
      console.log(`\n--- TOP REDMI ---`);
      redmi.forEach(({ s, p }) => console.log(fmtRow(p, s)));
    }

    // 4. Heavy-missing products dump (sample 3)
    const broken = scored.filter(s => s.missing.length > 5).slice(0, 3);
    if (broken.length) {
      console.log(`\n--- HEAVY-MISSING SAMPLES (${scored.filter(s => s.missing.length > 5).length} total) ---`);
      broken.forEach(s => {
        const p = products.find(x => x.id === s.id);
        console.log(`\n→ ${p.name} (missing: ${s.missing.length})`);
        console.log(dumpRawSpecs(p));
      });
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
