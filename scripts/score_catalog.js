/**
 * Qor AI — bulk tech-score runner (server-side)
 *
 * The Icecat ingestor stores products with techScore = 0; scoring is a
 * separate stage. This loads the whole catalog, scores each category with the
 * shared ScoreEngine (admin/js/scoring/score_engine.js — Node-compatible) and
 * writes techScore back to PocketBase.
 *
 *   node scripts/score_catalog.js [--dry] [--overwrite] [--cat=laptops]
 *
 *   --dry        compute only, no writes
 *   --overwrite  re-score products that already have a non-zero techScore
 *   --cat=slug   limit to one category
 */
'use strict';

const path = require('path');
const { req } = require('../migration/pb');
const { req: tsReq } = require('../migration/ts');
const ScoreEngine = require(path.join(__dirname, '..', 'admin', 'js', 'scoring', 'score_engine.js'));

const argv = process.argv.slice(2);
const DRY = argv.includes('--dry');
const OVERWRITE = argv.includes('--overwrite');
const ONLY_CAT = (argv.find(a => a.startsWith('--cat=')) || '').split('=')[1] || '';
const CONCURRENCY = 16;
const SYNC_TS = !argv.includes('--no-ts');

// Score engine probes specs / keySpecs / specsEn. Avoid specSections here:
// it is the largest field and makes category runs crawl over the admin tunnel.
const FIELDS = 'id,category,name,brand,keySpecs,specsCount,techScore,scrapedAt,created';

async function fetchAll() {
  const out = [];
  let page = 1;
  let lastId = '';
  for (;;) {
    const filters = [];
    if (ONLY_CAT) filters.push(`category="${ONLY_CAT}"`);
    if (lastId) filters.push(`id>"${lastId.replace(/"/g, '\\"')}"`);
    const filter = filters.length ? `&filter=${encodeURIComponent(filters.join(' && '))}` : '';
    const r = await req('GET', `/api/collections/products/records?perPage=500&page=1&sort=id&skipTotal=1&fields=${FIELDS}${filter}`);
    if (r.status !== 200) throw new Error(`fetch page ${page}: ${JSON.stringify(r.body).slice(0, 200)}`);
    const items = r.body.items || [];
    out.push(...items);
    if (items.length) lastId = items[items.length - 1].id;
    console.log(`  load page ${page}: ${items.length} products · total ${out.length}${lastId ? ` · cursor ${lastId}` : ''}`);
    if (items.length < 500) break;
    page++;
  }
  return out;
}

async function runPool(items, worker) {
  let i = 0, done = 0;
  async function next() {
    while (i < items.length) {
      await worker(items[i++]);
      if (++done % 1000 === 0) console.log(`   …${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, next));
}

async function main() {
  console.log(`\n  Tech-score runner ${DRY ? '(DRY RUN)' : ''}${OVERWRITE ? ' [overwrite]' : ''}\n`);
  const products = await fetchAll();
  console.log(`  ${products.length} products loaded`);

  const groups = {};
  for (const p of products) (groups[p.category || '_uncat'] = groups[p.category || '_uncat'] || []).push(p);
  console.log(`  ${Object.keys(groups).length} categories\n`);

  const updates = [];
  for (const [cat, list] of Object.entries(groups)) {
    let rows;
    try { rows = ScoreEngine.scoreCategory(list); }
    catch (e) { console.log(`  ! ${cat}: scoring failed — ${e.message}`); continue; }
    const byId = new Map(list.map(p => [p.id, p]));
    let changed = 0;
    for (const row of rows || []) {
      const score = Math.round(Number(row.score) || 0);
      const cur = byId.get(row.id);
      if (!cur) continue;
      const had = Number(cur.techScore) || 0;
      if (!OVERWRITE && had !== 0) continue;     // keep existing scores
      if (had === score) continue;               // no change
      updates.push({ id: row.id, score, row });
      changed++;
    }
    console.log(`  ${cat.padEnd(20)} ${String(list.length).padStart(6)} products → ${changed} to update`);
  }

  console.log(`\n  ${updates.length} record(s) need a techScore write${SYNC_TS ? ' + Typesense patch' : ''}`);
  if (DRY) { console.log('  Dry run — nothing written.\n'); return; }
  if (!updates.length) { console.log('  Already scored.\n'); return; }

  let ok = 0, fail = 0, tsOk = 0, tsFail = 0;
  await runPool(updates, async (u) => {
    const r = await req('PATCH', `/api/collections/products/records/${u.id}`, {
      techScore: u.score,
      techSubscores: {
        ...(u.row.subscores || {}),
        overall: u.score,
        confidence: u.row.confidence,
        tier: u.row.tier || null,
        anchorKey: u.row.anchorKey || null,
        evidence: u.row.evidence || null,
        engine: 'v7',
      },
      scoreUpdatedAt: new Date().toISOString(),
    });
    if (r.status === 200) {
      ok++;
      if (SYNC_TS) {
        const tr = await tsReq('PATCH', `/collections/products/documents/${encodeURIComponent(u.id)}`, {
          techScore: u.score,
        });
        if (tr.status >= 200 && tr.status < 300) tsOk++;
        else {
          tsFail++;
          if (tsFail <= 8) console.log(`   ! ts ${u.id}: ${tr.status}`);
        }
      }
    } else {
      fail++;
      if (fail <= 8) console.log(`   ! pb ${u.id}: ${r.status}`);
    }
  });
  console.log(`\n  Done — PB ${ok} scored, ${fail} failed${SYNC_TS ? ` · TS ${tsOk} patched, ${tsFail} failed` : ''}.\n`);
}

main().catch(e => { console.error('  ✗', e.message); process.exit(1); });
