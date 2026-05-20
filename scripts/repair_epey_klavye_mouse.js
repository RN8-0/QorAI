/**
 * Qor AI — Epey klavye-mouse split repair
 *
 * Epey lists keyboards and mice under one path (`/klavye-mouse/...`), so a
 * single URL is not enough to tell which is which. The original ingestion
 * dumped most of them into `ram` and a smaller batch into `mice`, which left
 * the admin Products view mixing keyboards into the Mice filter (and 2k+
 * keyboards living inside the RAM category).
 *
 * This pass re-classifies every product whose sourceUrl starts with
 * `/klavye-mouse/` purely by the product name:
 *
 *   contains "Klavye"  →  keyboards   (Turkish for keyboard, what Epey prints)
 *   contains "Mouse"   →  mice
 *   otherwise          →  leave alone (no confident signal)
 *
 *   node scripts/repair_epey_klavye_mouse.js --dry
 *   node scripts/repair_epey_klavye_mouse.js
 */
'use strict';

const { req } = require('../migration/pb');

const DRY = process.argv.includes('--dry');
const CONCURRENCY = 8;

function classify(name) {
  const n = String(name || '').toLowerCase();
  // "Klavye & Mouse Seti" / "Mouse Klavye Seti" → keyboard combo.
  if (/\bklavye\b/.test(n)) return 'keyboards';
  if (/\bmouse\b|\bmice\b/.test(n)) return 'mice';
  return null;
}

async function fetchAll() {
  const out = [];
  for (let page = 1; ; page++) {
    const filter = encodeURIComponent('sourceUrl~"klavye-mouse"');
    const r = await req('GET', `/api/collections/products/records?perPage=300&page=${page}&fields=id,name,category,sourceUrl&filter=${filter}`);
    if (r.status !== 200) throw new Error(`fetch ${page}: ${r.status} ${JSON.stringify(r.body).slice(0, 180)}`);
    out.push(...(r.body.items || []));
    if (page >= (r.body.totalPages || 1)) break;
  }
  return out;
}

async function runPool(items, worker) {
  let next = 0, done = 0;
  async function loop() {
    while (next < items.length) {
      const item = items[next++];
      try { await worker(item); } catch (e) { console.log('   ! worker error:', e.message); }
      if (++done % 200 === 0) console.log(`   ...${done}/${items.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, loop));
}

async function main() {
  console.log(`\n  Epey klavye-mouse split repair ${DRY ? '(DRY RUN)' : ''}\n`);
  const products = await fetchAll();
  console.log(`  loaded ${products.length} products from /klavye-mouse/ URLs\n`);

  const updates = [];
  const beforeBy = {};
  const afterBy = {};
  let leaveAlone = 0;
  for (const p of products) {
    beforeBy[p.category] = (beforeBy[p.category] || 0) + 1;
    const target = classify(p.name);
    if (!target) { leaveAlone++; continue; }
    if (target === p.category) { afterBy[target] = (afterBy[target] || 0) + 1; continue; }
    updates.push({ id: p.id, name: p.name, from: p.category, to: target });
    afterBy[target] = (afterBy[target] || 0) + 1;
  }
  for (const k of Object.keys(beforeBy)) afterBy[k] = afterBy[k] || 0;

  console.log('  Before:');
  Object.entries(beforeBy).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`    ${k.padEnd(20)} ${String(v).padStart(6)}`));
  console.log('  After (projected):');
  Object.entries(afterBy).sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`    ${k.padEnd(20)} ${String(v).padStart(6)}`));
  if (leaveAlone) console.log(`  ${leaveAlone} product(s) had no Klavye/Mouse hint and were left alone`);
  console.log(`\n  ${updates.length} products will be re-categorised\n`);

  updates.slice(0, 10).forEach(u => console.log(`    · ${u.from} → ${u.to}   ${u.name}`));
  if (updates.length > 10) console.log(`    ... +${updates.length - 10} more`);

  if (DRY || !updates.length) { console.log('\n  (no writes performed)\n'); return; }

  let ok = 0, fail = 0;
  await runPool(updates, async (u) => {
    const r = await req('PATCH', `/api/collections/products/records/${u.id}`, { category: u.to });
    if (r.status === 200) ok++;
    else { fail++; if (fail <= 5) console.log(`   ! ${u.id}: ${r.status} ${JSON.stringify(r.body).slice(0, 140)}`); }
  });
  console.log(`\n  done: ${ok} re-categorised, ${fail} failed\n`);

  // Refresh the categories collection counts so the admin Category dropdown
  // immediately reflects reality. (The dropdown reads productCount from there.)
  for (const slug of ['keyboards', 'mice', 'ram']) {
    const c = await req('GET', `/api/collections/products/records?perPage=1&fields=id&filter=${encodeURIComponent(`category="${slug}"`)}`);
    const count = c.status === 200 ? (c.body.totalItems || 0) : null;
    if (count == null) continue;
    const cr = await req('GET', `/api/collections/categories/records?perPage=1&filter=${encodeURIComponent(`slug="${slug}"`)}`);
    const cat = cr.body?.items?.[0];
    if (cat) {
      await req('PATCH', `/api/collections/categories/records/${cat.id}`, { productCount: count, isActive: count > 0 });
      console.log(`  · refreshed categories/${slug}: productCount=${count}`);
    }
  }
}

main().catch(e => { console.error('  x', e.message); process.exit(1); });
