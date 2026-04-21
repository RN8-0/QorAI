/* eslint-disable */
// Diagnostic: score top/bottom 5 smartphones + top 5 laptops + log any 100-pointers
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const Engine = require('../admin/js/scoring/score_engine.js');

const PB = process.env.POCKETBASE_URL;
const EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const PW = process.env.POCKETBASE_ADMIN_PASSWORD;

async function pbAuth() {
  const r = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: EMAIL, password: PW }),
  });
  if (!r.ok) throw new Error('PB auth failed: ' + r.status);
  return (await r.json()).token;
}

async function fetchAll(token, category) {
  const all = [];
  let page = 1;
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

function fmt(p) {
  const specs = Object.keys(p.breakdown).map(k => {
    const b = p.breakdown[k];
    return `  ${k.padEnd(18)} w=${String(b.weight).padStart(3)}% norm=${String(Math.round(b.norm)).padStart(3)} src=${b.source || '-'} type=${b.type}${b.exact === false ? ' (est)' : ''}`;
  }).join('\n');
  return `→ ${p.name}\n  score=${p.score} (base=${p.baseScore}, decay=${p.decay}, year=${p.year || '?'})\n  missing=[${p.missing.join(', ') || 'none'}]\n${specs}`;
}

(async () => {
  console.log('Authenticating...');
  const token = await pbAuth();

  for (const cat of ['smartphones', 'laptops']) {
    console.log(`\n${'='.repeat(70)}\nFetching ${cat}...`);
    const products = await fetchAll(token, cat);
    console.log(`Got ${products.length} products. Scoring...`);
    const scored = Engine.scoreCategory(products);
    scored.sort((a, b) => b.score - a.score);

    const top = scored.slice(0, 5);
    console.log(`\n--- TOP 5 ${cat} ---`);
    top.forEach(p => console.log(fmt(p)));

    if (cat === 'smartphones') {
      const bottom = scored.slice(-5).reverse();
      console.log(`\n--- BOTTOM 5 ${cat} ---`);
      bottom.forEach(p => console.log(fmt(p)));
    }

    const perfects = scored.filter(p => p.score >= 100);
    if (perfects.length) {
      console.log(`\n--- 100-POINTERS in ${cat} (${perfects.length}) ---`);
      perfects.forEach(p => console.log(fmt(p)));
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
