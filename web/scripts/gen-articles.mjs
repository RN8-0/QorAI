// Blog article generator → PocketBase `articles` collection. For each category it
// writes a native TR/EN/DE buying-guide listicle (DeepSeek), grounded on the
// category's real top products, and upserts it into PB so the SITE renders it and
// the ADMIN/PB dashboard can edit it. Product refs link back to on-site specs
// pages (internal linking + the visitor lands on our affiliate links).
//
//   node web/scripts/gen-articles.mjs                 # fill missing / stale
//   node web/scripts/gen-articles.mjs --force         # regenerate all
//   node web/scripts/gen-articles.mjs --only=smartphones,laptops
//
// PB admin creds: env (POCKETBASE_URL / _ADMIN_EMAIL / _ADMIN_PASSWORD) or, for
// local runs, migration/.env.

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { categoryLabel } from '../src/lib/format.js';

const here = dirname(fileURLToPath(import.meta.url));
const PB_URL = 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';
const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const TS_KEY = 'BFc7h2MZhq5yct2GxzkClzQtzzCglKIb';
const FORCE = process.argv.includes('--force');
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').replace('--only=', '').split(',').filter(Boolean);
const MAX_AGE_DAYS = 30;
const LANGS = ['tr', 'en', 'de'];
const LANG_NAME = { tr: 'Türkçe', en: 'English', de: 'Deutsch' };

function pbCreds() {
  const e = { ...process.env };
  if ((!e.POCKETBASE_ADMIN_EMAIL || !e.POCKETBASE_ADMIN_PASSWORD)) {
    const f = join(here, '..', '..', 'migration', '.env');
    if (existsSync(f)) {
      for (const line of readFileSync(f, 'utf8').split(/\r?\n/)) {
        const i = line.indexOf('='); if (i < 0 || line.startsWith('#')) continue;
        const k = line.slice(0, i).trim(); if (!e[k]) e[k] = line.slice(i + 1).trim();
      }
    }
  }
  return { url: (e.POCKETBASE_URL || PB_URL).replace(/\/$/, ''), email: e.POCKETBASE_ADMIN_EMAIL, pass: e.POCKETBASE_ADMIN_PASSWORD };
}

