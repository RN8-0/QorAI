// Uc degerler GERCEK mi yoksa magaza/varyant karisikligi mi — makalede
// kullanmadan once tek tek bak. Uydurma sayi yazmamak icin sart.
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

const kanit = JSON.parse(readFileSync('scripts/.fiyat_egilimi.json', 'utf8'));
const bak = [...kanit.enCok.slice(0, 4), ...kanit.enAz.slice(0, 4)];

for (const x of bak) {
  const h = await (await fetch(
    `${B}/api/collections/price_snapshots/records?perPage=100&filter=${encodeURIComponent(`productId="${x.pid}" && country="TR"`)}`
    + `&sort=checkedAt&fields=price,checkedAt,store,source,availability`,
    { headers: H },
  )).json();
  const rows = (h.items || []).filter((r) => Number(r.price) > 0);
  const magazalar = [...new Set(rows.map((r) => r.store || r.source || '?'))];
  console.log(`\n${String(x.ad || x.pid).slice(0, 52)}  (${x.yuzde > 0 ? '+' : ''}${x.yuzde.toFixed(1)}%)`);
  console.log(`  ${rows.length} kayit · ${magazalar.length} farkli magaza: ${magazalar.slice(0, 4).join(', ')}`);
  rows.slice(0, 3).concat(rows.slice(-2)).forEach((r) => {
    console.log(`    ${r.checkedAt?.slice(0, 10)}  ${String(Math.round(r.price)).padStart(7)} TL  ${(r.store || r.source || '?').slice(0, 22)}`);
  });
  // AYNI magazada da degisti mi?
  const grup = {};
  rows.forEach((r) => { (grup[r.store || r.source || '?'] ||= []).push(r); });
  const ayniMagaza = Object.entries(grup)
    .filter(([, v]) => v.length >= 2)
    .map(([m, v]) => {
      const i = Number(v[0].price); const s = Number(v[v.length - 1].price);
      return `${m.slice(0, 16)}: ${Math.round(i)}->${Math.round(s)} (${(((s - i) / i) * 100).toFixed(0)}%)`;
    });
  console.log(`  ayni magaza icinde: ${ayniMagaza.length ? ayniMagaza.slice(0, 3).join(' | ') : 'tek kayit, karsilastirilamaz'}`);
}
