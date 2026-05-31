/**
 * Short distribution overview for every category.
 *
 *   node scripts/diag_dist.js
 */
'use strict';
const path = require('path');
const { req } = require('../migration/pb');
const ScoreEngine = require(path.join(__dirname, '..', 'admin', 'js', 'scoring', 'score_engine.js'));
const FIELDS = 'id,category,name,brand,keySpecs,specs,specsEn,specSections,multiLangSpecs,specsCount,techScore,scrapedAt,created';

async function fetchAll() {
  const out = [];
  let lastId = '';
  for (;;) {
    const filters = lastId ? [`id>"${lastId.replace(/"/g, '\\"')}"`] : [];
    const filter = filters.length ? `&filter=${encodeURIComponent(filters.join(' && '))}` : '';
    const r = await req('GET', `/api/collections/products/records?perPage=500&page=1&sort=id&skipTotal=1&fields=${FIELDS}${filter}`);
    const items = r.body.items || [];
    out.push(...items);
    if (items.length) lastId = items[items.length-1].id;
    if (items.length < 500) break;
  }
  return out;
}

(async () => {
  const all = await fetchAll();
  const groups = {};
  for (const p of all) (groups[p.category||'_uncat'] = groups[p.category||'_uncat'] || []).push(p);

  console.log(`\n  ${all.length} products in ${Object.keys(groups).length} categories\n`);
  console.log('  Category              Total | =100 | 95-99 | 90-94 | 80-89 | 60-79 | <60 | Top product (score)');
  console.log('  ' + '-'.repeat(120));
  const rows = [];
  for (const [cat, list] of Object.entries(groups)) {
    if (cat === '_uncat') continue;
    let rs;
    try { rs = ScoreEngine.scoreCategory(list); } catch (e) { console.log(`  ! ${cat}: ${e.message}`); continue; }
    rs.sort((a,b) => b.score - a.score);
    const dist = { e100:0, '9599':0, '9094':0, '8089':0, '6079':0, lt60:0 };
    rs.forEach(r => {
      if (r.score >= 100) dist.e100++;
      else if (r.score >= 95) dist['9599']++;
      else if (r.score >= 90) dist['9094']++;
      else if (r.score >= 80) dist['8089']++;
      else if (r.score >= 60) dist['6079']++;
      else dist.lt60++;
    });
    rows.push([cat, list.length, dist, rs[0]]);
  }
  rows.sort((a,b) => a[0].localeCompare(b[0]));
  for (const [cat, total, d, top] of rows) {
    const t100 = String(d.e100).padStart(4);
    const t99 = String(d['9599']).padStart(5);
    const t94 = String(d['9094']).padStart(5);
    const t89 = String(d['8089']).padStart(5);
    const t79 = String(d['6079']).padStart(5);
    const t59 = String(d.lt60).padStart(4);
    const topName = (top.name||'').slice(0,55);
    console.log(`  ${cat.padEnd(20)} ${String(total).padStart(5)} | ${t100} | ${t99} | ${t94} | ${t89} | ${t79} | ${t59} | ${topName} (${top.score})`);
  }
})().catch(e => { console.error(e); process.exit(1); });
