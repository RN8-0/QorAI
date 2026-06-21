// AI buying-guide generator. For each catalogue category it writes a unique
// Turkish buying guide (intro + what-to-look-for + standout models + FAQ) using
// the DeepSeek proxy, grounded on the category's real top products so the text
// is specific (not generic AI filler) and reads like a human tech editor wrote
// it. Output: web/public/guides/<category>.json (served at /guides/<cat>.json
// and baked into the category page by seo.mjs). Idempotent — skips a category
// whose guide already exists and is younger than MAX_AGE_DAYS unless --force.
//
//   node web/scripts/gen-guides.mjs            # fill missing / stale
//   node web/scripts/gen-guides.mjs --force    # regenerate all

import { writeFileSync, readFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { categoryLabel } from '../src/lib/format.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'public', 'guides');
const PB_URL = 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';
const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const TS_KEY = 'BFc7h2MZhq5yct2GxzkClzQtzzCglKIb';
const FORCE = process.argv.includes('--force');
const MAX_AGE_DAYS = 30;
const CONCURRENCY = 3;

mkdirSync(outDir, { recursive: true });

function slugifyProduct(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
}

async function tsCategories() {
  const qs = new URLSearchParams({ q: '*', query_by: 'name', per_page: '0', facet_by: 'category', max_facet_values: '60' });
  const r = await fetch(`${TS_URL}/collections/products/documents/search?${qs}`, { headers: { 'X-TYPESENSE-API-KEY': TS_KEY } });
  const j = await r.json();
  const counts = (j.facet_counts?.[0]?.counts || []).filter((c) => c.count >= 8);
  return counts.map((c) => c.value);
}

async function tsTop(cat, n = 12) {
  const qs = new URLSearchParams({
    q: '*', query_by: 'name', filter_by: `category:=${cat}`, sort_by: 'techScore:desc',
    per_page: String(n), include_fields: 'id,name,slug,brand,techScore',
  });
  const r = await fetch(`${TS_URL}/collections/products/documents/search?${qs}`, { headers: { 'X-TYPESENSE-API-KEY': TS_KEY } });
  const j = await r.json();
  return (j.hits || []).map((h) => h.document).filter((d) => d?.id && d?.name);
}

async function deepseek(system, user) {
  const res = await fetch(`${PB_URL}/api/ai/deepseek`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      max_tokens: 3000, temperature: 0.85, response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) throw new Error(`deepseek ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('deepseek empty');
  return JSON.parse(content);
}

const SYSTEM = [
  'Sen, Türkiye merkezli bir teknoloji karşılaştırma sitesi için yazan deneyimli bir teknoloji editörüsün.',
  'Görevin: bir ürün kategorisi için satın alma rehberi yazmak. Akıcı, samimi ama bilgili bir Türkçeyle yaz.',
  'KURALLAR:',
  '- Asla yapay zeka olduğundan, model adından veya "bu rehberde" gibi klişelerden bahsetme.',
  '- "Sonuç olarak", "özetle", "unutmayın ki" gibi kalıpları KULLANMA.',
  '- Gerçek, uygulanabilir tavsiyeler ver; jenerik laf kalabalığı yapma.',
  '- Verilen gerçek modelleri doğal şekilde, neden öne çıktıklarını açıklayarak kullan.',
  '- Fiyat rakamı UYDURMA (fiyatlar değişir); bunun yerine fiyat/performans, segment gibi ifadeler kullan.',
  '- Çıktı SADECE geçerli JSON olsun.',
].join('\n');

function buildUser(label, picks) {
  const list = picks.map((p) => `- ${p.name}${p.brand ? ` (${p.brand})` : ''} — Qor AI skoru ${p.techScore || '?'}/100`).join('\n');
  return [
    `Kategori: ${label}`,
    `Bu kategorideki gerçek öne çıkan modeller:\n${list}`,
    '',
    'Şu JSON yapısında bir satın alma rehberi yaz:',
    '{',
    '  "title": "<60 karakteri geçmeyen, \'en iyi <kategori> 2026\' niyetini karşılayan başlık>",',
    '  "lead": "<2 cümlelik giriş, okuyucuyu kategoriye ısındıran>",',
    '  "sections": [ {"h":"<alt başlık>","body":"<2-4 cümlelik paragraf>"}, ... 3 ila 4 bölüm; en az biri \'nelere dikkat etmeli\' içermeli ],',
    '  "picks": [ {"name":"<yukarıdaki gerçek modellerden biri>","why":"<tek cümle, neden iyi>"}, ... 4 ila 6 model ],',
    '  "faq": [ {"q":"<sık sorulan soru>","a":"<kısa, net cevap>"}, ... 4 soru ]',
    '}',
    'Tüm metin Türkçe olsun. picks içindeki name alanları yukarıdaki listedeki adlarla AYNI olsun.',
  ].join('\n');
}

async function genOne(cat) {
  const label = categoryLabel(cat, 'tr');
  const file = join(outDir, `${cat}.json`);
  if (!FORCE && existsSync(file)) {
    try {
      const prev = JSON.parse(readFileSync(file, 'utf8'));
      const ageDays = (Date.now() - Date.parse(prev.updatedAt || 0)) / 86400000;
      if (ageDays < MAX_AGE_DAYS) return { cat, status: 'skip' };
    } catch (_) { /* regenerate on parse error */ }
  }
  const picks = await tsTop(cat);
  if (picks.length < 3) return { cat, status: 'too-few' };
  const out = await deepseek(SYSTEM, buildUser(label, picks));
  // map picks back to real product ids/slugs so the page can link them
  const byName = new Map(picks.map((p) => [p.name.toLowerCase().trim(), p]));
  const resolvedPicks = (out.picks || []).map((pk) => {
    const m = byName.get(String(pk.name || '').toLowerCase().trim())
      || picks.find((p) => p.name.toLowerCase().includes(String(pk.name || '').toLowerCase().slice(0, 12)));
    if (!m) return null;
    return { name: m.name, why: String(pk.why || '').trim(), id: m.id, slug: slugifyProduct(m.slug || m.name) };
  }).filter(Boolean);
  const guide = {
    category: cat, label,
    title: String(out.title || `En İyi ${label} 2026`).trim().slice(0, 70),
    lead: String(out.lead || '').trim(),
    sections: (out.sections || []).filter((s) => s && s.h && s.body).slice(0, 5)
      .map((s) => ({ h: String(s.h).trim(), body: String(s.body).trim() })),
    picks: resolvedPicks.slice(0, 6),
    faq: (out.faq || []).filter((f) => f && f.q && f.a).slice(0, 6)
      .map((f) => ({ q: String(f.q).trim(), a: String(f.a).trim() })),
    updatedAt: new Date().toISOString(),
  };
  if (!guide.lead || guide.sections.length < 2) return { cat, status: 'thin' };
  writeFileSync(file, JSON.stringify(guide, null, 2));
  return { cat, status: 'wrote' };
}

async function main() {
  const cats = await tsCategories();
  console.log(`[guides] ${cats.length} categories`);
  const results = [];
  for (let i = 0; i < cats.length; i += CONCURRENCY) {
    const batch = cats.slice(i, i + CONCURRENCY);
    const r = await Promise.all(batch.map((c) => genOne(c).catch((e) => ({ cat: c, status: `err:${e.message}` }))));
    r.forEach((x) => { console.log(`  ${x.cat}: ${x.status}`); results.push(x); });
  }
  const wrote = results.filter((r) => r.status === 'wrote').length;
  const total = readdirSync(outDir).filter((f) => f.endsWith('.json')).length;
  console.log(`[guides] wrote ${wrote} this run; ${total} guides on disk total`);
}

main().catch((e) => { console.error('[guides] fatal:', e); process.exit(1); });