let token = '';
async function pbAuth() {
  const { url, email, pass } = pbCreds();
  const r = await fetch(`${url}/api/collections/_superusers/auth-with-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password: pass }),
  });
  if (!r.ok) throw new Error(`PB auth ${r.status}`);
  token = (await r.json()).token;
}
async function pb(method, path, body) {
  const { url } = pbCreds();
  const r = await fetch(`${url}${path}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: token },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

function slugifyProduct(v) {
  return String(v || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
}
function modelKey(name) {
  let s = String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
  s = s.replace(/\([^)]*\)/g, ' ').replace(/\b\d+\s?(gb|tb|mb)\b/g, ' ')
    .replace(/\b(schwarz|weiss|blau|rot|grau|silber|gold|black|white|blue|red|green|silver|mit|armband|loop|sport|titan|aluminium|case|gehause)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  return s.split(' ').slice(0, 6).join(' ');
}

async function tsCategories() {
  const qs = new URLSearchParams({ q: '*', query_by: 'name', per_page: '0', facet_by: 'category', max_facet_values: '60' });
  const r = await (await fetch(`${TS_URL}/collections/products/documents/search?${qs}`, { headers: { 'X-TYPESENSE-API-KEY': TS_KEY } })).json();
  return (r.facet_counts?.[0]?.counts || []).filter((c) => c.count >= 8).map((c) => c.value);
}
// opts.brands: tanınmış marka allow-list'i (no-name/leş ürünlerin listelere
// sızmasını keser — "Concord kulaklık" vakası); opts.nameRe: seri filtresi
// (ROG/Legion… gibi); fiyat: rollup'taki gerçek Amazon TR fiyatı makaleye taşınır.
async function tsTop(cat, n = 8, opts = {}) {
  const qs = new URLSearchParams({ q: '*', query_by: 'name', filter_by: `category:=${cat}`, sort_by: 'techScore:desc', per_page: '120', include_fields: 'id,name,slug,brand,techScore,imageUrl,lowestPrice,lowestPriceCurrency' });
  const r = await (await fetch(`${TS_URL}/collections/products/documents/search?${qs}`, { headers: { 'X-TYPESENSE-API-KEY': TS_KEY } })).json();
  const seen = new Set(); const out = [];
  const brands = (opts.brands || []).map((b) => b.toLowerCase());
  for (const h of (r.hits || [])) {
    const d = h.document;
    if (!d?.id || !d?.name) continue;
    if (!/^https?:\/\//i.test(d.imageUrl || '')) continue;
    if (brands.length && !brands.includes(String(d.brand || '').toLowerCase())) continue;
    if (opts.nameRe && !opts.nameRe.test(d.name)) continue;
    const k = modelKey(d.name); if (k && seen.has(k)) continue; if (k) seen.add(k);
    const price = (Number(d.lowestPrice) > 0 && d.lowestPriceCurrency === 'TRY')
      ? `${Math.round(Number(d.lowestPrice)).toLocaleString('tr-TR')} TL` : '';
    out.push({ id: d.id, name: d.name, slug: slugifyProduct(d.slug || d.name), brand: d.brand || '', techScore: d.techScore || 0, imageUrl: d.imageUrl, price });
    if (out.length >= n) break;
  }
  return out;
}

// Niş, aranabilir başlıklar — jenerik "en iyi telefon" yerine. Her konu:
// kürasyonlu marka listesi + (gerekirse) seri regex'i + editoryal açı.
const TOPICS = {
  'en-iyi-oyuncu-telefonlari': {
    cat: 'smartphones', n: 8,
    slug_tr: 'en-iyi-oyuncu-telefonlari', slug_en: 'best-gaming-phones', slug_de: 'beste-gaming-smartphones',
    label: { tr: 'oyuncu telefonları', en: 'gaming phones', de: 'Gaming-Smartphones' },
    brands: ['Apple', 'Samsung', 'Xiaomi', 'Asus', 'OnePlus', 'Google', 'Poco', 'Realme', 'Honor', 'Nubia', 'RedMagic', 'iQOO'],
    angle: 'Audience: mobile gamers. Judge ONLY through a gaming lens: sustained performance and throttling, cooling, display refresh rate and touch sampling, battery drain under load, speakers/haptics. Be concrete about real game scenarios (e.g. what graphics settings a demanding title runs at). Do not repeat camera/marketing talk.',
  },
  'en-iyi-gaming-laptoplar': {
    cat: 'laptops', n: 8,
    slug_tr: 'en-iyi-gaming-laptoplar', slug_en: 'best-gaming-laptops', slug_de: 'beste-gaming-laptops',
    label: { tr: 'gaming laptoplar', en: 'gaming laptops', de: 'Gaming-Laptops' },
    brands: ['Asus', 'MSI', 'Lenovo', 'HP', 'Acer', 'Monster', 'Casper', 'Dell', 'Gigabyte'],
    nameRe: /rog|tuf|legion|loq|omen|victus|nitro|predator|katana|raider|vector|abra|tulpar|strix|scar|cyborg|g1[4568]|gaming/i,
    angle: 'Audience: PC gamers. Judge by GPU tier and wattage, cooling and fan noise, display (Hz, response), upgrade room and price/performance within its segment. Say concretely what class of gaming each machine is for (1080p high, 1440p ultra…). No office-laptop generalities.',
  },
};

async function deepseek(system, user) {
  const { url } = pbCreds();
  const r = await fetch(`${url}/api/ai/deepseek`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 3500, temperature: 0.85, response_format: { type: 'json_object' } }),
  });
  if (!r.ok) throw new Error(`deepseek ${r.status}`);
  const c = (await r.json())?.choices?.[0]?.message?.content;
  if (!c) throw new Error('deepseek empty');
  return JSON.parse(c);
}

