// ═══════════════════════════════════════════════════════════════════════════
//  YAYINLANAN ANALIZ DENETIMI
//
//  Elle bakmak olceklenmiyor: her kayit iki dil, her dil ~10 bolum. Bu betik
//  bugune kadar GERCEKTEN yasanmis hata siniflarini tarar — hepsi bir kez
//  canliya cikti:
//
//   · dil sizintisi     — Ingilizce raporda Turkce cumle (ya da tersi)
//   · tekrar            — ayni olgu birden fazla bolumde (bkz. reportDedupe)
//   · bos zorunlu bolum — kunye / kronik sorunlar / sevilenler
//   · meta uzunlugu     — title > 60, description 140-155 disi
//   · yinelenen meta    — ayni dilde iki analiz ayni <title>
//   · dil/rapor uyumu   — raporu olmayan dilde meta yazilmis
//
//  KOSTUR:  node scripts/audit_analyses.mjs
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from 'fs';
import { analysisKind, analysisQuiz, analysisRenderLangs } from '../web/src/lib/analysisRecord.js';
import { dropRestated } from '../web/src/lib/reportDedupe.js';

const env = Object.fromEntries(
  readFileSync('migration/.env', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).replace(/^﻿/, '').trim(), l.slice(i + 1).trim()]; }),
);
const B = env.POCKETBASE_URL.replace(/\/+$/, '');

const TR_HARF = /[çğıöşüÇĞİÖŞÜ]/;
// Diakritiksiz Turkce de yakalanmali ("bir sey daha" gibi)
const TR_KELIME = /\b(ve|ile|için|bir|bu|daha|olarak|ancak|ayrıca|kullanıcı|özellik|sunar|sağlar)\b/i;
const EN_KELIME = /\b(the|and|with|for|this|that|from|which|however|users|feature|provides|offers)\b/i;

const dil = (t) => {
  const s = String(t || '');
  if (!s.trim()) return null;
  const tr = TR_HARF.test(s) || TR_KELIME.test(s);
  const en = EN_KELIME.test(s);
  if (tr && !en) return 'tr';
  if (en && !tr) return 'en';
  return null; // karisik ya da belirsiz — yargilamiyoruz
};

function metinleriTopla(rep) {
  const out = [];
  const gez = (v) => {
    if (typeof v === 'string') { if (v.length > 40) out.push(v); return; }
    if (Array.isArray(v)) { v.forEach(gez); return; }
    if (v && typeof v === 'object') Object.values(v).forEach(gez);
  };
  gez(rep);
  return out;
}

function listeleriTopla(rep) {
  const p = rep.product || (rep.services || [])[0] || rep;
  const c = rep.community || p || {};
  return [
    ['strengths', p.strengths || p.pros],
    ['weaknesses', p.weaknesses || p.cons],
    ['criticalPoints', p.criticalPoints],
    ['reliabilityNotes', p.reliabilityNotes],
    ['lovedFeatures', c.lovedFeatures],
    ['chronicIssues', c.chronicIssues],
  ].filter(([, v]) => Array.isArray(v) && v.length);
}

const bulgular = [];
const ekle = (slug, l, tur, mesaj) => bulgular.push({ slug, l, tur, mesaj });

const a = await (await fetch(`${B}/api/collections/_superusers/auth-with-password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
})).json();
const r = await (await fetch(`${B}/api/collections/analyses/records?perPage=200`, {
  headers: { Authorization: a.token },
})).json();

const metaGoruldu = { tr: new Map(), en: new Map() };
let kayitSayisi = 0;

for (const it of r.items) {
  if (it.status !== 'published') continue;
  kayitSayisi += 1;
  const diller = analysisRenderLangs(it, 'en');
  const kind = analysisKind(it);

  for (const L of ['tr', 'en']) {
    const ham = it[`report_${L}`];
    const rep = ham ? (typeof ham === 'string' ? JSON.parse(ham) : ham) : null;

    // raporu olmayan dilde meta yazili mi
    if (!rep && (it[`metaTitle_${L}`] || it[`title_${L}`])) {
      ekle(it.slug, L, 'dil/rapor', 'raporu YOK ama meta yazili — sayfa uretilmez, meta olu');
    }
    if (!rep) continue;

    // 1) dil sizintisi
    const metinler = metinleriTopla(rep);
    const yanlis = metinler.filter((t) => { const d = dil(t); return d && d !== L; });
    if (yanlis.length) {
      ekle(it.slug, L, 'dil sizintisi',
        `${yanlis.length}/${metinler.length} metin ${L === 'tr' ? 'Ingilizce' : 'Turkce'}: "${yanlis[0].slice(0, 70)}…"`);
    }

    // 2) bolumler arasi tekrar
    const gorulen = [];
    for (const [ad, liste] of listeleriTopla(rep)) {
      const kalan = dropRestated(liste, gorulen);
      const dusen = liste.length - kalan.length;
      if (dusen) ekle(it.slug, L, 'tekrar', `${ad}: ${dusen}/${liste.length} madde onceki bolumde de var`);
    }

    // 3) bos zorunlu bolumler
    if (!analysisQuiz(it, L).length) ekle(it.slug, L, 'bos bolum', 'quiz kunyesi YOK');
    const c = rep.community || (rep.services || [])[0] || rep;
    if (!(c.chronicIssues || []).length) ekle(it.slug, L, 'bos bolum', 'kronik sorunlar YOK');
    if (!(c.lovedFeatures || []).length) ekle(it.slug, L, 'bos bolum', 'sevilen ozellikler YOK');

    // 4) meta uzunlugu
    const mt = String(it[`metaTitle_${L}`] || '');
    const md = String(it[`metaDescription_${L}`] || '');
    if (mt.length > 60) ekle(it.slug, L, 'meta', `metaTitle ${mt.length} karakter (>60)`);
    if (md && (md.length < 140 || md.length > 158)) ekle(it.slug, L, 'meta', `metaDescription ${md.length} karakter (140-155 bekleniyor)`);

    // 5) ayni dilde yinelenen meta
    if (diller.includes(L)) {
      for (const [alan, deger] of [['metaTitle', mt], ['metaDescription', md]]) {
        if (!deger) continue;
        const anahtar = `${alan}:${deger.toLowerCase()}`;
        const onceki = metaGoruldu[L].get(anahtar);
        if (onceki) ekle(it.slug, L, 'yinelenen meta', `${alan} "${onceki}" ile ayni`);
        else metaGoruldu[L].set(anahtar, it.slug);
      }
    }
  }
}

console.log(`denetlenen yayindaki kayit: ${kayitSayisi}\n`);
if (!bulgular.length) {
  console.log('bulgu yok — hepsi temiz.');
} else {
  const turler = [...new Set(bulgular.map((b) => b.tur))];
  for (const t of turler) {
    const grup = bulgular.filter((b) => b.tur === t);
    console.log(`── ${t} (${grup.length})`);
    grup.forEach((b) => console.log(`   ${b.slug} [${b.l}] ${b.mesaj}`));
    console.log('');
  }
}
