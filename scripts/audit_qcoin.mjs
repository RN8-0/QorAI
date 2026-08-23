// ═══════════════════════════════════════════════════════════════════════════
//  Q COIN TEŞHİSİ
//
//  Soru: kayit olan kullanicilar neden hic Q Coin harcamiyor — hesapta hata
//  mi var, yoksa ozellikler gercekten kullanilmiyor mu?
//
//  Ikisi COK farkli sorun: birincisi kod hatasi, ikincisi urun/dagitim sorunu.
//  Ayirmanin tek yolu LEDGER'a bakmak — bakiye tek basina hangi harcamanin
//  DENENDIGINI soylemiyor.
//
//  KOSTUR:  node scripts/audit_qcoin.mjs
// ═══════════════════════════════════════════════════════════════════════════
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

const al = async (yol) => {
  const r = await fetch(`${B}${yol}`, { headers: H });
  if (!r.ok) return { hata: r.status, items: [], totalItems: 0 };
  return r.json();
};

// ── 1) Kullanici bakiyeleri ──────────────────────────────────────────────
const u = await al('/api/collections/users/records?perPage=500&fields=id,email,bonusQCoins,isPremium,created,quizCompleted');
const kul = u.items || [];
// Gercek alan `bonusQCoins` — `qorCoins` diye bir alan YOK, sorgu 0 donduruyordu.
const bakiye = (x) => Number(x.bonusQCoins ?? 0);
const dagilim = {};
kul.forEach((x) => { const b = bakiye(x); dagilim[b] = (dagilim[b] || 0) + 1; });

console.log(`KULLANICI: ${u.totalItems}`);
console.log('  bakiye dagilimi:', JSON.stringify(dagilim));
console.log(`  premium: ${kul.filter((x) => x.isPremium).length} · quiz tamamlayan: ${kul.filter((x) => x.quizCompleted).length}`);

// ── 2) Ledger — harcama DENENDI mi? ──────────────────────────────────────
const t = await al('/api/collections/qcoin_transactions/records?perPage=500&sort=-created');
if (t.hata) {
  console.log(`\nLEDGER: okunamadi (HTTP ${t.hata}) — koleksiyon yok ya da kapali`);
} else {
  const tx = t.items || [];
  console.log(`\nLEDGER: ${t.totalItems} kayit`);
  const turler = {};
  let harcanan = 0;
  let verilen = 0;
  tx.forEach((x) => {
    const k = String(x.type || x.reason || '?');
    turler[k] = (turler[k] || 0) + 1;
    const m = Number(x.amount ?? 0);
    if (m < 0) harcanan += -m; else verilen += m;
  });
  console.log('  islem turleri:', JSON.stringify(turler));
  console.log(`  toplam verilen: ${verilen} Q · toplam harcanan: ${harcanan} Q`);
  // KRITIK AYRIM: sistem bozuk mu, yoksa kimse KULLANMIYOR mu?
  const harcayan = new Set(tx.filter((x) => (x.type || x.reason) === 'spend').map((x) => x.userId));
  const kaynak = {};
  const ozellik = {};
  tx.filter((x) => (x.type || x.reason) === 'spend').forEach((x) => {
    kaynak[x.source || '?'] = (kaynak[x.source || '?'] || 0) + 1;
    ozellik[x.feature || '?'] = (ozellik[x.feature || '?'] || 0) + 1;
  });
  console.log(`  HARCAMA YAPAN FARKLI KULLANICI: ${harcayan.size} / ${kul.length}`);
  console.log('  kaynak (web/app):', JSON.stringify(kaynak));
  console.log('  ozellik:', JSON.stringify(ozellik));
  if (tx.length) {
    console.log('  son 3 islem:');
    tx.slice(0, 3).forEach((x) => console.log(`    ${x.created?.slice(0, 16)} ${JSON.stringify({ amount: x.amount ?? x.delta, reason: x.reason || x.type })}`));
  }
}

// ── 3) AI gercekten kullanildi mi? Analiz gecmisi ────────────────────────
for (const [ad, yol] of [
  ['saved_analyses', '/api/collections/saved_analyses/records?perPage=1'],
  ['recently_viewed', '/api/collections/recently_viewed/records?perPage=1'],
]) {
  const r = await al(yol);
  console.log(`\n${ad}: ${r.hata ? `okunamadi (${r.hata})` : `${r.totalItems} kayit`}`);
}
