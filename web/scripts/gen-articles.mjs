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
async function tsTop(cat, n = 8) {
  const qs = new URLSearchParams({ q: '*', query_by: 'name', filter_by: `category:=${cat}`, sort_by: 'techScore:desc', per_page: '40', include_fields: 'id,name,slug,brand,techScore,imageUrl' });
  const r = await (await fetch(`${TS_URL}/collections/products/documents/search?${qs}`, { headers: { 'X-TYPESENSE-API-KEY': TS_KEY } })).json();
  const seen = new Set(); const out = [];
  for (const h of (r.hits || [])) {
    const d = h.document;
    if (!d?.id || !d?.name) continue;
    if (!/^https?:\/\//i.test(d.imageUrl || '')) continue;
    const k = modelKey(d.name); if (k && seen.has(k)) continue; if (k) seen.add(k);
    out.push({ id: d.id, name: d.name, slug: slugifyProduct(d.slug || d.name), brand: d.brand || '', techScore: d.techScore || 0, imageUrl: d.imageUrl });
    if (out.length >= n) break;
  }
  return out;
}

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

function sys(lang) {
  return [
    `You are an experienced tech editor writing a product buying guide in ${LANG_NAME[lang]} for a tech comparison site.`,
    'Write fluent, natural, genuinely helpful prose — like a human editor, NOT an AI.',
    'RULES: never mention AI, model names, or clichés ("in conclusion", "in summary"). Do NOT invent prices (use value/segment terms). Give concrete advice. Reference the given real models naturally, explaining why each stands out. Output ONLY valid JSON.',
  ].join('\n');
}
function userMsg(lang, label, picks) {
  const list = picks.map((p) => `- ${p.name}${p.brand ? ` (${p.brand})` : ''} — score ${p.techScore}/100`).join('\n');
  return [
    `Topic: best ${label} (2026 buying guide). Language: ${LANG_NAME[lang]}.`,
    `Real standout models:\n${list}`,
    'Return JSON:',
    '{',
    '  "title": "<SEO title, intent: best <category> 2026, <=65 chars>",',
    '  "lead": "<2-sentence intro>",',
    '  "body": "<HTML: an intro <p>, then one <h2> per top model with a <p> mini-take explaining strengths/who it suits, then an <h2> with a <ul> of buying tips. Use only <h2>,<h3>,<p>,<ul>,<li>,<strong>. No images, no links, no prices.>"',
    '}',
    `Everything in ${LANG_NAME[lang]}.`,
  ].join('\n');
}

async function genOne(cat, existing) {
  const label = categoryLabel(cat, 'tr');
  if (!FORCE && existing) {
    const ageDays = (Date.now() - Date.parse(existing.updated || 0)) / 86400000;
    if (ageDays < MAX_AGE_DAYS) return { cat, status: 'skip' };
  }
  const picks = await tsTop(cat);
  if (picks.length < 3) return { cat, status: 'too-few' };
  const rec = { slug: cat, status: 'published', category: cat, cover: picks[0].imageUrl, products: picks.map((p) => ({ id: p.id, slug: p.slug, name: p.name, brand: p.brand, techScore: p.techScore, imageUrl: p.imageUrl })) };
  for (const lang of LANGS) {
    const out = await deepseek(sys(lang), userMsg(lang, categoryLabel(cat, lang), picks));
    rec[`title_${lang}`] = String(out.title || '').trim().slice(0, 90);
    rec[`lead_${lang}`] = String(out.lead || '').trim();
    rec[`body_${lang}`] = String(out.body || '').trim();
  }
  if (!rec.title_tr || !rec.body_tr) return { cat, status: 'thin' };
  if (existing) { const r = await pb('PATCH', `/api/collections/articles/records/${existing.id}`, rec); return { cat, status: r.status < 300 ? 'updated' : `err:${r.status}` }; }
  const r = await pb('POST', '/api/collections/articles/records', rec);
  return { cat, status: r.status < 300 ? 'created' : `err:${r.status}:${JSON.stringify(r.body).slice(0, 200)}` };
}

async function main() {
  await pbAuth();
  const existRes = await pb('GET', '/api/collections/articles/records?perPage=200&fields=id,slug,updated');
  const existing = new Map((existRes.body.items || []).map((x) => [x.slug, x]));
  let cats = ONLY.length ? ONLY : await tsCategories();
  console.log(`[articles] ${cats.length} categories; ${existing.size} existing`);
  for (const cat of cats) {
    try { const r = await genOne(cat, existing.get(cat)); console.log(`  ${cat}: ${r.status}`); }
    catch (e) { console.log(`  ${cat}: err:${e.message}`); }
  }
}
main().catch((e) => { console.error('[articles] fatal:', e); process.exit(1); });