async function geminiJson(system, user) {
  const { url } = pbCreds();
  const r = await fetch(`${url}/api/ai/gemini`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      // 3500 Gemini'nin uzun listicle çıktısında JSON'u ortadan kesiyordu
      // (Unterminated string) — çıktı tavanı yüksek tutulur.
      generationConfig: { maxOutputTokens: 8192, temperature: 0.85, responseMimeType: 'application/json' },
    }),
  });
  if (!r.ok) throw new Error(`gemini ${r.status}`);
  const data = await r.json();
  const c = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  if (!c) throw new Error('gemini empty');
  return JSON.parse(c);
}

// DeepSeek (bakiye varsa) → Gemini fallback; tek sağlayıcı ölünce üretim durmasın.
// Gemini tarafına bir tekrar hakkı: 429 ve kesik-JSON (truncation) geçici olabiliyor.
async function aiJson(system, user) {
  try { return await deepseek(system, user); } catch (_) { /* bakiye/kota → gemini */ }
  try { return await geminiJson(system, user); }
  catch (_) { return await geminiJson(system, user); }
}

function sys(lang) {
  return [
    `You are a senior tech editor at a ${LANG_NAME[lang]} tech publication, writing a buying guide. You have strong opinions formed by years of reviewing hardware.`,
    'VOICE — must read like a human editor, never like generated text:',
    '- Vary sentence length; mix short punchy sentences with longer ones. Start some sentences with "Ama", "Yine de", "Açıkçası" (or natural equivalents in the target language).',
    '- Take positions: say which pick YOU would buy and why. Include one honest drawback per model — no product is perfect.',
    '- Concrete over abstract: name specs, use-cases and real trade-offs, never vague praise.',
    'BANNED (instant tells of machine text): "günümüzde", "sonuç olarak", "özetle", "ister ... ister ...", "arayanlar için", "öne çıkıyor", "ihtiyaçlarınıza", "in conclusion", "whether you\'re", "game-changer", "delve", "comprehensive", "furthermore", "elevate", exclamation marks, rhetorical questions, and starting every pick the same way.',
    'NEVER mention AI or that this is generated. Do NOT invent prices or availability — a real price may be provided per model; you may call something expensive/good value but never state numbers not given.',
    'Output ONLY valid JSON.',
  ].join('\n');
}
function userMsg(lang, label, picks, angle = '') {
  const list = picks.map((p) => `- ${p.name}${p.brand ? ` (${p.brand})` : ''} — score ${p.techScore}/100${p.price ? ` — street price ${p.price}` : ''}`).join('\n');
  return [
    `Topic: best ${label} (2026 buying guide). Language: ${LANG_NAME[lang]}.`,
    angle ? `Editorial angle (follow strictly): ${angle}` : '',
    `Real models to cover:\n${list}`,
    'Return JSON:',
    '{',
    '  "title": "<SEO title matching the topic intent, <=65 chars, include the year 2026>",',
    '  "lead": "<2 sentences, direct and specific — what this guide answers and for whom>",',
    '  "body": "<HTML: one intro <p> with a clear point of view, then an <h2> with a <ul> of 4-5 concrete buying criteria for THIS topic. Use only <h2>,<p>,<ul>,<li>,<strong>. No model names here, no images, no links, no invented prices.>",',
    '  "picks": [ {"name":"<EXACT name from the list above>","desc":"<3-4 sentences: what it does best for this audience, one honest weakness, who should pick it. Each pick must OPEN DIFFERENTLY.>"}, ... one per listed model ]',
    '}',
    `Everything in ${LANG_NAME[lang]}. picks[].name MUST match the list exactly.`,
  ].filter(Boolean).join('\n');
}

