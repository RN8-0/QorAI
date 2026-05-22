// Partial sync: copy techScore from PocketBase -> Typesense for all products.
// Uses Typesense bulk import in `update` mode so existing search documents are
// patched without replacing name/category/image fields.
const fs = require('fs');
const path = require('path');
const { req: pbReq } = require('./pb');

const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = Object.fromEntries(
  envFile
    .split(/\r?\n/)
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const TS_BASE = env.TYPESENSE_URL;
const TS_KEY = env.TYPESENSE_API_KEY;

const COL = 'products';
const PB_PER_PAGE = 500;
const TS_BATCH = 1000;

async function fetchPbBatch(page) {
  const r = await pbReq(
    'GET',
    `/api/collections/products/records?page=${page}&perPage=${PB_PER_PAGE}&fields=id,techScore`,
  );
  if (r.status !== 200)
    throw new Error(
      `pb page ${page}: ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`,
    );
  return r.body;
}

async function tsBulkUpsert(docs) {
  const jsonl = docs.map(d => JSON.stringify(d)).join('\n');
  const url = `${TS_BASE}/collections/${COL}/documents/import?action=update`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-TYPESENSE-API-KEY': TS_KEY,
      'Content-Type': 'text/plain',
    },
    body: jsonl,
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error('[ts] bulk failed', res.status, txt.slice(0, 300));
    return { ok: 0, fail: docs.length };
  }
  const text = await res.text();
  const lines = text.trim().split('\n');
  let ok = 0,
    fail = 0;
  for (const line of lines) {
    try {
      const j = JSON.parse(line);
      if (j.success) ok++;
      else fail++;
    } catch {
      fail++;
    }
  }
  return { ok, fail };
}

(async () => {
  console.log('[sync] starting techScore PB -> TS partial sync');
  let page = 1;
  let totalOk = 0,
    totalFail = 0;
  const t0 = Date.now();

  while (true) {
    const batch = await fetchPbBatch(page);
    if (!batch.items || batch.items.length === 0) break;

    const docs = batch.items
      .filter(p => p.id && p.techScore != null)
      .map(p => ({ id: p.id, techScore: Number(p.techScore) || 0 }));

    if (docs.length === 0) {
      console.log(`[sync] page ${page}: 0 valid docs, skipping`);
    } else {
      for (let i = 0; i < docs.length; i += TS_BATCH) {
        const chunk = docs.slice(i, i + TS_BATCH);
        const { ok, fail } = await tsBulkUpsert(chunk);
        totalOk += ok;
        totalFail += fail;
      }
      console.log(
        `[sync] page ${page}/${batch.totalPages}: synced ${docs.length} docs ` +
          `(running total ok=${totalOk}, fail=${totalFail})`,
      );
    }

    if (page >= batch.totalPages) break;
    page++;
  }

  const sec = Math.round((Date.now() - t0) / 1000);
  console.log(`[sync] DONE in ${sec}s — ok=${totalOk}, fail=${totalFail}`);
})().catch(e => {
  console.error('[sync] FATAL', e);
  process.exit(1);
});
