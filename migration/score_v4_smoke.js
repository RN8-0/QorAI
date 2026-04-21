/* eslint-disable */
// v4 smoke test — local engine against live PB data
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
  return (await r.json()).token;
}
async function fetchAll(token, category) {
  const all = []; let page = 1;
  while (true) {
    const url = `${PB}/api/collections/products/records?page=${page}&perPage=200&filter=${encodeURIComponent(`category="${category}"`)}`;
    const r = await fetch(url, { headers: { Authorization: token } });
    const j = await r.json();
    all.push(...j.items);
    if (j.items.length < 200 || page >= j.totalPages) break;
    page++;
  }
  return all;
}

function fmtRow(p, s) {
  const b = Object.entries(s.breakdown).slice(0, 4)
    .map(([k, v]) => `${k}=${Math.round(v.norm)}(${v.weight}%)`).join(' ');
  return `  ${String(s.score).padStart(3)}  ${s.tier ? '[' + s.tier.padEnd(10) + ']' : '[          ]'} ${p.name.substring(0, 55).padEnd(55)} | ${b}`;
}

(async () => {
  const token = await pbAuth();

  for (const cat of ['smartphones', 'laptops']) {
    console.log('\n' + '='.repeat(100) + `\n${cat.toUpperCase()}`);
    const products = await fetchAll(token, cat);
    const scored = Engine.scoreCategory(products);
    const byId = new Map(scored.map(s => [s.id, s]));
    scored.sort((a, b) => b.score - a.score);

    console.log(`\n--- TOP 10 ---`);
    scored.slice(0, 10).forEach(s => console.log(fmtRow(products.find(x => x.id === s.id), s)));

    console.log(`\n--- BOTTOM 5 ---`);
    scored.slice(-5).reverse().forEach(s => console.log(fmtRow(products.find(x => x.id === s.id), s)));

    // Tier distribution
    const tiers = {};
    for (const s of scored) { const t = s.tier || 'none'; tiers[t] = (tiers[t] || 0) + 1; }
    console.log(`\nTIER DAĞILIMI: ${Object.entries(tiers).map(([k, v]) => `${k}=${v}`).join(' | ')}`);

    // Key products
    const wanted = {
      smartphones: ['Xiaomi 17 Ultra', 'iPhone 16 Pro Max', 'Galaxy S25 Ultra', 'Redmi Note 13', 'Redmi Note 14 Pro'],
      laptops: ['ROG Strix', 'RTX 5090', 'RTX 5060', 'GameRaider'],
    }[cat] || [];
    for (const w of wanted) {
      const match = products.filter(p => p.name && p.name.toLowerCase().includes(w.toLowerCase())).slice(0, 2);
      if (match.length) {
        console.log(`\n=== "${w}" ===`);
        match.forEach(p => {
          const s = byId.get(p.id);
          console.log(fmtRow(p, s) + `  anchor=${s.anchorKey}:${s.anchorScore || '-'}`);
        });
      }
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
