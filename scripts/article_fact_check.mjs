// Makaledeki HER somut iddiayi veriye karsi dogrular. Gecmeyen iddia yazilmaz.
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

const urunler = JSON.parse(readFileSync('scripts/.makale_urunler.json', 'utf8'));

for (const u of urunler) {
  const h = await (await fetch(
    `${B}/api/collections/price_snapshots/records?perPage=200`
    + `&filter=${encodeURIComponent(`productId="${u.id}" && country="TR"`)}`
    + `&sort=checkedAt&fields=price,checkedAt,store`,
    { headers: H },
  )).json();
  const rows = (h.items || []).filter((r) => Number(r.price) > 0);
  if (!rows.length) { console.log(`${u.ad}: KAYIT YOK`); continue; }
  const enAz = rows.reduce((m, r) => (Number(r.price) < Number(m.price) ? r : m));
  const enCok = rows.reduce((m, r) => (Number(r.price) > Number(m.price) ? r : m));
  const magazalar = [...new Set(rows.map((r) => r.store || '?'))];
  console.log(`\n${String(u.ad).slice(0, 50)}`);
  console.log(`  en dusuk : ${Math.round(enAz.price)} TL · ${enAz.checkedAt?.slice(0, 10)} · ${enAz.store || '?'}`);
  console.log(`  en yuksek: ${Math.round(enCok.price)} TL · ${enCok.checkedAt?.slice(0, 10)} · ${enCok.store || '?'}`);
  console.log(`  kayit ${rows.length} · magaza ${magazalar.length} (${magazalar.slice(0, 3).join(', ')})`);
  console.log(`  AYNI MAGAZA MI: ${(enAz.store || '?') === (enCok.store || '?') ? 'EVET' : 'HAYIR — iddia duzeltilmeli'}`);
  const gun = Math.abs(new Date(enCok.checkedAt) - new Date(enAz.checkedAt)) / 86400000;
  console.log(`  iki uc arasi: ${Math.round(gun)} gun`);
}
