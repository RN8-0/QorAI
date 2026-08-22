#!/usr/bin/env node
/**
 * Qor AI — makale metinlerindeki başıboş kaynak adlarını temizler (2026-07-27)
 *
 * Neden: Claude'un ekranından kopyalanan metinde markdown linkler düz metne
 * dönüşüyor; panoya "[MacRumors](url)" değil sadece "MacRumors" geliyor. Bu
 * adlar öğe metinlerinde tek başına satır olarak kalıp yayınlanan yazıda
 * görünüyordu. Admin editöründeki "🤖 AI düzen & kontrol" artık bunu otomatik
 * yapıyor; bu script AYNI mantığı mevcut kayıtlara uygular.
 *
 *   node scripts/clean_article_sources.js <articleId>            (kuru çalışma)
 *   node scripts/clean_article_sources.js <articleId> --confirm  (yazar)
 *
 * Aday satırları KOD çıkarır, sınıflandırmayı AI yapar, silme yine kodda ve
 * yalnız aday listesinden olur → gerçek içerik kaybolamaz.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { req } = require('../migration/pb');

const ID = process.argv[2];
const CONFIRM = process.argv.includes('--confirm');
if (!ID || ID.startsWith('--')) {
  console.log('kullanim: node scripts/clean_article_sources.js <articleId> [--confirm]');
  process.exit(1);
}

const ENV = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', 'migration', '.env'), 'utf8')
    .split(/\r?\n/).filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const PB = ENV.POCKETBASE_URL.replace(/\/+$/, '');
// Almanca 2026-08-21'de urunden tamamen kaldirildi. Bu betikler PB'deki
// ortak sozluge YAZIYOR; listede 'de' kalirsa bir kez calistirmak Almancayi
// katalog hattina geri sokar.
const LANGS = ['tr', 'en'];

// admin/js/blog.js -> junkCandidates() ile AYNI kurallar
function collectCandidates(article) {
  const seen = new Set();
  const scan = (txt) => {
    for (const raw of String(txt || '').split(/\r?\n/)) {
      const t = raw.trim();
      if (!t || t.length > 60) continue;
      if (/[.!?:;,]$/.test(t)) continue;
      if (/^[-*•#>]/.test(t)) continue;
      if (/^\d+\s*[.)]/.test(t)) continue;
      if (t.split(/\s+/).length > 6) continue;
      if (/\*\*/.test(t)) continue;
      seen.add(t);
    }
  };
  for (const p of (article.products || [])) {
    for (const b of (p.blocks || [])) {
      if (b.t !== 'text') continue;
      LANGS.forEach(c => scan(b[c]));
    }
  }
  const toLines = (h) => String(h || '').replace(/<\/(p|li|h[1-6]|div)>/gi, '\n').replace(/<[^>]+>/g, '');
  LANGS.forEach(c => { scan(toLines(article['body_' + c])); scan(toLines(article['conclusion_' + c])); });
  return [...seen].slice(0, 120);
}

async function classify(cands) {
  const prompt = `Aşağıdaki liste, bir teknoloji blog yazısında TEK BAŞINA satır olarak duran kısa metinlerdir. Bir kısmı, yazı kopyalanırken kaynak bağlantılarından arta kalan YAYIN/SİTE/İNCELEME KANALI ADLARIDIR ve yazıya ait değildir; bir kısmı ise gerçek içeriktir (ara başlık, ürün adı, teknik terim).

HER SATIRI TEK TEK sınıflandır. Atlama, hepsi için karar ver.

SADECE şu JSON: {"junk":["<yayın/kaynak adı olanlar>"],"keep":["<gerçek içerik olanlar>"]}

SATIRLAR:
${JSON.stringify(cands)}`;
  const res = await fetch(PB + '/api/ai/gemini', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 4000, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  const d = await res.json();
  if (!res.ok || d.error) throw new Error('AI: ' + JSON.stringify(d).slice(0, 200));
  const txt = (((d.candidates || [])[0] || {}).content || {}).parts.map(p => p.text || '').join('');
  const out = JSON.parse(txt);
  const allowed = new Set(cands.map(s => s.toLowerCase()));
  return (out.junk || []).map(s => String(s || '').trim()).filter(s => allowed.has(s.toLowerCase()));
}

(async () => {
  const r = await req('GET', `/api/collections/articles/records/${ID}`);
  if (r.status !== 200) throw new Error('makale bulunamadi: ' + r.status);
  const a = r.body;
  console.log(`makale: ${a.title_tr || a.slug} (${a.status})`);

  const cands = collectCandidates(a);
  console.log(`aday satir: ${cands.length}`);
  if (!cands.length) { console.log('temizlenecek bir sey yok.'); return; }
  const junk = await classify(cands);
  console.log(`kaynak adi olarak siniflandirilan (${junk.length}): ${junk.join(', ') || '-'}`);
  const keep = cands.filter(c => !junk.includes(c));
  console.log(`korunan (${keep.length}): ${keep.join(', ') || '-'}`);
  if (!junk.length) return;

  const junkSet = new Set(junk.map(s => s.toLowerCase()));
  let removed = 0;
  const clean = (txt) => String(txt || '').split(/\r?\n/)
    .filter(line => { if (junkSet.has(line.trim().toLowerCase())) { removed++; return false; } return true; })
    .join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const cleanHtml = (html) => String(html || '').replace(/<p>([\s\S]*?)<\/p>/gi, (m0, inner) => {
    const plain = inner.replace(/<[^>]+>/g, '').trim();
    if (junkSet.has(plain.toLowerCase())) { removed++; return ''; }
    return m0;
  });

  const products = (a.products || []).map(p => ({
    ...p,
    blocks: (p.blocks || []).map(b => (b.t === 'text'
      ? { ...b, ...Object.fromEntries(LANGS.filter(c => b[c]).map(c => [c, clean(b[c])])) }
      : b)),
  }));
  const patch = { products };
  LANGS.forEach(c => {
    if (a['body_' + c]) patch['body_' + c] = cleanHtml(a['body_' + c]);
    if (a['conclusion_' + c]) patch['conclusion_' + c] = cleanHtml(a['conclusion_' + c]);
  });

  console.log(`silinecek satir: ${removed}`);
  if (!CONFIRM) { console.log('KURU CALISMA — yazmak icin --confirm ekle'); return; }
  const up = await req('PATCH', `/api/collections/articles/records/${ID}`, patch);
  if (up.status !== 200) throw new Error('yazilamadi: ' + JSON.stringify(up.body).slice(0, 300));
  console.log('TEMIZLENDI ve kaydedildi.');
})().catch(e => { console.log('✗ ' + e.message); process.exit(1); });
