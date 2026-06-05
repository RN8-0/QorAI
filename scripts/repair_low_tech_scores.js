'use strict';

const path = require('path');
const { req } = require('../migration/pb');
const ScoreEngine = require(path.join(__dirname, '..', 'admin', 'js', 'scoring', 'score_engine.js'));

const YES = process.argv.includes('--yes');
const ONLY_CAT = (process.argv.find(a => a.startsWith('--cat=')) || '').split('=')[1] || '';
const FIELDS = [
  'id', 'name', 'brand', 'category', 'source', 'sourceUrl',
  'keySpecs', 'specs', 'specsEn', 'specSections', 'multiLangSpecs',
  'techScore', 'specsCount', 'scrapedAt', 'created',
].join(',');

async function listProducts(filter, fields = FIELDS) {
  const out = [];
  const perPage = 100;
  for (let page = 1; ; page++) {
    const filterParam = filter ? `&filter=${encodeURIComponent(filter)}` : '';
    const r = await req(
      'GET',
      `/api/collections/products/records?perPage=${perPage}&page=${page}&sort=id&fields=${encodeURIComponent(fields)}${filterParam}`,
    );
    if (r.status !== 200) throw new Error(`list failed: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
    const items = r.body.items || [];
    out.push(...items);
    if (page === 1 || page % 10 === 0) {
      const total = r.body.totalItems != null ? `/${r.body.totalItems}` : '';
      console.log(`  fetched page ${page}: +${items.length} (total ${out.length}${total})`);
    }
    if (items.length < perPage || (r.body.totalPages && page >= r.body.totalPages)) break;
  }
  return out;
}

async function patchProductScore(row) {
  const body = {
    techScore: row.score,
    techSubscores: {
      ...(row.subscores || {}),
      overall: row.score,
      confidence: row.confidence,
      tier: row.tier || null,
      anchorKey: row.anchorKey || null,
      evidence: row.evidence || null,
      engine: 'v7',
      repairedFromLowScore: true,
    },
    scoreUpdatedAt: new Date().toISOString(),
  };
  const r = await req('PATCH', `/api/collections/products/records/${row.id}`, body);
  if (r.status !== 200) throw new Error(`patch ${row.id}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
}

async function main() {
  const badFilter = [
    'techScore > 0 && techScore <= 10',
    ONLY_CAT ? `category="${ONLY_CAT.replace(/"/g, '\\"')}"` : '',
  ].filter(Boolean).join(' && ');
  const bad = await listProducts(badFilter, 'id,name,category,techScore');
  console.log(`low techScore records: ${bad.length}`);
  if (!bad.length) return;

  const badById = new Map(bad.map(p => [p.id, p]));
  const categories = [...new Set(bad.map(p => p.category).filter(Boolean))].sort();
  console.log(`affected categories: ${categories.join(', ') || '(none)'}`);

  let repaired = 0;
  for (const category of categories) {
    const products = await listProducts(`category="${category.replace(/"/g, '\\"')}"`);
    const scored = ScoreEngine.scoreCategory(products);
    const rows = scored.filter(row => badById.has(row.id));
    console.log(`[${category}] products=${products.length} low=${rows.length}`);
    for (const row of rows) {
      const before = badById.get(row.id);
      console.log(`  ${before.techScore} -> ${row.score} ${before.name || row.name || row.id}`);
      if (YES) {
        await patchProductScore(row);
        repaired++;
      }
    }
  }
  console.log(YES ? `repaired=${repaired}` : 'dry-run only; rerun with --yes to patch');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
