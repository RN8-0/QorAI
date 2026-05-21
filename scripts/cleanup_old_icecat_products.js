'use strict';

const { req } = require('../migration/pb');

function opt(name, fallback = '') {
  const pref = `--${name}=`;
  const hit = process.argv.find(a => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : fallback;
}

const YES = process.argv.includes('--yes');
const DRY_RUN = process.argv.includes('--dry-run') || process.argv.includes('--dry') || !YES;
const MAX_ICECAT_ID = Number(opt('maxIcecatId', '49999999')) || 49999999;
const PER_PAGE = 200;

async function fetchBatch(page = 1) {
  const filter = `source="icecat" && icecatId>0 && icecatId<=${MAX_ICECAT_ID}`;
  const fields = 'id,name,brand,category,icecatId,specsCount';
  const r = await req('GET',
    `/api/collections/products/records?perPage=${PER_PAGE}&page=${page}&sort=icecatId&filter=${encodeURIComponent(filter)}&fields=${encodeURIComponent(fields)}`);
  if (r.status !== 200) throw new Error(`fetch old Icecat products failed: ${r.status} ${JSON.stringify(r.body).slice(0, 300)}`);
  return r.body;
}

async function main() {
  let total = 0;
  let page = 1;

  for (;;) {
    const body = await fetchBatch(DRY_RUN ? page : 1);
    const items = body.items || [];
    if (!items.length) break;
    total += items.length;

    const sample = items.slice(0, 5)
      .map(p => `${p.icecatId}:${p.category}:${p.brand || ''} ${String(p.name || '').slice(0, 70)}`)
      .join(' | ');
    console.log(`${DRY_RUN ? 'would delete' : 'deleting'} ${items.length} old Icecat products (icecatId <= ${MAX_ICECAT_ID})${sample ? ` — ${sample}` : ''}`);

    if (DRY_RUN) {
      if (page >= Number(body.totalPages || 1)) break;
      page++;
      continue;
    }

    for (const p of items) {
      const r = await req('DELETE', `/api/collections/products/records/${p.id}`);
      if (![200, 204].includes(r.status)) {
        console.warn(`delete failed ${p.id}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
      }
    }
  }

  console.log(`${DRY_RUN ? 'dry-run total' : 'deleted total'}: ${total}`);
}

main().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
