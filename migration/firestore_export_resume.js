/**
 * Firestore Export — Resume-capable
 * 
 * Kalan ürünleri + boş koleksiyonları export eder.
 * products.ndjson'a APPEND yapar (52K'dan devam).
 * Diğer koleksiyonları sıfırdan çeker.
 *
 * Usage: node firestore_export_resume.js
 *        node firestore_export_resume.js products    -> sadece products
 *        node firestore_export_resume.js users        -> sadece users
 */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const sa = require('./firebase-sa.json');

admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const OUT = path.join(__dirname, 'firebase-export');
const SKIP = new Set(['cache', 'scrape_logs']);
const BATCH = 2000;
// Firestore Reads budget (stay safe under daily quota)
const MAX_READS = 45000;

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

/** Son satırdaki __id'yi oku (resume desteği) */
async function getLastId(file) {
  if (!fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  if (stat.size === 0) return null;

  return new Promise((resolve) => {
    let lastLine = '';
    const rl = readline.createInterface({ input: fs.createReadStream(file) });
    rl.on('line', (line) => { if (line.trim()) lastLine = line; });
    rl.on('close', () => {
      try {
        const parsed = JSON.parse(lastLine);
        resolve(parsed.__id || null);
      } catch {
        resolve(null);
      }
    });
    rl.on('error', () => resolve(null));
  });
}

/** Dosyadaki satır sayısını hızlı say */
async function countLines(file) {
  if (!fs.existsSync(file)) return 0;
  return new Promise((resolve) => {
    let count = 0;
    const rl = readline.createInterface({ input: fs.createReadStream(file) });
    rl.on('line', () => count++);
    rl.on('close', () => resolve(count));
    rl.on('error', () => resolve(0));
  });
}

let totalReads = 0;

async function exportCollection(col, forceResume = false) {
  const name = col.id;
  if (SKIP.has(name)) { console.log(`[skip] ${name}`); return; }

  const file = path.join(OUT, `${name}.ndjson`);
  const existingCount = await countLines(file);
  let lastId = null;
  let mode = 'w';

  // Resume: eğer dosya doluysa, son id'den devam et
  if (existingCount > 0) {
    lastId = await getLastId(file);
    if (lastId) {
      mode = 'a'; // append
      console.log(`[${name}] Resuming from doc ${existingCount} (lastId: ${lastId.substring(0, 20)}...)`);
    }
  }

  const ws = fs.createWriteStream(file, { flags: mode });
  let total = existingCount;
  const t0 = Date.now();

  while (true) {
    if (totalReads >= MAX_READS) {
      console.log(`\n[!] Quota guard: ${totalReads} reads reached. Stopping.`);
      console.log(`    Re-run script to continue from where we left off.`);
      await new Promise((resolve, reject) => {
        ws.end(() => resolve());
        ws.on('error', reject);
      });
      return 'quota';
    }

    let q = col.orderBy(admin.firestore.FieldPath.documentId()).limit(BATCH);
    if (lastId) q = q.startAfter(lastId);
    
    const snap = await q.get();
    totalReads += snap.size;

    if (snap.empty) break;

    for (const doc of snap.docs) {
      const row = { __id: doc.id, ...sanitize(doc.data()) };
      ws.write(JSON.stringify(row) + '\n');
      total++;
    }
    lastId = snap.docs[snap.docs.length - 1].id;
    process.stdout.write(`\r[${name}] ${total} docs (${totalReads} reads)...`);

    if (snap.size < BATCH) break;
  }
  await new Promise((resolve, reject) => {
    ws.end(() => resolve());
    ws.on('error', reject);
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\r[${name}] ${total} docs total (${elapsed}s, ${totalReads} reads)`);
  return 'done';
}

(async () => {
  const onlyCol = process.argv[2]; // optional: specific collection
  const roots = await db.listCollections();
  console.log(`Found ${roots.length} root collections`);
  console.log(`Max reads budget: ${MAX_READS}`);
  console.log('---');

  // Küçük koleksiyonları önce çek, products en son (kaldığı yerden devam)
  const sorted = [...roots].sort((a, b) => {
    if (a.id === 'products') return 1;
    if (b.id === 'products') return -1;
    return a.id.localeCompare(b.id);
  });

  for (const c of sorted) {
    if (SKIP.has(c.id)) continue;
    if (onlyCol && c.id !== onlyCol) continue;

    try {
      const result = await exportCollection(c);
      if (result === 'quota') {
        console.log(`\nStopped at collection: ${c.id}`);
        console.log('Run again to resume.');
        break;
      }
    } catch (e) {
      console.error(`[!] ${c.id} FAILED:`, e.message);
    }
  }

  console.log(`\n=== Total Firestore reads this run: ${totalReads} ===`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
