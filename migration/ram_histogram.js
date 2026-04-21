/* eslint-disable */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const PB = process.env.POCKETBASE_URL;
const EMAIL = process.env.POCKETBASE_ADMIN_EMAIL;
const PW = process.env.POCKETBASE_ADMIN_PASSWORD;

async function pbAuth() {
  const r = await fetch(`${PB}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: EMAIL, password: PW }),
  });
  return (await r.json()).token;
}
async function fetchAll(token, category) {
  const all = []; let page = 1;
  while (true) {
    const url = `${PB}/api/collections/products/records?page=${page}&perPage=200&filter=${encodeURIComponent(`category="${category}"`)}`;
    const r = await fetch(url, { headers: { Authorization: token } });
    const j = await r.json();
    all.push(...j.items);
    if (j.items.length < 200 || page >= j.totalPages) break;
    page++;
  }
  return all;
}

function parseGb(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const m = s.match(/(\d+(?:[.,]\d+)?)\s*(tb|gb|mb|kb|t|g|m|k)?/i);
  if (!m) return null;
  let v = parseFloat(m[1].replace(',', '.'));
  const u = (m[2] || '').toLowerCase();
  if (u === 'tb' || u === 't') v *= 1024;
  else if (u === 'mb' || u === 'm') v /= 1024;
  return v;
}

function* walk(p) {
  const out = [];
  const visit = (obj, section = null) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) visit(v, k);
      else out.push({ section, key: k, val: String(v ?? '').trim() });
    }
  };
  visit(p.specs || {});
  visit(p.specSections || {});
  for (const o of out) yield o;
}

(async () => {
  const token = await pbAuth();
  const products = await fetchAll(token, 'smartphones');
  console.log(`Toplam ${products.length} telefon`);

  const dist = {};
  const top = [];
  for (const p of products) {
    let bestRam = 0, bestSrc = null;
    for (const { section, key, val } of walk(p)) {
      if (!val) continue;
      if (/^(ram|memory|memory \(ram\)|bellek)$/i.test(key)) {
        const gb = parseGb(val);
        if (gb != null && gb > bestRam) { bestRam = gb; bestSrc = { section, key, val }; }
      }
    }
    if (bestRam > 0) {
      const bucket = bestRam > 32 ? '>32' : bestRam >= 16 ? '16-32' : bestRam >= 8 ? '8-16' : bestRam >= 4 ? '4-8' : bestRam >= 2 ? '2-4' : bestRam >= 1 ? '1-2' : '<1';
      dist[bucket] = (dist[bucket] || 0) + 1;
      if (bestRam > 24) top.push({ name: p.name, id: p.id, gb: bestRam, src: bestSrc });
    }
  }

  console.log('\nRAM dağılımı (smartphones):');
  for (const [b, c] of Object.entries(dist).sort()) console.log(`  ${b.padEnd(8)} ${c}`);

  console.log(`\nRAM > 24GB olan ${top.length} ürün:`);
  top.sort((a, b) => b.gb - a.gb);
  for (const t of top.slice(0, 30)) {
    console.log(`  ${String(t.gb).padStart(6)}GB  ${t.name}  (id=${t.id})`);
    console.log(`           src: section="${t.src.section || ''}" key="${t.src.key}" val="${t.src.val}"`);
  }
})().catch(e => { console.error(e); process.exit(1); });
