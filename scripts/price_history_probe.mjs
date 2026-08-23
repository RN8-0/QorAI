// Fiyat gecmisi kesfi — makale icin GERCEK veri var mi, uydurmadan once bak.
import { readFileSync } from 'fs';

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

// 1) Zaman araligi
const ilk = await (await fetch(`${B}/api/collections/price_snapshots/records?perPage=1&sort=checkedAt`, { headers: H })).json();
const son = await (await fetch(`${B}/api/collections/price_snapshots/records?perPage=1&sort=-checkedAt`, { headers: H })).json();
console.log(`snapshot araligi: ${ilk.items[0]?.checkedAt?.slice(0, 10)} -> ${son.items[0]?.checkedAt?.slice(0, 10)}`);

// 2) TR'de en cok snapshot'i olan urunler
const tr = await (await fetch(`${B}/api/collections/price_snapshots/records?perPage=500&filter=${encodeURIComponent('country="TR"')}&sort=-checkedAt&fields=productId,price,currency,checkedAt`, { headers: H })).json();
console.log(`TR snapshot (son 500): ${tr.totalItems} toplam`);
const sayim = {};
(tr.items || []).forEach((x) => { sayim[x.productId] = (sayim[x.productId] || 0) + 1; });
const enCok = Object.entries(sayim).sort((x, y) => y[1] - x[1]).slice(0, 8);

console.log('\nen cok fiyat kaydi olan urunler:');
for (const [pid, n] of enCok) {
  const p = await (await fetch(`${B}/api/collections/products/records/${pid}?fields=name,brand,category`, { headers: H })).json();
  // o urunun TUM TR gecmisi
  const h = await (await fetch(`${B}/api/collections/price_snapshots/records?perPage=200&filter=${encodeURIComponent(`productId="${pid}" && country="TR"`)}&sort=checkedAt&fields=price,checkedAt,currency`, { headers: H })).json();
  const noktalar = (h.items || []).filter((x) => Number(x.price) > 0);
  if (noktalar.length < 2) continue;
  const ilkF = Number(noktalar[0].price);
  const sonF = Number(noktalar[noktalar.length - 1].price);
  const fark = ((sonF - ilkF) / ilkF) * 100;
  console.log(`  ${String(p.name || pid).slice(0, 46).padEnd(48)} ${noktalar.length} kayit · `
    + `${noktalar[0].checkedAt?.slice(0, 10)} ${Math.round(ilkF)} -> ${noktalar[noktalar.length - 1].checkedAt?.slice(0, 10)} ${Math.round(sonF)} ${noktalar[0].currency} `
    + `(${fark > 0 ? '+' : ''}${fark.toFixed(1)}%)`);
}
