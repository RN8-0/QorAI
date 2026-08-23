// Makaleyi TASLAK olarak PB'ye yazar. Yayina ALMAZ — status hep 'draft'.
// Yazmadan once meta uzunluklarini ve slug cakismasini denetler.
import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const M = require('./.makale_taslak.js');

const env = Object.fromEntries(
  readFileSync('migration/.env', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).replace(/^﻿/, '').trim(), l.slice(i + 1).trim()]; }),
);
const B = env.POCKETBASE_URL.replace(/\/+$/, '');

// ── Denetim ──────────────────────────────────────────────────────────────
const sorun = [];
const uzunluk = (ad, deger, alt, ust) => {
  const n = String(deger || '').length;
  const ok = n >= alt && n <= ust;
  console.log(`  ${ad.padEnd(22)} ${String(n).padStart(3)} ${ok ? 'ok' : `SINIR DISI (${alt}-${ust})`}`);
  if (!ok) sorun.push(`${ad}: ${n} karakter`);
};
console.log('meta denetimi:');
uzunluk('metaTitle_tr', M.metaTitle_tr, 20, 60);
uzunluk('metaTitle_en', M.metaTitle_en, 20, 60);
uzunluk('metaDescription_tr', M.metaDescription_tr, 140, 158);
uzunluk('metaDescription_en', M.metaDescription_en, 140, 158);
uzunluk('title_tr', M.title_tr, 20, 70);
uzunluk('title_en', M.title_en, 20, 70);
uzunluk('lead_tr', M.lead_tr, 60, 240);
uzunluk('lead_en', M.lead_en, 60, 240);

const kelime = (h) => String(h || '').replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length;
console.log(`\n  govde TR ${kelime(M.body_tr) + kelime(M.conclusion_tr)} kelime · EN ${kelime(M.body_en) + kelime(M.conclusion_en)} kelime`);
console.log(`  urun karti: ${M.products.length} · kapak: ${M.cover ? 'var' : 'YOK'}`);

const a = await (await fetch(`${B}/api/collections/_superusers/auth-with-password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
})).json();
const H = { Authorization: a.token, 'Content-Type': 'application/json' };

// slug cakismasi — `slug` alani PB'de BENZERSIZ indeksli
const v = await (await fetch(
  `${B}/api/collections/articles/records?perPage=1&filter=${encodeURIComponent(`slug="${M.slug}"`)}`,
  { headers: H },
)).json();
if (v.totalItems) {
  console.log(`\nAYNI SLUG VAR (${M.slug}) — mevcut kayit GUNCELLENECEK, yenisi acilmayacak.`);
}

if (sorun.length) {
  console.log(`\nDENETIM DUSTU: ${sorun.join(' · ')}`);
  process.exit(1);
}

// ── Yaz ──────────────────────────────────────────────────────────────────
const govde = {
  slug: M.slug, slug_tr: M.slug_tr, slug_en: M.slug_en,
  status: 'draft',                       // ← yayina ALINMIYOR
  category: M.category, author: M.author, cover: M.cover,
  title_tr: M.title_tr, title_en: M.title_en,
  lead_tr: M.lead_tr, lead_en: M.lead_en,
  body_tr: M.body_tr, body_en: M.body_en,
  conclusion_tr: M.conclusion_tr, conclusion_en: M.conclusion_en,
  metaTitle_tr: M.metaTitle_tr, metaDescription_tr: M.metaDescription_tr, tags_tr: M.tags_tr,
  metaTitle_en: M.metaTitle_en, metaDescription_en: M.metaDescription_en, tags_en: M.tags_en,
  products: M.products,
  views: 0, likes: 0,
};

const mevcut = v.items && v.items[0];
const r = await fetch(
  mevcut ? `${B}/api/collections/articles/records/${mevcut.id}` : `${B}/api/collections/articles/records`,
  { method: mevcut ? 'PATCH' : 'POST', headers: H, body: JSON.stringify(govde) },
);
const j = await r.json();
if (!r.ok) {
  console.log(`\nYAZILAMADI ${r.status}: ${JSON.stringify(j).slice(0, 400)}`);
  process.exit(1);
}
console.log(`\nTASLAK ${mevcut ? 'guncellendi' : 'olusturuldu'} · id=${j.id} · status=${j.status}`);
console.log(`onizleme: https://qorai.net/tr/blog/${j.slug_tr || j.slug}`);
