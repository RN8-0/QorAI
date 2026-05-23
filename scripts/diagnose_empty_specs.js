'use strict';
// Look at the "ghost" products the admin UI still shows after the wipe.
// Goal: figure out what source field value they actually carry, and whether
// Epey records have lost their specs.
const { req } = require('../migration/pb');

async function probe(label, filter, fields = 'id,name,brand,source,sourceUrl,specsCount,category') {
  const r = await req('GET',
    `/api/collections/products/records?perPage=10&page=1&filter=${encodeURIComponent(filter)}&fields=${encodeURIComponent(fields)}&sort=-created`);
  if (r.status !== 200) {
    console.log(`\n${label} — ERROR ${r.status}`);
    return;
  }
  console.log(`\n${label} — totalItems=${r.body.totalItems}`);
  for (const p of (r.body.items || []).slice(0, 5)) {
    console.log(`  id=${p.id} src="${p.source || ''}" specsCount=${p.specsCount ?? '?'} cat=${p.category} | ${String(p.name || '').slice(0, 80)}`);
  }
}

async function distinctSources() {
  // Paged scan to find all unique `source` values + their counts.
  const counts = {};
  let page = 1;
  while (true) {
    const r = await req('GET',
      `/api/collections/products/records?perPage=500&page=${page}&skipTotal=1&fields=source`);
    if (r.status !== 200) break;
    const items = r.body.items || [];
    if (!items.length) break;
    for (const p of items) {
      const key = (p.source ?? '').toString();
      counts[key] = (counts[key] || 0) + 1;
    }
    if (items.length < 500) break;
    page++;
    if (page > 200) break; // 100k safety cap
  }
  console.log('\n=== ALL distinct `source` values + counts ===');
  Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`  "${k.padEnd(20)}" ${String(v).padStart(8)}`);
  });
}

(async () => {
  await distinctSources();
  await probe('Empty source field', 'source=""');
  await probe('Source field NULL (omitted filter)', 'source=null');
  await probe('R-Go Tools brand sample', 'brand~"R-Go"');
  await probe('Products with specsCount=0', 'specsCount=0');
  await probe('Epey w/ specsCount=0 (the worrying case)',
    '(source="epey.com" || source="epey") && specsCount=0');
  await probe('Epey w/ specsCount>=20 (sanity)',
    '(source="epey.com" || source="epey") && specsCount>=20');
})().catch(e => { console.error(e); process.exit(1); });
