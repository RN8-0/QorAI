/**
 * Diagnose tech-score distribution per category.
 *
 *   node scripts/diag_score.js [--cat=smartwatches] [--limit=20]
 *
 * Outputs the top N products for each category along with a breakdown of
 * which weighted specs drove the score. Used to track down "everything is
 * 100" / "5090 isn't first" style scoring bugs.
 */
'use strict';
const path = require('path');
const { req } = require('../migration/pb');
const ScoreEngine = require(path.join(__dirname, '..', 'admin', 'js', 'scoring', 'score_engine.js'));

const argv = process.argv.slice(2);
const ONLY_CAT = (argv.find(a => a.startsWith('--cat=')) || '').split('=')[1] || '';
const LIMIT = parseInt((argv.find(a => a.startsWith('--limit=')) || '').split('=')[1] || '20', 10);
const FIELDS = 'id,category,name,brand,keySpecs,specs,specsEn,specSections,multiLangSpecs,specsCount,techScore,scrapedAt,created';

async function fetchCat(cat) {
  const out = [];
  let lastId = '';
  for (;;) {
    const filters = [`category="${cat}"`];
    if (lastId) filters.push(`id>"${lastId.replace(/"/g, '\\"')}"`);
    const filter = `&filter=${encodeURIComponent(filters.join(' && '))}`;
    const r = await req('GET', `/api/collections/products/records?perPage=500&page=1&sort=id&skipTotal=1&fields=${FIELDS}${filter}`);
    if (r.status !== 200) throw new Error(`fetch: ${JSON.stringify(r.body).slice(0,200)}`);
    const items = r.body.items || [];
    out.push(...items);
    if (items.length) lastId = items[items.length-1].id;
    if (items.length < 500) break;
  }
  return out;
}

async function fetchCats() {
  const r = await req('GET', `/api/collections/products/records?perPage=1&page=1&fields=category&skipTotal=1`);
  // Get distinct cats via aggregator
  const cats = new Set();
  let lastId = '';
  for (;;) {
    const filters = lastId ? [`id>"${lastId}"`] : [];
    const filter = filters.length ? `&filter=${encodeURIComponent(filters.join(' && '))}` : '';
    const r = await req('GET', `/api/collections/products/records?perPage=500&page=1&sort=id&skipTotal=1&fields=id,category${filter}`);
    const items = r.body.items || [];
    items.forEach(it => cats.add(it.category));
    if (items.length) lastId = items[items.length-1].id;
    if (items.length < 500) break;
  }
  return [...cats].filter(Boolean).sort();
}

async function main() {
  const cats = ONLY_CAT ? [ONLY_CAT] : await fetchCats();
  console.log(`\n  ${cats.length} categor(ies): ${cats.join(', ')}\n`);
  for (const cat of cats) {
    const products = await fetchCat(cat);
    if (!products.length) { console.log(`\n[${cat}] empty\n`); continue; }
    const rows = ScoreEngine.scoreCategory(products);
    rows.sort((a,b) => b.score - a.score);
    const dist = {100:0,'95-99':0,'90-94':0,'80-89':0,'60-79':0,'<60':0};
    rows.forEach(r => {
      if (r.score >= 100) dist[100]++;
      else if (r.score >= 95) dist['95-99']++;
      else if (r.score >= 90) dist['90-94']++;
      else if (r.score >= 80) dist['80-89']++;
      else if (r.score >= 60) dist['60-79']++;
      else dist['<60']++;
    });
    console.log(`\n══ ${cat.toUpperCase()} ══ (${products.length} products, dist: 100=${dist[100]} 95-99=${dist['95-99']} 90-94=${dist['90-94']} 80-89=${dist['80-89']} 60-79=${dist['60-79']} <60=${dist['<60']})`);
    const top = rows.slice(0, LIMIT);
    for (const r of top) {
      const tag = `${String(r.score).padStart(3)} | conf ${(r.confidence*100|0)}% | y${r.year||'?'} | tier ${r.tier||'-'} | anchor ${r.anchorKey||'-'}=${r.anchorScore?Math.round(r.anchorScore):'-'} | brandMod ${r.brandMod} (${r.brandReason||'-'}) | stretch ${r.categoryFinalStretch||'-'}`;
      const truncName = (r.name || '').slice(0, 60).padEnd(60);
      console.log(`  ${truncName} ${tag}`);
    }
  }
}

main().catch(e => { console.error('  ✗', e.message); process.exit(1); });
