// Kategoriye gore salinim + okuyucunun UMURSADIGI kategorilerden ornek sec.
import { readFileSync, writeFileSync } from 'fs';

const env = Object.fromEntries(
  readFileSync('migration/.env', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).replace(/^﻿/, '').trim(), l.slice(i + 1).trim()]; }),
);
const B = env.POCKETBASE_URL.replace(/\/+$/, '');
const a = await (await fetch(`${B}/api/collections/_superusers/auth-with-password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
})).json();
const H = { Authorization: a.token };

const ortanca = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// snapshot'lari topla
const seri = new Map();
let sayfa = 1;
for (;;) {
  const r = await (await fetch(
    `${B}/api/collections/price_snapshots/records?perPage=500&page=${sayfa}`
    + `&filter=${encodeURIComponent('country="TR"')}&sort=checkedAt&fields=productId,price,checkedAt`,
    { headers: H },
  )).json();
  for (const x of r.items || []) {
    const f = Number(x.price);
    if (!(f > 0)) continue;
    if (!seri.has(x.productId)) seri.set(x.productId, []);
    seri.get(x.productId).push({ f, g: String(x.checkedAt || '').slice(0, 10) });
  }
  if (sayfa >= r.totalPages) break;
  sayfa += 1;
}

const olcum = [];
for (const [pid, k] of seri) {
  if (k.length < 3) continue;
  const gunler = [...new Set(k.map((x) => x.g))].sort();
  const ara = (new Date(gunler[gunler.length - 1]) - new Date(gunler[0])) / 86400000;
  if (ara < 30) continue;
  const fs = k.map((x) => x.f);
  const min = Math.min(...fs); const max = Math.max(...fs);
  if (!(min > 0) || max / min > 8) continue;
  olcum.push({ pid, min, max, fark: ((max - min) / max) * 100, nokta: k.length, ara: Math.round(ara) });
}

// kategori bilgisi icin urunleri toplu cek
const ILGI = ['smartphones', 'laptops', 'headphones', 'smartwatches', 'tablets', 'monitors', 'graphics_cards', 'tvs'];
const kat = {};
const ornekler = [];
const sirali = [...olcum].sort((x, y) => y.fark - x.fark);

for (const x of sirali) {
  if (ornekler.length >= 40 && Object.keys(kat).length > 20) break;
  let p;
  try {
    p = await (await fetch(`${B}/api/collections/products/records/${x.pid}?fields=name,brand,category,slug,imageUrl,techScore`, { headers: H })).json();
  } catch { continue; }
  if (!p.category) continue;
  (kat[p.category] ||= []).push(x.fark);
  if (ILGI.includes(p.category) && p.name && /^https?:/.test(p.imageUrl || '') && ornekler.length < 40) {
    ornekler.push({ ...x, ad: p.name, marka: p.brand, kategori: p.category, slug: p.slug, gorsel: p.imageUrl, puan: p.techScore, id: x.pid });
  }
  if (ornekler.length >= 40) break;
}

console.log('── ILGI CEKICI KATEGORILERDEN EN COK SALINANLAR ──');
ornekler.slice(0, 16).forEach((x) => console.log(
  `  %${x.fark.toFixed(0).padStart(3)} · ${String(Math.round(x.min)).padStart(6)} - ${String(Math.round(x.max)).padStart(6)} TL · ${x.kategori.padEnd(14)} ${String(x.ad).slice(0, 42)}`,
));

writeFileSync('scripts/.salinim_ornek.json', JSON.stringify({ ornekler }, null, 1));
console.log(`\n${ornekler.length} ornek -> scripts/.salinim_ornek.json`);
