const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const sa = require('./firebase-sa.json');

admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const OUT = path.join(__dirname, 'firebase-export');
const SKIP = new Set(['cache', 'scrape_logs', 'scraper_logs']);
const BATCH = 2000;

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

function sanitize(v) {
  if (v === null || v === undefined) return v;
  if (v instanceof admin.firestore.Timestamp) return { __type: 'timestamp', seconds: v.seconds, nanoseconds: v.nanoseconds };
  if (v instanceof admin.firestore.GeoPoint) return { __type: 'geopoint', lat: v.latitude, lng: v.longitude };
  if (v instanceof admin.firestore.DocumentReference) return { __type: 'ref', path: v.path };
  if (Buffer.isBuffer(v)) return { __type: 'bytes', b64: v.toString('base64') };
  if (Array.isArray(v)) return v.map(sanitize);
  if (typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = sanitize(v[k]);
    return o;
  }
  return v;
}

async function exportCollection(col) {
  const name = col.id;
  if (SKIP.has(name)) { console.log(`[skip] ${name}`); return; }
  const file = path.join(OUT, `${name}.ndjson`);
  const ws = fs.createWriteStream(file);
  let total = 0;
  let last = null;
  const t0 = Date.now();
  while (true) {
    let q = col.orderBy(admin.firestore.FieldPath.documentId()).limit(BATCH);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      const row = { __id: doc.id, ...sanitize(doc.data()) };
      ws.write(JSON.stringify(row) + '\n');
      total++;
    }
    last = snap.docs[snap.docs.length - 1];
    process.stdout.write(`\r[${name}] ${total} docs...`);
    if (snap.size < BATCH) break;
  }
  ws.end();
  console.log(`\r[${name}] ${total} docs in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

(async () => {
  const roots = await db.listCollections();
  console.log(`Found ${roots.length} collections, skipping ${[...SKIP].join(', ')}`);
  for (const c of roots) {
    try { await exportCollection(c); }
    catch (e) { console.error(`[!] ${c.id} failed:`, e.message); }
  }
  console.log('Done. Output:', OUT);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