async function genOne(cat, existing, topic = null) {
  if (!FORCE && existing) {
    const ageDays = (Date.now() - Date.parse(existing.updated || 0)) / 86400000;
    if (ageDays < MAX_AGE_DAYS) return { cat, status: 'skip' };
  }
  const picks = await tsTop(topic ? topic.cat : cat, topic ? (topic.n || 8) : 8, topic || {});
  if (picks.length < 3) return { cat, status: 'too-few' };
  const prod = picks.map((p) => ({ id: p.id, slug: p.slug, name: p.name, brand: p.brand, techScore: p.techScore, imageUrl: p.imageUrl, ...(p.price ? { price: p.price } : {}) }));
  const byName = new Map(picks.map((p, i) => [p.name.toLowerCase().trim(), i]));
  const rec = topic
    ? { slug: topic.slug_tr, slug_tr: topic.slug_tr, slug_en: topic.slug_en, slug_de: topic.slug_de, status: 'published', category: topic.cat, cover: picks[0].imageUrl }
    : { slug: cat, status: 'published', category: cat, cover: picks[0].imageUrl };
  for (const lang of LANGS) {
    const label = topic ? (topic.label[lang] || topic.label.tr) : categoryLabel(cat, lang);
    const out = await aiJson(sys(lang), userMsg(lang, label, picks, topic ? topic.angle : ''));
    rec[`title_${lang}`] = String(out.title || '').trim().slice(0, 90);
    rec[`lead_${lang}`] = String(out.lead || '').trim();
    rec[`body_${lang}`] = String(out.body || '').trim();
    for (const pk of (out.picks || [])) {
      const key = String(pk.name || '').toLowerCase().trim();
      let idx = byName.has(key) ? byName.get(key) : picks.findIndex((p) => key && p.name.toLowerCase().includes(key.slice(0, 14)));
      if (idx != null && idx >= 0 && pk.desc) prod[idx][`desc_${lang}`] = String(pk.desc).trim();
    }
  }
  rec.products = prod;
  if (!rec.title_tr || !rec.body_tr) return { cat, status: 'thin' };
  if (existing) { const r = await pb('PATCH', `/api/collections/articles/records/${existing.id}`, rec); return { cat, status: r.status < 300 ? 'updated' : `err:${r.status}` }; }
  const r = await pb('POST', '/api/collections/articles/records', rec);
  return { cat, status: r.status < 300 ? 'created' : `err:${r.status}:${JSON.stringify(r.body).slice(0, 200)}` };
}

async function main() {
  await pbAuth();
  const existRes = await pb('GET', '/api/collections/articles/records?perPage=200&fields=id,slug,updated');
  const existing = new Map((existRes.body.items || []).map((x) => [x.slug, x]));
  const TOPIC_ARG = (process.argv.find((a) => a.startsWith('--topics=')) || '').replace('--topics=', '').split(',').filter(Boolean);
  if (TOPIC_ARG.length) {
    console.log(`[articles] ${TOPIC_ARG.length} niche topics; ${existing.size} existing`);
    for (const key of TOPIC_ARG) {
      const topic = TOPICS[key];
      if (!topic) { console.log(`  ${key}: unknown topic (options: ${Object.keys(TOPICS).join(', ')})`); continue; }
      try { const r = await genOne(key, existing.get(topic.slug_tr), topic); console.log(`  ${key}: ${r.status}`); }
      catch (e) { console.log(`  ${key}: err:${e.message}`); }
    }
    return;
  }
  let cats = ONLY.length ? ONLY : await tsCategories();
  console.log(`[articles] ${cats.length} categories; ${existing.size} existing`);
  for (const cat of cats) {
    try { const r = await genOne(cat, existing.get(cat)); console.log(`  ${cat}: ${r.status}`); }
    catch (e) { console.log(`  ${cat}: err:${e.message}`); }
  }
}
main().catch((e) => { console.error('[articles] fatal:', e); process.exit(1); });
