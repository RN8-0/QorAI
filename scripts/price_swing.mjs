// Fiyat SALINIMI: bir urunun 2,5 ayda gordugu en dusuk ve en yuksek fiyat.
// "Bekleyeyim mi" sorusunun gercek yaniti burada — ortalama degil, SALINIM.
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

const seri = new Map();
let sayfa = 1;
for (;;) {
  const r = await (await fetch(
    `${B}/api/collections/price_snapshots/records?perPage=500&page=${sayfa}`
    + `&filter=${encodeURIComponent('country="TR"')}&sort=checkedAt&fields=productId,price,checkedAt,store`,
    { headers: H },
  )).json();
  for (const x of r.items || []) {
    const f = Number(x.price);
    if (!(f > 0)) continue;
    if (!seri.has(x.productId)) seri.set(x.productId, []);
    seri.get(x.productId).push({ f, g: String(x.checkedAt || '').slice(0, 10), m: x.store || '' });
  }
  if (sayfa >= r.totalPages) break;
  sayfa += 1;
}

const sonuc = [];
for (const [pid, kayitlar] of seri) {
  if (kayitlar.length < 3) continue;
  const gunler = [...new Set(kayitlar.map((k) => k.g))].sort();
  const araGun = (new Date(gunler[gunler.length - 1]) - new Date(gunler[0])) / 86400000;
  if (araGun < 30) continue;
  const fiyatlar = kayitlar.map((k) => k.f);
  const min = Math.min(...fiyatlar);
  const max = Math.max(...fiyatlar);
  if (!(min > 0)) continue;
  const kat = max / min;
  if (kat > 8) continue;          // veri hatasi olasi — disarida birak
  const fark = ((max - min) / max) * 100;   // en yuksekten alsan ne kadar fazla oderdin
  sonuc.push({ pid, min, max, kat, fark, nokta: kayitlar.length, araGun: Math.round(araGun) });
}

const esikler = [5, 10, 20, 30, 50];
console.log(`SALINIM — ${sonuc.length} urun (>=3 kayit, >=30 gun)\n`);
for (const e of esikler) {
  const n = sonuc.filter((x) => x.fark >= e).length;
  console.log(`  en dusuk ile en yuksek arasi >= %${String(e).padStart(2)} : ${String(n).padStart(5)} urun  (%${(n / sonuc.length * 100).toFixed(1)})`);
}
console.log(`\n  ORTANCA salinim: %${ortanca(sonuc.map((x) => x.fark)).toFixed(1)}`);
console.log(`  yani tipik bir urunde en kotu gun ile en iyi gun arasinda %${ortanca(sonuc.map((x) => x.fark)).toFixed(0)} fark var`);

// Ornekler: buyuk salinimli, ADI ve GORSELI olan, taninmis urunler
const adaylar = [...sonuc].sort((x, y) => y.fark - x.fark).slice(0, 60);
const secili = [];
for (const x of adaylar) {
  const p = await (await fetch(`${B}/api/collections/products/records/${x.pid}?fields=name,brand,category,slug,imageUrl,techScore`, { headers: H })).json();
  if (!p.name || !p.imageUrl || !/^https?:/.test(p.imageUrl)) continue;
  secili.push({ ...x, ad: p.name, marka: p.brand, kategori: p.category, slug: p.slug, gorsel: p.imageUrl, puan: p.techScore });
  if (secili.length >= 14) break;
}
console.log('\n── EN COK SALINAN (adi + gorseli olanlar) ──');
secili.forEach((x) => console.log(
  `  %${x.fark.toFixed(0).padStart(3)} fark · ${Math.round(x.min)} - ${Math.round(x.max)} TL · ${x.nokta} kayit/${x.araGun}g · ${String(x.ad).slice(0, 44)}`,
));

writeFileSync('scripts/.fiyat_salinimi.json', JSON.stringify({
  uretildi: new Date().toISOString(),
  toplam: sonuc.length,
  esikler: Object.fromEntries(esikler.map((e) => [e, sonuc.filter((x) => x.fark >= e).length])),
  ortancaSalinim: ortanca(sonuc.map((x) => x.fark)),
  ornekler: secili,
}, null, 1));
console.log('\nkanit: scripts/.fiyat_salinimi.json');
