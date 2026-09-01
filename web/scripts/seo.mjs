// ═══════════════════════════════════════════════════════════════
//  SEO build step — runs after vite build + postbuild.
//
//  Coolify serves website/ as plain static files with no SSR, so
//  non-JS crawlers (Facebook, WhatsApp, X, LinkedIn) only ever see
//  the raw HTML <head>. This script bakes per-page <title>, meta
//  description, canonical, Open Graph / Twitter cards and JSON-LD
//  into a real HTML file for every route, then emits sitemap.xml + robots.txt.
//
//  Googlebot still renders the SPA and picks up the same tags from
//  the runtime useSeo() hook — this guarantees parity for the rest.
// ═══════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, rmSync, readdirSync } from 'fs';
// UI metinleri TEK KAYNAKTAN: kabuga gomulen hero yazilari SPA ile birebir ayni olmali.
import { STRINGS } from '../src/i18n/strings.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { categoryLabel, amazonGoPath } from '../src/lib/format.js';
import { META as LEGAL_META, COPY as LEGAL_COPY } from '../src/lib/legalContent.js';
// Analiz kaydini okuma kurallari (tur, dile gore rapor, baslik/ozet/meta) TEK
// KAYNAKTA: sayfayi cizen React bileseni (pages/AnalysisPost.jsx) ve buradaki
// on-render AYNI fonksiyonlari cagirmak zorunda, yoksa crawler'in gordugu
// baslik ile kullanicinin gordugu baslik ayrisir.
import {
  analysisFaq, analysisKind, analysisLead, analysisMetaDescription,
  analysisMetaTitle, analysisQuiz, analysisRenderLangs, analysisReport, analysisSubject,
  analysisSubjectNames, analysisTitle, analysisUnified,
} from '../src/lib/analysisRecord.js';
// Tekrar agi: ON-RENDER ile SITE ayni modulu kosar (bkz. reportDedupe.js).
import { dropRestated } from '../src/lib/reportDedupe.js';
// Urun adi temizligi TEK KAYNAK (admin/js/qor_ai_prompts.js). Web istemcisi de
// ayni fonksiyonu cagiriyor; on-render ile SPA ayni adi gostermek zorunda.
import { cleanProductName } from '../src/lib/productNames.js';
// Puan kalibrasyonu + segment kunyesi TEK KAYNAK: sitede de ayni
// fonksiyonlar kosuyor (lib/reportAdapters.js). Ayrisirsa crawler'in
// gordugu puan ile okuyucunun gordugu puan farkli olur.
import { calibratedScore, scoreBasisNote } from '../src/lib/aiPrompts.js';
// Faktor tablosunun satir kumesi TEK KAYNAK: site (AiCharts -> HeatMatrix)
// ve on-render AYNI moduldeki kumelemeyi kosar. Ayrisirsa crawler'in
// gordugu tablo ile okuyucunun gordugu tablo farkli olur; ustelik eski
// kayitlarda 'olculmedi' hucresi 0 puan gibi okunuyordu (bkz. factorRows.js).
import { factorColumnAverages, factorColumnWins, factorMatrixRows } from '../src/lib/factorRows.js';
import { loadAdminSandbox } from '../../scripts/_spec_sandbox.mjs';

const SITE = 'https://qorai.net';
const here = dirname(fileURLToPath(import.meta.url));
const site = join(here, '..', '..', 'website');
const templatePath = join(site, 'index.html');

// ── Spec çevirisi: TEK KAYNAK (admin/js/spec_i18n.js) ────────────────────
//
// NEDEN: ön-render 2026-08-21'e kadar `_raw.keySpecs`i OLDUĞU GİBİ basıyordu.
// O alan yarım makine çevirisi taşıyor ("Otomatik Charging", "Islak Mop: Yes"),
// dolayısıyla İngilizce sayfaya Türkçe etiket, Türkçe sayfaya İngilizce etiket
// sızıyordu. Ölçüldü (2026-08-21, tüm ağaç): EN açıklamaların %64,2'sinde
// Türkçe spec etiketi, TR'lerin %30,0'ında İngilizce vardı.
//
// Admin paneli ve site bu sorunu ÇOKTAN çözmüştü: ikisi de aynı dosyayı
// (admin/js/spec_i18n.js) çalıştırıyor, o dosya temiz kaynağı
// (`multiLangSections.tr`) seçip küratörlü sözlükle çeviriyor. Ön-render
// üçüncü tüketiciydi ve tek başına kirli alanı okuyordu. Çözüm yeni bir sözlük
// yazmak DEĞİL, aynı dosyayı burada da koşturmak — ikinci kopya kaçınılmaz
// olarak ayrışır.
const specSandbox = loadAdminSandbox([join(here, '..', '..', 'admin', 'js', 'spec_i18n.js')]);
const SPEC_I18N = specSandbox.QorAiSpecI18n;
if (!SPEC_I18N || typeof SPEC_I18N.localizeProduct !== 'function') {
  // Sessizce kirli veriye düşmektense build'i durdur: sızıntı gözle
  // görülmüyor, aylarca yayında kalıyor.
  throw new Error('[seo] admin/js/spec_i18n.js yüklenemedi — spec çevirisi tek kaynaktan gelmek zorunda');
}

// ── Typesense (read-only search key — same as web/src/lib/typesense.js) ──
const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const TS_KEY = 'BFc7h2MZhq5yct2GxzkClzQtzzCglKIb';
const TS_COLLECTION = 'products';

const DEFAULT_IMG = `${SITE}/assets/qor_logo_512.png?v=20260605a`;

// IndexNow key — lets Bing / Yandex / DuckDuckGo / Copilot crawl new & changed
// URLs within hours instead of waiting weeks. The key is proven by hosting
// <key>.txt at the site root; the scheduled refresh then POSTs changed URLs to
// the IndexNow API (see web/scripts/indexnow.mjs).
const INDEXNOW_KEY = '2c03809d550d2c5ae87a65ed1f0fcd1e';
const PB_URL = 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';

// Published blog articles (public read — listRule is status="published"). Drives
// the prerendered /blog listing + /blog/<slug> article pages.
// Yayinlanmis URUN ANALIZLERI (public read — listRule status="published").
// /analiz listesi + /analiz/<slug> sayfalarini besler.
//
// NEDEN AYRI BIR BOLUM: spec tablosu ve fiyat Epey'den geliyor ve onlarca Turk
// sitesinde birebir ayni duruyor; Google'in spec icin bizi tercih etmesi icin
// sebep yok. Analiz BASKA HICBIR YERDE YOK — sitenin siralamada yaslanabilecegi
// tek ozgun varlik bu.
//
// TASLAKLAR GELMEZ: listRule yalniz yayinda olanlari donduruyor, yani admin
// panelinden onaylanmamis hicbir metin ne sitemap'e ne de dizine girer.
async function fetchAnalyses() {
  try {
    const r = await fetch(`${PB_URL}/api/collections/analyses/records?filter=${encodeURIComponent('status="published"')}&sort=-publishedAt&perPage=200`);
    if (!r.ok) return [];
    return ((await r.json()).items) || [];
  } catch (_) { return []; }
}

async function fetchArticles() {
  try {
    const r = await fetch(`${PB_URL}/api/collections/articles/records?filter=${encodeURIComponent('status="published"')}&sort=-updated&perPage=200`);
    if (!r.ok) return [];
    return ((await r.json()).items) || [];
  } catch (_) { return []; }
}

// LIVE prices for blog products, keyed by id → the product's per-country `prices`
// rollup (public read). Blog prices must NOT be baked into the article at write
// time (they'd freeze the day it was generated); we look them up here so every
// nightly prerender — which runs AFTER the 03:10 price cron — shows the current
// Amazon price. The SPA does the same lookup live (BlogPost.jsx).
async function fetchBlogPrices(ids) {
  const byId = new Map();
  const uniq = [...new Set((ids || []).filter(Boolean))];
  const BATCH = 40;
  for (let i = 0; i < uniq.length; i += BATCH) {
    const slice = uniq.slice(i, i + BATCH);
    const filter = slice.map((id) => `id="${id}"`).join(' || ');
    try {
      const r = await fetch(`${PB_URL}/api/collections/products/records?perPage=${slice.length}&fields=id,prices,lowestPrice,lowestPriceCurrency&filter=${encodeURIComponent(filter)}`);
      if (!r.ok) continue;
      const j = await r.json();
      for (const it of (j.items || [])) byId.set(it.id, it);
    } catch (_) {}
  }
  return byId;
}

const PRICE_CURRENCY = { TR: 'TRY', DE: 'EUR', AT: 'EUR', GB: 'GBP', UK: 'GBP', US: 'USD' };
const PRICE_LOCALE = { TR: 'tr-TR', DE: 'de-DE', AT: 'de-DE', GB: 'en-GB', UK: 'en-GB', US: 'en-US' };
function fmtMoney(amount, country = 'TR') {
  const cc = String(country || 'TR').toUpperCase();
  const currency = PRICE_CURRENCY[cc] || 'USD';
  try {
    return new Intl.NumberFormat(PRICE_LOCALE[cc] || 'en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch { return `${Math.round(amount)} ${currency}`; }
}
// Current price for a product record in the given country (TR for the TR blog).
function livePriceFor(rec, country = 'TR') {
  if (!rec) return '';
  const cc = String(country || 'TR').toUpperCase();
  const amt = Number(rec.prices && rec.prices[cc]) || 0;
  if (amt > 0) return fmtMoney(amt, cc);
  // fallback: the rollup's cheapest offer, only if it's already in this currency
  if (Number(rec.lowestPrice) > 0 && rec.lowestPriceCurrency === (PRICE_CURRENCY[cc] || '')) {
    return fmtMoney(Number(rec.lowestPrice), cc);
  }
  return '';
}

// Sayfanın dili → o dilin pazarı.
//
// SIKI ÜLKE FİYATI KURALI: sayfanın kendi ülkesinin fiyatı yoksa fiyat
// GÖSTERİLMEZ; başka ülkenin fiyatına düşülmez. Aynı kural app ve sitenin
// çalışma zamanında da geçerli — ön-render ondan ayrılamaz, yoksa Google'a
// ziyaretçinin gördüğünden başka bir fiyat göstermiş oluruz.
//
// Kapsam ölçüldü (2026-08-21, Typesense): priceTR 32.264 · priceDE 1.105 ·
// priceUS 242. Yani fiyat pratikte TR'ye ait; EN/DE sayfalarının çoğu fiyatsız
// kalacak ve BAŞLIKLARINDA da fiyat vaadi olmayacak (bkz. productSeo).
const LANG_COUNTRY = { tr: 'TR', en: 'US' };
function priceForLang(prices, lang) {
  if (!prices || typeof prices !== 'object') return null;
  const cc = LANG_COUNTRY[lang] || 'US';
  const ham = Number(prices[cc]) || 0;
  if (ham <= 0) return null;
  // ŞEMADAKİ FİYAT = EKRANDAKİ FİYAT. fmtMoney kuruşu göstermiyor
  // (maximumFractionDigits: 0), dolayısıyla Offer'a ham değeri koymak
  // "1673.07 yazdım ama ₺1.673 gösterdim" uyumsuzluğu üretiyordu; Google
  // yapısal verinin görünen fiyatla eşleşmesini şart koşar. İkisi de aynı
  // yuvarlanmış sayıdan türetiliyor, böylece ayrışmaları imkânsız.
  const amount = Math.round(ham);
  if (amount <= 0) return null;
  return { amount, currency: PRICE_CURRENCY[cc] || 'USD', text: fmtMoney(amount, cc), country: cc };
}

// ── ANALIZ SAYFALARI (/analiz) ────────────────────────────────────────────
const ANALIZ_LISTE_TEXT = {
  en: {
    h1: 'AI Product Analyses',
    title: 'AI Product Analyses — Qor AI',
    desc: 'In-depth AI analyses of popular tech products: what the specs mean in daily use, strengths, weaknesses and who each product is actually for.',
    intro: 'Every analysis is the same report the product page produces — quiz answers, scores and all — reviewed before publishing.',
    all: '← All analyses',
    prod: 'View product page',
    faq: 'Frequently asked questions',
    // Rapor bloklarinin basliklari — ProductFullReport'un cizdigi bolumlerin
    // metin karsiligi (crawler React calistirmaz).
    h1Tek: 'AI Analysis',
    decision: 'Decision', match: 'Match', confidence: 'Confidence',
    detail: 'Detailed analysis', quiz: 'What your answers changed',
    strengths: 'Strengths', weaknesses: 'Weaknesses',
    critical: 'Things that change the decision', features: 'Feature by feature',
    community: 'What owners say', satisfaction: 'Satisfaction',
    alternatives: 'Smart alternatives', price: 'Price outlook',
    trend: 'Trend', buyWait: 'Buy or wait', bestTime: 'Best time to buy',
    who: 'Who is it for?', bestFor: 'Buy it if', notFor: 'Skip it if',
    verdict: 'Verdict',
    // Link ve abonelik analizleri ayni sayfada yayinlaniyor; onlarin bloklari
    // urun raporundaki karsiliklarindan FARKLI adlandirilir, yoksa okuyucu
    // hangi turu okudugunu anlamiyor.
    kindProduct: 'AI Analysis', kindLink: 'AI Link Analysis', kindSub: 'AI Subscription Analysis',
    kindCompare: 'AI Comparison',
    quizTop: 'Answers this analysis was built on',
    scoreBasis: 'How this score is calculated',
    loved: 'What owners keep praising', chronic: 'Chronic problems',
    chronicNone: 'The ownership search turned up no recurring failure for this model — no defect pattern, bad batch or firmware regression that owners keep reporting.',
    freqWidespread: 'widespread', freqCommon: 'common', freqOccasional: 'occasional',
    services: 'Services compared', winner: 'Best match', decisive: 'What actually decides it',
    fit: 'Overall fit', featuresSec: 'Features and content', ux: 'Experience',
    risk: 'Community and risk', plan: 'Your usage plan', reco: 'Recommendation',
    score: 'Score', pros: 'What works', cons: 'What does not',
    headToHead: 'Head to head', products: 'Products compared',
    h2hFor: 'In its favour:', h2hAgainst: 'Against it:',
    factorTable: 'Factor by factor', average: 'Average', leads: 'factors ahead',
    notMeasured: '“—” means that factor was not scored for that product — it is not a zero.',
  },
  tr: {
    h1: 'Yapay Zekâ Ürün Analizleri',
    title: 'Yapay Zekâ Ürün Analizleri — Qor AI',
    desc: 'Popüler teknoloji ürünlerinin derinlemesine yapay zekâ analizleri: özellikler günlük kullanımda ne anlama geliyor, güçlü ve zayıf yanları, kime uygun.',
    intro: 'Her analiz, ürün sayfasında çalışan raporun aynısıdır — quiz cevapları, skorlar, hepsi — ve yayınlanmadan önce gözden geçirilir.',
    all: '← Tüm analizler',
    prod: 'Ürün sayfasına git',
    faq: 'Sık sorulan sorular',
    h1Tek: 'Yapay Zekâ Analizi',
    decision: 'Karar', match: 'Uyum', confidence: 'Güven',
    detail: 'Ayrıntılı analiz', quiz: 'Cevapların neyi değiştirdi',
    strengths: 'Güçlü yanları', weaknesses: 'Zayıf yanları',
    critical: 'Kararı değiştirenler', features: 'Özellik özellik',
    community: 'Kullananlar ne diyor', satisfaction: 'Memnuniyet',
    alternatives: 'Akıllı alternatifler', price: 'Fiyat görünümü',
    trend: 'Eğilim', buyWait: 'Al ya da bekle', bestTime: 'En uygun zaman',
    who: 'Kime uygun?', bestFor: 'Alması gereken', notFor: 'Almaması gereken',
    verdict: 'Sonuç',
    kindProduct: 'Yapay Zekâ Analizi', kindLink: 'Yapay Zekâ Link Analizi', kindSub: 'Yapay Zekâ Abonelik Analizi',
    kindCompare: 'Yapay Zekâ Karşılaştırması',
    quizTop: 'Bu analiz şu cevaplara göre yapıldı',
    scoreBasis: 'Bu puan nasıl hesaplanıyor',
    loved: 'Sahiplerin en çok sevdiği', chronic: 'Kronik sorunlar',
    chronicNone: 'Sahiplik taramasında bu modele ait tekrar eden bir arıza çıkmadı — sahiplerin sürekli bildirdiği bir kusur örüntüsü, hatalı parti ya da yazılım sorunu bulunamadı.',
    freqWidespread: 'yaygın', freqCommon: 'sık', freqOccasional: 'ara sıra',
    services: 'Karşılaştırılan servisler', winner: 'En iyi eşleşme', decisive: 'Kararı belirleyen farklar',
    fit: 'Genel uyum', featuresSec: 'Özellikler ve içerik', ux: 'Deneyim',
    risk: 'Topluluk ve risk', plan: 'Kullanım planın', reco: 'Öneri',
    score: 'Puan', pros: 'İyi yanları', cons: 'Zayıf yanları',
    headToHead: 'Karşı karşıya', products: 'Karşılaştırılan ürünler',
    h2hFor: 'Lehine:', h2hAgainst: 'Aleyhine:',
    factorTable: 'Faktör faktör karşılaştırma', average: 'Ortalama', leads: 'faktörde önde',
    notMeasured: '“—” o faktörün o ürün için ölçülmediğini gösterir; sıfır puan demek değildir.',
  },
};

function analizListeBody(analyses, lang) {
  const tx = ANALIZ_LISTE_TEXT[lang] || ANALIZ_LISTE_TEXT[SEO_DEFAULT_LOCALE];
  const pfx = localePrefix(lang);
  const items = analyses.filter((a) => a.slug).map((a) => {
    // Baslik ve ozet, sayfayi cizen React bileseniyle AYNI fonksiyondan gelir
    // (lib/analysisRecord.js): admin bir baslik yazdiysa o, yazmadiysa
    // konudan turetilen. Iki taraf ayrisirsa crawler baska bir baslik gorur.
    const baslik = esc(analysisTitle(a, lang));
    const lead = esc(truncate(analysisLead(a, lang), 180));
    const konular = analysisSubjectNames(a, lang);
    return `<li style="margin:0;padding:18px 0;border-top:1px solid #e2e8f0">`
      + `<a href="${pfx}/analiz/${esc(a.slug)}" style="color:#0f172a;text-decoration:none;font-size:18px;font-weight:700">${baslik}</a>`
      + (lead ? `<p style="margin:6px 0 0;color:#475569;line-height:1.55">${lead}</p>` : '')
      // KARSILASTIRMADA MARKA DEGIL URUNLERIN TAMAMI — React satiriyla ayni
      // kural (pages/Analyses.jsx). `productBrand` yalniz ILK urunun markasi;
      // uc telefonluk kayit hem burada hem sitede tek kelimeye dusuyordu.
      + `<div style="margin-top:6px;font-size:12.5px;color:#64748b">${esc(kindLabel(a, tx))}${konular.length > 1 ? ` · ${esc(konular.join(' vs '))}` : a.productBrand ? ` · ${esc(a.productBrand)}` : ''}${a.techScore ? ` · Qor AI ${a.techScore}/100` : ''}</div>`
      + `</li>`;
  }).join('');
  return `<main class="seo-prerender" style="max-width:760px;margin:0 auto;padding:24px 16px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a">`
    + `<h1 style="font-size:28px;margin:0 0 8px">${esc(tx.h1)}</h1>`
    + `<p style="line-height:1.7;color:#475569;max-width:62ch">${esc(tx.intro)}</p>`
    + (items ? `<ul style="list-style:none;padding:0;margin:20px 0">${items}</ul>` : '')
    + `</main>`;
}

function kindLabel(a, tx) {
  const k = analysisKind(a);
  // KARSILASTIRMA kendi adiyla anilir. Dort tur var ama burada uc etiket
  // vardi ve `compare` sessizce "Yapay Zeka Analizi"ne dusuyordu: crawler ve
  // ilk boyama uc urunluk bir karsilastirmayi TEK URUN analizi diye
  // gosteriyordu, React devralinca rozet "Karsilastirma"ya donuyordu.
  if (k === 'link') return tx.kindLink;
  if (k === 'subscription') return tx.kindSub;
  if (k === 'compare') return tx.kindCompare;
  return tx.kindProduct;
}

// -- /analiz LISTESININ TOHUMU --------------------------------------------
//
// SORUN (olculdu 2026-08-28): sayfanin on-render govdesi TAM listeyi tasiyor
// ama React devralinca `.seo-prerender` gizleniyor ve liste PocketBase'den
// YENIDEN cekilene kadar ekranda yalnizca "Yükleniyor…" duruyor. Canli PB
// olcumu: TTFB 0,5-1,4 sn (22 kayit, 22 KB) — SPA acilisinin ustune binince
// okuyucunun gordugu sey saniyelerce suren bir bekleme; istek takilirsa hic
// bitmeyen bir bekleme.
//
// COZUM: ayni veri sayfanin head'ine JSON olarak da gomulur. React ilk karede
// listeyi TOHUMDAN cizer, PB'yi arka planda dogrular. PB dususe gecerse
// okuyucu yine listeyi gorur.
//
// SEKIL UYUMU SART: tohum, `analysisTitle` / `analysisLead` /
// `analysisKindShort` / `analysisRenderLangs` fonksiyonlarinin okudugu ALAN
// ADLARINI tasir, yani site tarafinda hicbir dallanma gerekmez. `report_*`
// yalnizca VARLIK isaretidir (bos obje) — liste rapor govdesini okumuyor.
//
// OLCEK: yalnizca ILK SAYFA (24 kayit) gomulur; gerisi "Daha fazla" ile
// PB'den gelir. Liste buyudukce tohum buyumez.
const ANALIZ_TOHUM_LIMIT = 24;

function analizTohumBlogu(analyses) {
  const rows = analyses.filter((a) => a.slug).slice(0, ANALIZ_TOHUM_LIMIT).map((a) => {
    const row = {
      id: a.id,
      slug: a.slug,
      kind: analysisKind(a),
      productName: cleanProductName(a.productName || '') || a.productName || '',
      productBrand: a.productBrand || '',
      // Karsilastirma satiri urunlerin TAMAMINI yaziyor (bkz. analizListeBody
      // ve pages/Analyses.jsx). Tohumda bu alan olmazsa liste ILK KAREDE yine
      // markaya duser ve PB gelince satir degisir — okuyucu satirin zipladigini
      // gorur.
      subjectNames: analysisSubjectNames(a, SEO_DEFAULT_LOCALE),
      productImage: /^https?:\/\//i.test(a.productImage || '') ? a.productImage : '',
      techScore: a.techScore || 0,
      title_tr: analysisTitle(a, 'tr'),
      title_en: analysisTitle(a, 'en'),
      lead_tr: truncate(analysisLead(a, 'tr'), 200),
      lead_en: truncate(analysisLead(a, 'en'), 200),
    };
    // Hangi dilde GERCEKTEN rapor var: liste, raporu olmayan dile link
    // vermiyor (bkz. analysisRenderLangs). Bos obje = "bu dilde rapor var".
    analysisRenderLangs(a, SEO_DEFAULT_LOCALE).forEach((l) => { row[`report_${l}`] = {}; });
    return row;
  });
  // JSON icinde gecen bir `</script>` dizisi bloku ERKEN kapatirdi.
  const json = JSON.stringify(rows).replace(/<\/(script)/gi, '<\\/$1');
  return `<script type="application/json" id="qor-analiz-seed">${json}</script>`;
}

// ── ON-RENDER GOVDESI ─────────────────────────────────────────────────────
//
// Crawler React CALISTIRMAZ, dolayisiyla sayfanin cizdigi raporun METIN
// karsiligi burada statik HTML olarak uretilir. Ayni VERI, ayni sira.
//
// Grafikler (skor halkasi, radar, donut) ON-RENDER'a girmez — onlar gorsel,
// arama motoruna bir sey soylemiyorlar. Onlarin TASIDIGI BILGI metin olarak
// yazilir; kullanici JS gelince gercek bileseni gorur.
//
// UC TUR, UC GOVDE: veri sekilleri gercekten farkli (urun raporu
// `product`+`community`, link raporu ortak "enhanced" sekil ya da
// karsilastirma, abonelik raporu `services[]`). Tek govdeye zorlamak,
// bloklarin yarisini bos birakmak demekti.
const anDizi = (v) => (Array.isArray(v) ? v : []);

function anPar(metin) {
  return String(metin || '').split(/\n{2,}/)
    .map((x) => x.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((x) => `<p style="line-height:1.72;color:#334155;margin:0 0 14px;max-width:68ch">${esc(x)}</p>`)
    .join('');
}
const anH2 = (t) => `<h2 style="font-size:21px;margin:30px 0 10px;padding-top:18px;border-top:1px solid #e2e8f0">${esc(t)}</h2>`;
const anH3 = (t) => `<h3 style="font-size:16px;margin:16px 0 4px">${esc(t)}</h3>`;
// Rakam tasiyan satir daima mono/tabular: skorlar goz hizasinda kalsin.
const anSayi = (t) => `<p style="font-family:ui-monospace,Consolas,monospace;font-size:13px;color:#475569;margin:0 0 12px">${esc(t)}</p>`;
function anListe(items) {
  const list = anDizi(items).map((x) => (typeof x === 'string' ? x : String(x?.title || x?.label || x?.name || ''))).filter(Boolean);
  return list.length
    ? `<ul style="margin:0 0 16px;padding-left:20px">${list.map((x) => `<li style="line-height:1.7;margin:6px 0;color:#334155">${esc(x)}</li>`).join('')}</ul>`
    : '';
}
// {title, detail} ya da duz string tasiyan bloklar (kritik noktalar, farklar).
function anBaslikliListe(items) {
  const list = anDizi(items)
    .map((x) => (typeof x === 'string'
      ? { title: x, detail: '' }
      : { title: String(x?.title || x?.label || ''), detail: String(x?.detail || x?.why || '') }))
    .filter((x) => x.title || x.detail);
  return list.map((x) => (x.title ? anH3(x.title) : '')
    + (x.detail ? `<p style="line-height:1.7;color:#475569;margin:0">${esc(x.detail)}</p>` : '')).join('');
}

// Quiz etkisi — kullanicinin verdigi cevaplar ve skora etkisi. Uc turde de
// ayni sekil (`quizInsights`), o yuzden tek fonksiyon.
function anQuizEtkisi(insights, tx) {
  const qi = anDizi(insights).filter((q) => q && (q.topic || q.answer));
  if (!qi.length) return '';
  return anH2(tx.quiz)
    + `<ul style="margin:0 0 16px;padding-left:20px">${qi.map((q) => {
      const et = Number(q.impact);
      const isaret = Number.isFinite(et) && et !== 0 ? ` (${et > 0 ? '+' : ''}${et})` : '';
      return `<li style="line-height:1.7;margin:8px 0;color:#334155"><strong>${esc(q.topic || '')}</strong>${q.answer ? ` — ${esc(q.answer)}` : ''}${esc(isaret)}${q.note ? `<br><span style="color:#64748b">${esc(q.note)}</span>` : ''}</li>`;
    }).join('')}</ul>`;
}

function anOzellikTablosu(features, tx) {
  const fm = anDizi(features).filter((x) => x && x.label);
  if (!fm.length) return '';
  return anH2(tx.features)
    + `<table style="border-collapse:collapse;width:100%;max-width:680px;margin:0 0 16px">`
    + fm.slice(0, 12).map((x) => `<tr>`
      + `<td style="padding:7px 12px;color:#64748b;border-top:1px solid #e2e8f0">${esc(x.label)}</td>`
      + `<td style="padding:7px 12px;border-top:1px solid #e2e8f0"><strong>${esc(x.productValue || '—')}</strong></td>`
      + `<td style="padding:7px 12px;color:#475569;border-top:1px solid #e2e8f0">${esc(x.comment || '')}</td>`
      + `</tr>`).join('')
    + `</table>`;
}

function anFiyat(pf, tx) {
  if (!pf || (!pf.analysis && !pf.bestTimeToBuy && !pf.bestTime && !pf.note)) return '';
  const bits = [];
  if (pf.trend) bits.push(`${tx.trend}: ${pf.trend}`);
  if (pf.buyOrWait) bits.push(`${tx.buyWait}: ${pf.buyOrWait}`);
  const en = pf.bestTimeToBuy || pf.bestTime;
  if (en) bits.push(`${tx.bestTime}: ${en}`);
  return anH2(tx.price)
    + (bits.length ? anSayi(bits.join(' · ')) : '')
    + anPar(pf.analysis || pf.note);
}

// ── URUN raporu (`product_full_report`) ───────────────────────────────────
function anUrunGovde(rapor, tx, quizGizle = false, techScore = 0, lang = 'tr') {
  const p = rapor.product || {};
  let g = '';
  if (p.headline) {
    g += `<p style="font-size:18px;line-height:1.6;color:#0f172a;font-weight:600;max-width:64ch;margin:0 0 12px">${esc(p.headline)}</p>`;
  }
  const kararBits = [];
  if (p.decision) kararBits.push(`${tx.decision}: ${p.decision}`);
  // GOSTERILEN PUAN kalibre edilmis puandir (0.60 x katalog teknik puani +
  // 0.40 x ham uyum puani) — sitedeki ile AYNI sayi olmak zorunda.
  const puan = calibratedScore(p.matchScore, techScore);
  if (puan) kararBits.push(`${tx.match}: ${puan}/100`);
  if (Number(p.confidence)) kararBits.push(`${tx.confidence}: ${p.confidence}/100`);
  if (kararBits.length) g += anSayi(kararBits.join(' · '));
  // PUANIN NEYI OLCTUGUNU SOYLE. Okuyucunun sorusu: "bu telefon nasil iPhone
  // ile yakin puan aldi". Sitede ayni metin puanin altinda duruyor.
  if (puan) {
    g += `<p style="line-height:1.7;color:#475569;margin:0 0 14px;max-width:68ch;font-size:14px">`
      + `<strong>${esc(tx.scoreBasis)}:</strong> ${esc(scoreBasisNote(techScore, lang))}</p>`;
  }
  if (p.matchComment) g += anPar(p.matchComment);
  if (p.analysis) { g += anH2(tx.detail); g += anPar(p.analysis); }

  if (!quizGizle) g += anQuizEtkisi(p.quizInsights, tx);

  // TEKRAR AGI — sayfadaki SIRAYLA cagrilir, olgu ilk gorundugu bolumde kalir.
  // Site tarafi (AiReportView) ayni moduldeki ayni fonksiyonu kosuyor; aksi
  // halde crawler'in gordugu HTML ile kullanicinin gordugu sayfa ayrisirdi.
  const gorulen = [];
  const guclu = dropRestated(anDizi(p.strengths), gorulen);
  const zayif = dropRestated(anDizi(p.weaknesses), gorulen);
  if (guclu.length) { g += anH2(tx.strengths); g += anListe(guclu); }
  if (zayif.length) { g += anH2(tx.weaknesses); g += anListe(zayif); }

  const kn = anBaslikliListe(dropRestated(anDizi(p.criticalPoints), gorulen));
  if (kn) { g += anH2(tx.critical); g += kn; }

  g += anOzellikTablosu(p.featureMatches, tx);

  const c = rapor.community || {};
  if (c.summary || anDizi(c.pros).length || anDizi(c.cons).length) {
    g += anH2(tx.community);
    if (Number(c.satisfaction)) g += anSayi(`${tx.satisfaction}: ${Number(c.satisfaction)}/100`);
    if (c.summary) g += anPar(c.summary);
  }
  // Arti/eksi YUKARIDA bir kez yazildi; burasi forum bulgulari.
  //
  // `c.pros` / `c.cons` geri donusu KALDIRILDI: eski semadaki o iki alan
  // jenerik arti/eksi listesidir, yani `strengths`/`weaknesses` ile ayni
  // maddeler. Geri donus onlari "sahiplerin sevdigi / kronik sorunlar" diye
  // YENIDEN ETIKETLEYIP ayni cumleleri ikinci kez basiyordu (canli S23 Ultra
  // kaydinda birebir boyleydi). Ayni kaldirma web/src/lib/reportAdapters.js
  // icinde de yapildi — IKISI BIRDEN degismeli.
  g += anForumBulgulari(
    dropRestated(anDizi(c.lovedFeatures), gorulen),
    dropRestated(anDizi(c.chronicIssues), gorulen),
    tx,
    // `researched` yayinlanan ESKI kayitlarda yok (admin saklamiyordu,
    // 2026-08-25'te duzeltildi); topluluk blogunun kendi kanitindan turetilir.
    Boolean(rapor.researched) || anDizi(c.sources).length > 0 || anDizi(c.verificationNotes).length > 0,
  );

  const alt = anDizi(rapor.alternatives).filter((x) => x && x.name);
  if (alt.length) {
    g += anH2(tx.alternatives);
    // Katalogda BULUNAN alternatif LINK olur. Adres `localizeBodyLinks` ile
    // dil onekini alir (bkz. MULTILANG_LINK_RE), yani Turkce sayfadaki link
    // /tr/product/... olur. Bulunamayan alternatif duz metin kalir: uydurma
    // bir adrese baglamak, hic baglamamaktan kotudur.
    g += `<ul style="margin:0 0 16px;padding-left:20px">${alt.map((x) => {
      const ad = esc(cleanProductName(x.name) || x.name);
      const bas = /^\/product\//.test(String(x.url || ''))
        ? `<a href="${esc(x.url)}" style="color:#0f172a;font-weight:700;text-decoration:none">${ad}</a>`
        : `<strong>${ad}</strong>`;
      return `<li style="line-height:1.7;margin:8px 0;color:#334155">${bas}${x.difference ? ` — ${esc(x.difference)}` : ''}</li>`;
    }).join('')}</ul>`;
  }

  g += anFiyat(rapor.priceForecast, tx);

  if (p.bestFor || p.notFor) {
    g += anH2(tx.who);
    if (p.bestFor) g += `<p style="line-height:1.7;color:#334155;margin:0 0 8px"><strong>${esc(tx.bestFor)}:</strong> ${esc(p.bestFor)}</p>`;
    if (p.notFor) g += `<p style="line-height:1.7;color:#334155;margin:0"><strong>${esc(tx.notFor)}:</strong> ${esc(p.notFor)}</p>`;
  }
  if (p.overallVerdict) { g += anH2(tx.verdict); g += anPar(p.overallVerdict); }
  return g;
}

// ── LINK raporu — tekil (ortak "enhanced" sekil) ──────────────────────────
function anLinkGovde(u, tx, quizGizle = false) {
  let g = '';
  if (u.headline) {
    g += `<p style="font-size:18px;line-height:1.6;color:#0f172a;font-weight:600;max-width:64ch;margin:0 0 12px">${esc(u.headline)}</p>`;
  }
  const bits = [];
  if (u.decision) bits.push(`${tx.decision}: ${u.decision}`);
  if (Number(u.enhancedScore)) bits.push(`${tx.match}: ${u.enhancedScore}/100`);
  if (Number(u.confidence)) bits.push(`${tx.confidence}: ${u.confidence}/100`);
  if (bits.length) g += anSayi(bits.join(' · '));
  if (u.personaAnalysis) g += anPar(u.personaAnalysis);
  if (u.verdict) { g += anH2(tx.detail); g += anPar(u.verdict); }

  if (!quizGizle) g += anQuizEtkisi(u.quizInsights, tx);

  // Tekrar agi urun raporundaki gibi: SIRAYLA, olgu ilk bolumde kalir.
  const gorulenU = [];
  const arti = dropRestated(anDizi(u.prosForUser), gorulenU);
  const eksi = dropRestated(anDizi(u.consForUser), gorulenU);
  if (arti.length) { g += anH2(tx.strengths); g += anListe(arti); }
  if (eksi.length) { g += anH2(tx.weaknesses); g += anListe(eksi); }

  const kn = anBaslikliListe(dropRestated(anDizi(u.criticalPoints), gorulenU));
  if (kn) { g += anH2(tx.critical); g += kn; }

  g += anOzellikTablosu(u.featureMatches, tx);

  // Kapi YENI adlara da baksin: eski kayitlar praise/complaint tasiyor,
  // yeni kayitlar loved/chronic. Ikisi de yoksa baslik yazilmasin.
  if (u.communityAnalysis || anDizi(u.lovedFeatures).length || anDizi(u.chronicIssues).length
    || anDizi(u.praisePoints).length || anDizi(u.complaintPoints).length) {
    g += anH2(tx.community);
    if (Number(u.communityScore)) g += anSayi(`${tx.satisfaction}: ${Number(u.communityScore)}/100`);
    if (u.communityAnalysis) g += anPar(u.communityAnalysis);
  }
  g += anForumBulgulari(
    dropRestated(anDizi(u.lovedFeatures || u.praisePoints), gorulenU),
    dropRestated(anDizi(u.chronicIssues || u.complaintPoints), gorulenU),
    tx,
    Boolean(u.researched) || anDizi(u.sources).length > 0 || anDizi(u.verificationNotes).length > 0,
  );

  g += anFiyat(u.priceOutlook, tx);

  if (u.bestFor || u.notFor) {
    g += anH2(tx.who);
    if (u.bestFor) g += `<p style="line-height:1.7;color:#334155;margin:0 0 8px"><strong>${esc(tx.bestFor)}:</strong> ${esc(u.bestFor)}</p>`;
    if (u.notFor) g += `<p style="line-height:1.7;color:#334155;margin:0"><strong>${esc(tx.notFor)}:</strong> ${esc(u.notFor)}</p>`;
  }
  if (u.overallVerdict) { g += anH2(tx.verdict); g += anPar(u.overallVerdict); }
  return g;
}

// ── LINK raporu — karsilastirma (`products[]` + `comparison`) ─────────────
// FAKTOR FAKTOR TABLOSU — sitedeki `HeatMatrix`in on-render karsiligi.
//
// Bu tablo on-render'da HIC YOKTU: crawler kazananla farklari okuyor ama
// karsilastirmanin en yogun VERISINI hic gormuyordu. Satir kumesi sitedeki
// tabloyla AYNI modulden gelir (lib/factorRows.js), dolayisiyla iki taraf ayni
// satirlari ayni sirada gosterir ve "olculmedi" hucresi burada da 0 degil
// "—" olarak yazilir.
function anFaktorMatrisi(products, matrix, tx) {
  const cols = anDizi(products).filter((p) => p && p.name).map((p) => ({
    name: cleanProductName(String(p.name)),
    factors: anDizi(p.factors),
  }));
  if (cols.length < 2) return '';
  const rows = factorMatrixRows(cols, matrix, 10);
  if (!rows.length) return '';
  const avg = factorColumnAverages(rows, cols.length);
  const wins = factorColumnWins(rows, cols.length);
  const eksik = rows.some((r) => r.filled < cols.length);
  const td = 'padding:7px 12px;border-top:1px solid #e2e8f0';
  const mono = 'font-family:ui-monospace,Consolas,monospace;text-align:right';
  return anH2(tx.factorTable)
    + '<table style="border-collapse:collapse;width:100%;max-width:760px;margin:0 0 10px">'
    + '<thead><tr><th style="' + td + ';text-align:left;color:#64748b;font-size:13px"></th>'
    + cols.map((c, i) => '<th style="' + td + ';text-align:left;font-size:13px">' + esc(c.name)
      + (wins[i] > 0 ? '<br><span style="color:#1565C0;font-weight:600">' + wins[i] + ' ' + esc(tx.leads) + '</span>' : '')
      + '</th>').join('')
    + '</tr></thead><tbody>'
    + rows.map((r) => {
      const vals = r.values.filter((v) => v != null);
      const best = vals.length ? Math.max(...vals) : 0;
      const tek = vals.filter((v) => v === best).length === 1;
      return '<tr><td style="' + td + ';color:#475569">' + esc(r.label) + '</td>'
        + r.values.map((v) => '<td style="' + td + ';' + mono + '">'
          + (v == null ? '—' : (Math.round(v) + (tek && v === best && vals.length > 1 ? ' ★' : '')))
          + '</td>').join('')
        + '</tr>';
    }).join('')
    + '</tbody><tfoot><tr><td style="' + td + ';color:#64748b;font-weight:600">' + esc(tx.average) + '</td>'
    + avg.map((v) => '<td style="' + td + ';' + mono + ';font-weight:700">' + (v == null ? '—' : v) + '</td>').join('')
    + '</tr></tfoot></table>'
    + (eksik ? '<p style="font-size:12px;color:#64748b;margin:0 0 16px">' + esc(tx.notMeasured) + '</p>' : '');
}

function anKarsilastirmaGovde(r, tx, quizGizle = false) {
  const cmp = r.comparison || {};
  const urunler = anDizi(r.products);
  let g = '';
  if (cmp.winner) g += anSayi(`${tx.winner}: ${cmp.winner}${Number(cmp.winnerScore) ? ` · ${cmp.winnerScore}/100` : ''}`);
  if (cmp.recommendation) g += anPar(cmp.recommendation);

  const chart = anDizi(cmp.chart).filter((x) => x && x.name);
  if (chart.length) {
    g += anH2(tx.products);
    g += `<table style="border-collapse:collapse;width:100%;max-width:680px;margin:0 0 16px">`
      + chart.map((x) => `<tr>`
        + `<td style="padding:7px 12px;border-top:1px solid #e2e8f0"><strong>${esc(x.name)}</strong></td>`
        + `<td style="padding:7px 12px;border-top:1px solid #e2e8f0;font-family:ui-monospace,Consolas,monospace">${Number(x.score) || 0}/100</td>`
        + `<td style="padding:7px 12px;color:#475569;border-top:1px solid #e2e8f0">${esc(x.reason || '')}</td>`
        + `</tr>`).join('')
      + `</table>`;
  }

  g += anFaktorMatrisi(urunler, cmp.factorMatrix, tx);

  const farklar = anBaslikliListe(cmp.decisiveDifferences);
  if (farklar) { g += anH2(tx.decisive); g += farklar; }
  // KARSI KARSIYA — SITEDEKIYLE AYNI SIRA VE AYNI YAPI.
  // Site urun basina serit ciziyor (lehine / aleyhine); yapi kayitta varsa
  // burada da urun basina yazilir. Yoksa duz nesir — BOLUNMEDEN, cunku o
  // metin urun urun yazilmiyor ve bolmek yanlis atif uretir (ayni gerekce
  // components/AiCharts.jsx -> HeadToHead icinde olculdu).
  const h2h = anDizi(cmp.headToHeadByProduct).filter((x) => x && x.name && (x.case || x.against));
  if (h2h.length || cmp.headToHead) {
    g += anH2(tx.headToHead);
    if (h2h.length) {
      g += h2h.map((x) => anH3(x.name)
        + (x.case ? `<p style="line-height:1.7;color:#334155;margin:0 0 6px"><strong>${esc(tx.h2hFor)}</strong> ${esc(x.case)}</p>` : '')
        + (x.against ? `<p style="line-height:1.7;color:#475569;margin:0 0 12px"><strong>${esc(tx.h2hAgainst)}</strong> ${esc(x.against)}</p>` : '')).join('');
    } else {
      g += anPar(cmp.headToHead);
    }
  }

  urunler.filter((p) => p && p.name).forEach((p) => {
    g += anH2(`${p.name}${Number(p.matchScore) ? ` — ${p.matchScore}/100` : ''}`);
    if (p.headline) g += anPar(p.headline);
    if (p.matchComment) g += anPar(p.matchComment);
    if (p.analysis) g += anPar(p.analysis);
    if (anDizi(p.pros).length) { g += anH3(tx.pros); g += anListe(p.pros); }
    if (anDizi(p.cons).length) { g += anH3(tx.cons); g += anListe(p.cons); }
    // KIME UYGUN / KIME UYGUN DEGIL. Site bunlari karsilastirmanin "Hangisini
    // almali" blogunda urun urun gosteriyor (ai-cmp-pick); on-render'da hic
    // yoktu, yani crawler kararin KIME verildigi bilgisini goremiyordu.
    if (p.bestFor) { g += anH3(tx.bestFor); g += anPar(p.bestFor); }
    if (p.notFor) { g += anH3(tx.notFor); g += anPar(p.notFor); }
    // FORUM BULGULARI KARSILASTIRMADA DA CIZILIR.
    //
    // Bu dal urun basina yalnizca arti/eksi yaziyordu; `products[].community`
    // dolu oldugu halde sevilen ozellikler ve KRONIK SORUNLAR on-render'a hic
    // girmiyordu. Sitedeki karsilastirma raporu ise onlari GOSTERIYOR
    // (CompareResult -> compareProductToUnified -> AiReportView), yani
    // crawler'in gordugu HTML ile okuyucunun gordugu sayfa ayrisiyordu — bu
    // dosyanin bastan beri kacinmaya calistigi seyin ta kendisi.
    //
    // Tekrar agi URUN BASINA ayri: olgu urune ait, iki urun ayni sorunu
    // tasiyabilir ve ikisinde de yazilmali. Sira sayfadakiyle ayni olmali,
    // o yuzden once arti/eksi beslenir.
    const gorulenP = [];
    dropRestated(anDizi(p.pros), gorulenP);
    dropRestated(anDizi(p.cons), gorulenP);
    const c = p.community || {};
    g += anForumBulgulari(
      dropRestated(anDizi(c.lovedFeatures), gorulenP),
      dropRestated(anDizi(c.chronicIssues), gorulenP),
      tx,
      Boolean(r.researched) || anDizi(c.sources).length > 0 || anDizi(c.verificationNotes).length > 0,
    );
  });
  return g;
}

// ── ABONELIK raporu (`services[]`) ────────────────────────────────────────
function anAbonelikGovde(r, tx, quizGizle = false) {
  const servisler = anDizi(r.services).filter((s) => s && s.name);
  const w = r.winner || {};
  let g = '';
  const kazanan = w.name || (servisler.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0] || {}).name;
  if (kazanan) g += anSayi(`${tx.winner}: ${kazanan}${Number(w.scoreGap) ? ` · +${w.scoreGap}` : ''}`);
  if (w.reason || w.recommendation) g += anPar(w.reason || w.recommendation);

  if (servisler.length) {
    g += anH2(tx.services);
    g += `<table style="border-collapse:collapse;width:100%;max-width:680px;margin:0 0 16px">`
      + servisler.map((s) => `<tr>`
        + `<td style="padding:7px 12px;border-top:1px solid #e2e8f0"><strong>${esc(s.name)}</strong></td>`
        + `<td style="padding:7px 12px;border-top:1px solid #e2e8f0;font-family:ui-monospace,Consolas,monospace">${Number(s.score) || 0}/100</td>`
        + `<td style="padding:7px 12px;color:#475569;border-top:1px solid #e2e8f0">${esc(s.verdict || s.summary || '')}</td>`
        + `</tr>`).join('')
      + `</table>`;
  }

  // Abonelik karsilastirmasi da AYNI faktor tablosunu alir; servislerin
  // faktorleri sabit anahtarli (qor_ai_link.js -> factorByKey) oldugu icin
  // satirlar birebir hizalanir.
  g += anFaktorMatrisi(servisler, null, tx);

  const farklar = anBaslikliListe(r.decisiveDifferences);
  if (farklar) { g += anH2(tx.decisive); g += farklar; }

  if (!quizGizle) g += anQuizEtkisi(r.quizInsights, tx);

  servisler.forEach((s) => {
    g += anH2(`${s.name}${Number(s.score) ? ` — ${s.score}/100` : ''}`);
    if (s.summary) g += anPar(s.summary);
    if (anDizi(s.pros).length) { g += anH3(tx.pros); g += anListe(s.pros); }
    if (anDizi(s.cons).length) { g += anH3(tx.cons); g += anListe(s.cons); }
    // Forum bulgulari: yukaridaki artı/eksi plan sayfasindan okunabilen
    // takaslar, bunlar aylar sonra cikan ve tekrar eden sorunlar.
    g += anForumBulgulari(
      s.lovedFeatures, s.chronicIssues, tx,
      Boolean(r.researched) || anDizi(s.sources).length > 0,
    );
  });

  const d = r.detailed || {};
  [[d.fit, tx.fit], [d.features, tx.featuresSec], [d.ux, tx.ux], [d.community, tx.risk], [d.plan, tx.plan]]
    .forEach(([metin, baslik]) => { if (metin) { g += anH2(baslik); g += anPar(metin); } });

  if (r.recommendation) { g += anH2(tx.reco); g += anPar(r.recommendation); }
  return g;
}

// Quiz kunyesi — "bu analiz su varsayimlarla yapildi". Rapordaki
// `anQuizEtkisi` blogundan FARKLI: orada her cevabin puana etkisi anlatiliyor,
// burada yalnizca hangi sorulara ne cevap verildigi.
// Forum bulgulari — sahiplerin sevdigi + KRONIK sorunlar. Rapordaki artı/eksi
// listesinden AYRI: orada urunun ozelliklerinden turetilen takaslar var,
// burada spec sayfasindan okunamayan, sahiplik sonrasi tekrar eden sorunlar.
function anForumBulgulari(loved, chronic, tx, researched = false) {
  const dizi = (v) => (Array.isArray(v) ? v : [])
    .map((x) => (typeof x === 'string'
      ? { title: x, detail: '', frequency: '' }
      : { title: String(x?.title || x?.label || ''), detail: String(x?.detail || ''), frequency: String(x?.frequency || '') }))
    .filter((x) => x.title || x.detail);
  const iyi = dizi(loved);
  const kotu = dizi(chronic);
  if (!iyi.length && !kotu.length) return '';
  // BOS KRONIK LISTE SESSIZCE BOLUMU SILEMEZ. Ayni kural sitede de var
  // (web/src/components/AiCharts.jsx -> ForumFindings); ikisi ayrisirsa
  // crawler'in gordugu HTML ile okuyucunun gordugu sayfa ayrisir.
  const kronikBos = researched && !kotu.length;
  const siklik = { widespread: tx.freqWidespread, common: tx.freqCommon, occasional: tx.freqOccasional };
  const blok = (baslik, items, renk) => (items.length
    ? anH2(baslik) + `<ul style="margin:0 0 16px;padding-left:20px">${items.map((x) => {
      const f = siklik[x.frequency]
        ? ` <span style="font-family:ui-monospace,Consolas,monospace;font-size:11.5px;color:${renk};text-transform:uppercase">${esc(siklik[x.frequency])}</span>`
        : '';
      return `<li style="line-height:1.7;margin:8px 0;color:#334155"><strong>${esc(x.title)}</strong>${f}`
        + (x.detail ? `<br><span style="color:#475569">${esc(x.detail)}</span>` : '') + `</li>`;
    }).join('')}</ul>`
    : '');
  const bosBlok = kronikBos
    ? anH2(tx.chronic) + `<p style="line-height:1.75;margin:0 0 16px;color:#475569">${esc(tx.chronicNone)}</p>`
    : '';
  return blok(tx.loved, iyi, '#047857') + blok(tx.chronic, kotu, '#b91c1c') + bosBlok;
}

function anQuizKunye(quiz, tx) {
  if (!quiz.length) return '';
  return `<section style="border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;margin:0 0 22px">`
    + `<h2 style="font-size:12px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#64748b;margin:0 0 12px;padding:0;border:0">${esc(tx.quizTop)}</h2>`
    + `<ol style="margin:0;padding:0;list-style:none">${quiz.map((q, i) => {
      const etki = Number.isFinite(q.etki) && q.etki !== 0
        ? ` <span style="font-family:ui-monospace,Consolas,monospace;font-size:12.5px;color:${q.etki > 0 ? '#047857' : '#b91c1c'}">${q.etki > 0 ? '+' : ''}${q.etki}</span>`
        : '';
      return `<li style="padding:11px 0;${i ? 'border-top:1px solid #e2e8f0' : 'padding-top:0'}">`
        + (q.soru ? `<div style="font-size:13.5px;line-height:1.5;color:#475569">${esc(q.soru)}</div>` : '')
        + (q.cevap ? `<div style="font-size:14.5px;line-height:1.45;font-weight:650;color:#0f172a">${esc(q.cevap)}${etki}</div>` : '')
        + `</li>`;
    }).join('')}</ol></section>`;
}

function analizBody(a, lang) {
  const tx = ANALIZ_LISTE_TEXT[lang] || ANALIZ_LISTE_TEXT[SEO_DEFAULT_LOCALE];
  const pfx = localePrefix(lang);
  const kind = analysisKind(a);
  const ham = analysisReport(a, lang);
  const img = /^https?:\/\//i.test(a.productImage || '') ? esc(a.productImage) : '';
  const konu = esc(analysisSubject(a, lang));
  const baslik = esc(analysisTitle(a, lang));
  const faq = analysisFaq(a, lang).slice(0, 8);

  // QUIZ TEK YERDE. Kunye govdenin USTUNDE ciziliyor; govde de kendi
  // "cevaplarin sonucu nasil degistirdi" blogunu cizerse AYNI sorular sayfada
  // IKI KEZ gorunuyor — canli Netflix sayfasinda tam boyleydi. Kunye varsa
  // govdedeki blok bastirilir (React tarafinda `hideQuiz` propu ayni isi
  // yapiyor; ikisi ayrisirsa crawler ile okuyucu farkli sayfa gorur).
  const kunye = analysisQuiz(a, lang);
  const quizGizle = kunye.length > 0;

  let govde = '';
  if (ham) {
    if (kind === 'product' && ham.product) govde = anUrunGovde(ham, tx, quizGizle, a.techScore, lang);
    else if (kind === 'subscription') govde = anAbonelikGovde(ham, tx, quizGizle);
    else if (Array.isArray(ham.products)) govde = anKarsilastirmaGovde(ham, tx, quizGizle);
    else {
      // Kayittaki sekil zaten ortak ("enhanced"); adaptor yalnizca urun
      // raporunu cevirir, digerini oldugu gibi dondurur.
      const u = analysisUnified(a, lang);
      govde = u ? anLinkGovde(u, tx, quizGizle) : '';
    }
  }

  return `<main class="seo-prerender" style="max-width:760px;margin:0 auto;padding:24px 16px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a">`
    + `<nav style="font-size:13px;color:#64748b"><a href="${pfx || '/'}">Qor AI</a> › <a href="${pfx}/analiz">${esc(tx.h1)}</a></nav>`
    + `<h1 style="font-size:27px;margin:12px 0 8px">${baslik}</h1>`
    // Analiz edilen ürüne İÇ LİNK: analiz sayfası otorite taşır, ürün sayfası
    // ince — bağ ince sayfaya değer akıtır ve okuyucuyu satın almaya yaklaştırır.
    + `<div style="display:flex;gap:14px;align-items:center;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin:18px 0">`
    + (img ? `<img src="${img}" alt="${konu}" width="64" height="64" style="object-fit:contain" loading="lazy" />` : '')
    + `<div><strong>${konu}</strong>`
    + `<div style="font-size:12.5px;color:#64748b">${esc(kindLabel(a, tx))}${a.productBrand ? ` · ${esc(a.productBrand)}` : ''}${a.techScore ? ` · Qor AI ${a.techScore}/100` : ''}</div>`
    // KOSUL `kind` DEGIL `productSlug`: link analizi de katalog urunune
    // eslesmis olabilir ve o zaman ic link verilmeli. `productSlug` zaten
    // yalnizca gercek bir eslesme varken yaziliyor.
    + (a.productSlug ? `<a href="${pfx}/product/${esc(a.productSlug)}" style="color:#2563eb;font-size:13.5px">${esc(tx.prod)} →</a>` : '')
    + `</div></div>`
    // ANALIZI URETEN QUIZ — GOVDENIN USTUNDE, sayfadaki sirayla ayni.
    // Crawler React calistirmaz; bu blok sayfada gorunenin metin karsiligi.
    + anQuizKunye(kunye, tx)
    + govde
    + (faq.length
      ? anH2(tx.faq)
        + faq.map((f) => `${anH3(f.q)}<p style="line-height:1.7;color:#475569;margin:0;max-width:68ch">${esc(f.a)}</p>`).join('')
      : '')
    + `<p style="margin-top:26px"><a href="${pfx}/analiz" style="color:#2563eb;font-weight:600">${esc(tx.all)}</a></p>`
    + `</main>`;
}

// Sanitise stored article HTML for the static shell: allow only the tags the
// generator/editor produces (defensive — body is our own content).
function safeBodyHtml(html) {
  return String(html || '').replace(/<(?!\/?(?:h2|h3|p|ul|ol|li|strong|em|br|a|blockquote|img|u|s)\b)[^>]*>/gi, '');
}

function articleCoverUrl(a) {
  if (/^https?:\/\//i.test(a.cover || '')) return a.cover;
  if (a.coverFile) return `${PB_URL}/api/files/articles/${a.id}/${a.coverFile}`;
  const p0 = (Array.isArray(a.products) ? a.products : [])[0] || {};
  const pi = p0.image || p0.imageUrl || '';
  return /^https?:\/\//i.test(pi) ? pi : '';
}
const BLOG_LBL = {
  tr: { ai: 'AI Analizi', amz: "Amazon'da Gör", prod: 'Ürüne Git', verdict: 'Sonuç', all: '← Tüm rehberler' },
  en: { ai: 'AI analysis', amz: 'View on Amazon', prod: 'Product', verdict: 'Verdict', all: '← All guides' },
};
function blogArticleBody(a, lang = 'tr', priceMap = null) {
  const lbl = BLOG_LBL[lang] || BLOG_LBL.tr;
  const t = (f) => a[`${f}_${lang}`] || a[`${f}_tr`] || a[`${f}_en`] || '';
  const title = esc(t('title'));
  const lead = esc(t('lead'));
  const body = safeBodyHtml(t('body'));
  const products = Array.isArray(a.products) ? a.products.filter((p) => p && p.id && p.name) : [];
  const IMG_H = { s: 190, m: 290, l: 420 };
  const blocks = products.map((p, i) => {
    // Urun kodu blog govdesinde de gorunmez. Olculdu 2026-08-28: dort blog
    // sayfasi "Apple MacBook Neo (MHFE4TU/A)" ve "Galaxy Tab S11 ... (SM-X930)"
    // basliklariyla yayindaydi. Ayni temizlik BlogPost.jsx'te de var.
    const pAd = cleanProductName(p.name) || p.name;
    const slug = slugifyProduct(p.slug || p.name);
    const href = slug ? `/product/${slug}` : `/product/${p.id}`;
    const d1 = esc(p[`desc_${lang}`] || p.desc_tr || p.desc_en || '');
    const d2 = esc(p[`desc2_${lang}`] || p.desc2_tr || p.desc2_en || '');
    const imgSrc = p.image || p.imageUrl || '';
    const img = /^https?:\/\//i.test(imgSrc) ? esc(imgSrc) : '';
    const buy = esc(amazonGoPath(p, 'TR'));
    // Live TR price (from the nightly rollup) wins over any stale baked value.
    const livePrice = priceMap ? livePriceFor(priceMap.get(p.id), 'TR') : '';
    const shownPrice = livePrice || (p.price || '');
    const layout = p.layout || 'split';
    const maxH = IMG_H[p.imgSize] || IMG_H.m;
    const dEl = (d) => (d ? `<p style="font-size:17px;line-height:1.8;color:#334155;margin:0 0 14px;max-width:760px">${d}</p>` : '');
    const imgEl = img ? `<a href="${href}" style="display:block;margin:8px 0 16px"><img src="${img}" alt="${esc(pAd)}" style="display:block;max-width:100%;max-height:${maxH}px;object-fit:contain;border-radius:12px;mix-blend-mode:multiply" loading="lazy" /></a>` : '';
    let inner;
    if (layout === 'text' || !img) inner = dEl(d1) + dEl(d2);
    else if (layout === 'top') inner = imgEl + dEl(d1) + dEl(d2);
    else if (layout === 'left' || layout === 'right') {
      const imgCol = `<div style="flex:0 0 40%">${imgEl}</div>`;
      const txtCol = `<div style="flex:1;min-width:0">${dEl(d1)}${dEl(d2)}</div>`;
      inner = `<div style="display:flex;gap:24px;align-items:center;flex-direction:${layout === 'right' ? 'row-reverse' : 'row'}">${imgCol}${txtCol}</div>`;
    } else inner = dEl(d1) + imgEl + dEl(d2); // split
    const btnsHtml = `<div style="display:flex;flex-wrap:wrap;gap:14px;font-size:12.5px;font-weight:600;flex:0 0 auto">`
      + `<a href="${href}?ai=1" style="color:#64748b;text-decoration:none">✨ ${lbl.ai}</a>`
      + `<a href="${buy}" rel="sponsored nofollow" aria-label="Amazon" style="color:#64748b;text-decoration:none;display:inline-flex;align-items:center;gap:6px"><img src="/assets/amazon.svg" alt="Amazon" style="height:14px;width:auto"/>${shownPrice ? `<b style="color:#0f172a">${esc(shownPrice)}</b>` : ''}</a>`
      + `<a href="${href}" style="color:#64748b;text-decoration:none">→ ${lbl.prod}</a></div>`;
    const titleHtml = `<a href="${href}" style="font-size:27px;font-weight:800;color:#0f172a;text-decoration:none;line-height:1.2;flex:1 1 auto"><span style="color:#2563eb">${i + 1}.</span> ${esc(pAd)}</a>`;
    return `<div style="padding:30px 0;border-top:1px solid #e8edf3">`
      + `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:18px;flex-wrap:wrap;margin-bottom:12px">${titleHtml}${btnsHtml}</div>`
      + inner
      + `</div>`;
  }).join('');
  const concl = safeBodyHtml(a[`conclusion_${lang}`] || a.conclusion_tr || '');
  const DLOC = { tr: 'tr-TR', en: 'en-US' };
  const dRaw = a.publishedAt || a.created;
  let dateStr = '';
  if (dRaw) { try { dateStr = new Date(String(dRaw).replace(' ', 'T')).toLocaleDateString(DLOC[lang] || 'tr-TR', { year: 'numeric', month: 'long', day: 'numeric' }); } catch (_) { dateStr = String(dRaw).slice(0, 10); } }
  const author = esc((a.author || '').trim());
  const tags = String(a[`tags_${lang}`] || a.tags_tr || a.tags || '').split(',').map((s) => s.trim()).filter(Boolean);
  const tagsHtml = tags.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:8px;margin:24px 0">${tags.map((tg) => `<a href="/blog?tag=${encodeURIComponent(tg)}" style="font-size:13px;font-weight:600;color:#2563eb;background:#2563eb14;padding:5px 12px;border-radius:999px;text-decoration:none">#${esc(tg)}</a>`).join('')}</div>`
    : '';
  return `<article class="seo-prerender" style="max-width:920px;margin:0 auto;padding:24px 24px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a">`
    + `<nav style="font-size:13px;color:#64748b"><a href="/">Qor AI</a> › <a href="/blog">Blog</a></nav>`
    + (() => { const ml = [dateStr ? `📅 ${esc(dateStr)}` : '', author ? `✍ ${author}` : ''].filter(Boolean).join(' · '); return ml ? `<p style="font-size:14px;color:#64748b;margin:10px 0 0">${ml}</p>` : ''; })()
    + `<h1 style="font-size:40px;font-weight:800;line-height:1.12;margin:6px 0 14px">${title}</h1>`
    + (lead ? `<p style="font-size:20px;color:#475569;line-height:1.6;margin:0 0 24px">${lead}</p>` : '')
    + `<div style="font-size:17.5px;line-height:1.85">${body}</div>`
    + blocks
    + (concl ? `<div style="font-size:17.5px;line-height:1.85;margin-top:16px">${concl}</div>` : '')
    + tagsHtml
    + `</article>`;
}

function blogListBody(articles, lang = 'tr') {
  const t = (a, f) => a[`${f}_${lang}`] || a[`${f}_tr`] || a[`${f}_en`] || '';
  const rows = articles.map((a) => {
    const cover = esc(articleCoverUrl(a));
    return `<a href="/blog/${esc(a.slug)}" style="display:flex;gap:18px;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;text-decoration:none;color:inherit;margin:14px 0">`
      + (cover ? `<div style="flex:0 0 200px;background:#f8fafc;display:flex;align-items:center;justify-content:center"><img src="${cover}" alt="${esc(t(a, 'title'))}" style="width:100%;max-height:150px;object-fit:contain;padding:16px;mix-blend-mode:multiply" loading="lazy" /></div>` : '')
      + `<div style="padding:18px 20px"><h2 style="font-size:20px;font-weight:700;margin:0 0 6px">${esc(t(a, 'title'))}</h2>`
      + `<p style="font-size:15px;color:#64748b;margin:0 0 8px;line-height:1.6">${esc(t(a, 'lead'))}</p>`
      + `<span style="font-size:14px;font-weight:600;color:#2563eb">Rehberi oku →</span></div></a>`;
  }).join('');
  return `<main class="seo-prerender" style="max-width:1000px;margin:0 auto;padding:24px 16px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a">`
    + `<nav style="font-size:13px;color:#64748b"><a href="/">Qor AI</a> › Blog</nav>`
    + `<h1 style="font-size:32px;font-weight:800;margin:10px 0 6px">Alım Rehberleri</h1>`
    + `<p style="color:#475569;margin:0 0 18px">2026'nın en iyi modelleri — puanlandı, karşılaştırıldı ve anlatıldı.</p>`
    + rows
    + `</main>`;
}

// ── helpers ─────────────────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Meta açıklama için kırpma. Başlıkta `…` YASAK (bkz. fitTitle) ama açıklamada
// kırpma normaldir — yeter ki KELİME ORTASINDAN olmasın: "Fan conversion speed:
// 1900 RP…" hem yarım bilgi hem baştansavma görünüyor. Son boşluktan kesip
// noktalamayı temizliyoruz; geriye kelime sınırı kalmazsa (tek uzun jeton)
// eski davranışa düşer.
function truncate(s, max = 158) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const kaba = t.slice(0, max - 1);
  const sonBosluk = kaba.lastIndexOf(' ');
  const govde = sonBosluk > max * 0.6 ? kaba.slice(0, sonBosluk) : kaba;
  return `${govde.replace(/[\s,;:.\-–—]+$/, '')}…`;
}

function slugifyProduct(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

function productPath(product) {
  const id = String(product?.id || '').trim();
  if (!id) return '';
  const slug = slugifyProduct(product.slug || product.name || '');
  // /product/<slug> — SONDAKI ID KALDIRILDI (2026-08-19). Bicim SPA'daki
  // productPath() (web/src/lib/routes.js) ile BIREBIR ayni kalmali: on-render
  // dosya yolu, <link rel=canonical>, calisma zamani canonical'i ve sitemap
  // <loc> aynı adreste bulusmak zorunda.
  // On kosul olculdu (scripts/_slug_cakisma.mjs, 107.449 urun): slugifyProduct
  // + 90 karakter kirpma sonrasi 107.449 BENZERSIZ slug, 0 cakisma.
  return slug ? `/product/${slug}` : `/product/${id}`;
}

// Collapses cosmetic SKU variants (colour / strap / storage) down to one
// representative model so the curated prerender set
// is real distinct models, not 50 near-identical pages of the same watch.
function modelKey(name) {
  let s = String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
  s = s.replace(/\([^)]*\)/g, ' '); // drop "(512 GB)" etc.
  // colours, materials, straps/cases and connectivity tags — the cosmetic SKU
  // axes that produce near-identical pages of the same model (esp. watches).
  s = s.replace(/\b(schwarz|weiss|blau|rot|gruen|grun|grau|silber|gold|rosa|pink|lila|violett|braun|beige|titan|titanium|titanyum|graphit|mitternacht|sternenlicht|polarstern|polar|space|grey|gray|black|white|blue|red|green|silver|midnight|starlight|purple|yellow|orange|olive|stone|seashell|mit|ohne|und|with|ve|armband|sportarmband|sportband|band|loop|solo|braided|gehause|gehaeuse|case|kasa|kordon|alpine|trail|ocean|milanese|milano|sport|nike|hermes|aluminium|aluminyum|alu|edelstahl|stainless|paslanmaz|celik|keramik|ceramic|leder|leather|deri|nylon|dual|sim|edition|version|cellular|gps|wifi|smartwatch)\b/g, ' ');
  s = s.replace(/\b\d+\s?(gb|tb|mb)\b/g, ' '); // storage variants
  s = s.replace(/\b\d{2,3}\s?mm\b/g, ' '); // watch case sizes (42mm/46mm SKUs of the same model)
  s = s.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  return s.split(' ').slice(0, 6).join(' ');
}

function specLi(label, value, unit) {
  const n = Number(value);
  if (value == null || value === '' || (!Number.isNaN(n) && n === 0)) return '';
  return `<li>${esc(label)}: ${esc(value)}${unit ? ` ${esc(unit)}` : ''}</li>`;
}

// Placeholder / junk spec values that carry no information for a reader.
const SPEC_VALUE_SKIP = /^(sponsorlu|sponsored|reklam|yok|none|-{1,2}|—|n\/?a|null|undefined|0|false)$/i;

// Turn a product's keySpecs map ({label: value}, Turkish, from _raw) into clean
// [label, value] rows. This is what makes each product page substantive and
// UNIQUE — the old shell baked only 3 phone-only fields (screen/battery/weight),
// so every non-phone page was a near-duplicate template with zero real content
// (exactly the thin/"scaled content" pattern Google + Bing flag and suppress).
function keySpecRows(keySpecs, limit = 16) {
  if (!keySpecs || typeof keySpecs !== 'object') return [];
  const rows = [];
  for (const [k, v] of Object.entries(keySpecs)) {
    const label = String(k == null ? '' : k).replace(/\s+/g, ' ').trim();
    const value = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    if (!label || !value || value.length > 64 || label.length > 48) continue;
    if (SPEC_VALUE_SKIP.test(value)) continue;
    rows.push([label, value]);
    if (rows.length >= limit) break;
  }
  return rows;
}

// Lightweight, factual content block baked inside #root. React (createRoot, pure
// CSR) wipes #root on mount, so users get the full SPA; non-JS crawlers and the
// pre-JS snapshot get real, unique text + internal links (category + siblings).
// Internal links matter: Googlebot defers JS for hours-to-weeks, so the crawl
// path and content must exist in the raw HTML, not only after the SPA renders.
function productBody(d, label, categoryUrl, related = [], keySpecs = null, lang = SEO_DEFAULT_LOCALE, price = null, analiz = null) {
  const name = esc(localizedName(d, lang));
  const brand = d.brand ? esc(d.brand) : '';
  const score = Number(d.techScore) || 0;
  const specs = Number(d.specsCount) || 0;
  const img = /^https?:\/\//i.test(d.imageUrl || '') ? esc(d.imageUrl) : '';
  const lbl = esc(label);
  // Real labeled specs from keySpecs (from _raw). Fall back to the 3 phone-only
  // fields only when a product has no keySpecs map at all.
  const rows = keySpecRows(keySpecs);
  const items = rows.length
    ? rows.map(([k, v]) => `<li><span style="color:#64748b">${esc(k)}:</span> <strong>${esc(v)}</strong></li>`).join('')
    : [
      specLi('Ekran', d.screenSizeValue, 'inç'),
      specLi('Batarya', d.batteryCapacityValue, 'mAh'),
      specLi('Ağırlık', d.weightValueKg, 'kg'),
    ].filter(Boolean).join('');
  // Weave 2-3 real spec values into the intro so the opening sentence differs
  // per product instead of being an identical template across thousands of pages.
  const highlights = rows.slice(0, 3).map(([k, v]) => `${esc(k.toLowerCase())} ${esc(v)}`).join(', ');
  const relLinks = related
    .filter((r) => r && r.name && r.path)
    .slice(0, 8)
    .map((r) => `<li><a href="${esc(r.path)}" style="color:#2563eb">${esc(r.name)}</a></li>`)
    .join('');
  const tx = PROD_BODY_TEXT[lang] || PROD_BODY_TEXT[SEO_DEFAULT_LOCALE];
  const pfx = localePrefix(lang);
  return `<main class="seo-prerender" style="max-width:880px;margin:0 auto;padding:24px 16px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a">`
    + `<nav style="font-size:13px;color:#64748b"><a href="${pfx || '/'}">Qor AI</a> › <a href="${pfx}/category">${tx.cats}</a> › <a href="${categoryUrl}">${lbl}</a></nav>`
    + `<h1 style="font-size:26px;margin:12px 0 4px">${name}</h1>`
    + `<p style="color:#475569;margin:0 0 12px">${brand ? `${brand} · ` : ''}${lbl}${score ? ` · ${tx.score(score)}` : ''}</p>`
    + (img ? `<img src="${img}" alt="${name}" width="320" style="max-width:100%;height:auto;border-radius:12px" loading="lazy" />` : '')
    // FIYAT — baslikta vaat ediliyorsa GOVDEDE de bulunmali. Ön-render bugune
    // kadar hicbir sayfaya fiyat basmiyordu; baslikta "Fiyati" yazip fiyat
    // gostermemek karsilanmayan bir vaat, ve Product/Offer semasinin govdede
    // karsiligi olmadan yayilmasi da kural disi.
    + (price ? `<p style="margin:10px 0 2px;font-size:20px;font-weight:700;color:#15803D">${esc(price.text)}</p>` : '')
    + `<p style="line-height:1.7;color:#334155">${tx.intro(name, highlights, lbl, specs)}</p>`
    + (items ? `<h2 style="font-size:18px;margin:22px 0 8px">${tx.specsH}</h2><ul style="margin:8px 0;line-height:1.8;list-style:none;padding:0">${items}</ul>` : '')
    + (relLinks ? `<h2 style="font-size:18px;margin:22px 0 8px">${tx.relH(lbl)}</h2><ul style="line-height:1.8">${relLinks}</ul>` : '')
    // Yayinlanmis analiz varsa ONA git. Analiz sayfasinin sitedeki TEK ic
    // linki burasi; kategori CTA'sindan ONCE duruyor cunku okuyucu icin daha
    // degerli (kendi urunu hakkinda derin icerik, listeye donmek degil).
    + (analiz ? `<p style="margin-top:16px"><a href="${analiz.href}" style="color:#2563eb;font-weight:600">${analiz.text} →</a></p>` : '')
    + `<p style="margin-top:16px"><a href="${categoryUrl}" style="color:#2563eb;font-weight:600">${tx.cta(lbl)} →</a></p>`
    + `</main>`;
}

// Ürün gövdesi metinleri (kök adres İngilizce olduğu için varsayılan 'en').
const PROD_BODY_TEXT = {
  en: {
    cats: 'Categories',
    score: (s) => `Qor AI tech score ${s}/100`,
    specsH: 'Key Specifications',
    relH: (l) => `Similar models in ${l}`,
    cta: (l) => `Compare all ${l}`,
    intro: (n, hi, l, sp) => `${n}${hi ? ` key features: ${hi}.` : ` — ${l}.`} Review ${n}'s ${sp ? `${sp} technical specs` : 'specifications'}, its Qor AI tech score and how it compares with similar models in ${l.toLowerCase()} below.`,
  },
  tr: {
    cats: 'Kategoriler',
    score: (s) => `Qor AI teknik skoru ${s}/100`,
    specsH: 'Öne Çıkan Teknik Özellikler',
    relH: (l) => `Benzer ${l} modelleri`,
    cta: (l) => `Tüm ${l} modellerini karşılaştır`,
    intro: (n, hi, l, sp) => `${n}${hi ? ` öne çıkan özellikleri: ${hi}.` : ` — ${l}.`} ${n}${sp ? ` ${sp} teknik özelliğini` : ' özelliklerini'}, Qor AI teknik skorunu ve benzer ${l.toLowerCase()} modelleriyle karşılaştırmasını aşağıda incele.`,
  },
};

// Crawlable body for a category landing page: H1 + intro + a real <a> grid to
// every curated product in the category. This is the spine of internal linking
// (home → category → product, all within 3 clicks) and turns category pages from
// head-only shells into content-rich hubs Google can crawl without running JS.
// Renders the AI buying guide as static HTML (mirrors CategoryGuide.jsx) so
// non-JS crawlers + first paint see it too. The SPA re-renders the same guide.
function guideHtml(guide) {
  if (!guide || !guide.lead) return '';
  const secs = (guide.sections || []).map((s) =>
    `<h3 style="font-size:18px;margin:18px 0 6px">${esc(s.h)}</h3><p style="line-height:1.7;color:#334155">${esc(s.body)}</p>`).join('');
  const picks = (guide.picks || []).filter((p) => p && p.id && p.name).map((p) =>
    `<li style="margin:6px 0"><a href="/product/${esc(slugifyProduct(p.slug || p.name))}" style="color:#2563eb;font-weight:600">${esc(p.name)}</a>${p.why ? ` <span style="color:#64748b">— ${esc(p.why)}</span>` : ''}</li>`).join('');
  const faq = (guide.faq || []).map((f) =>
    `<h4 style="font-size:15px;margin:14px 0 4px">${esc(f.q)}</h4><p style="line-height:1.7;color:#475569">${esc(f.a)}</p>`).join('');
  return `<section style="margin-top:28px;border-top:1px solid #e2e8f0;padding-top:20px">`
    + `<h2 style="font-size:24px;font-weight:800;margin:0 0 8px">${esc(guide.title)}</h2>`
    + `<p style="line-height:1.7;color:#475569;margin:0 0 14px">${esc(guide.lead)}</p>`
    + secs
    + (picks ? `<h3 style="font-size:18px;margin:18px 0 6px">Öne çıkan ${esc(guide.label)} modelleri</h3><ul style="line-height:1.9">${picks}</ul>` : '')
    + (faq ? `<h3 style="font-size:18px;margin:18px 0 6px">Sık sorulan sorular</h3>${faq}` : '')
    + `</section>`;
}

// Per-language copy for the category landing prerender. h1/intro take the label.
const CAT_BODY_TEXT = {
  tr: { cats: 'Kategoriler', h1: (l) => `${l} Karşılaştırma`, intro: (l) => `En iyi ${l.toLowerCase()} modellerini Qor AI yapay zekâ teknik skoru, özellikleri ve güncel fiyatlarıyla karşılaştır. Aşağıdaki modellerden birini seç ya da filtreleyerek sana en uygununu saniyeler içinde bul.` },
  en: { cats: 'Categories', h1: (l) => `${l} Comparison`, intro: (l) => `Compare the best ${l.toLowerCase()} models with Qor AI: AI tech score, key features and current prices together. Pick one of the models below or filter to find the one that fits you best in seconds.` },
};

// Karsilastirma sayfalarina giden IC LINKLER. 2026-08-16'da Epey ile yan yana
// olculdu: Epey'in kategori sayfasinda 626 ic link var, bizimkinde 46 (SPA) /
// 152 (on-render) ve bunlarin HICBIRI karsilastirma sayfasina gitmiyordu —
// yani 3.864 uretilmis "X vs Y" sayfasi sitede hicbir yerden LINKLENMIYORDU,
// Google'a yalniz sitemap'ten ulasiyordu. AdSense'in "dusuk degerli icerik"
// gerekcesi de tam olarak bu: uretilen sayfalar birbirine baglanmayinca site
// bir icerik agi degil, kopuk sayfalar yigini gorunuyor.
//
// Ciftler, karsilastirma sayfalarini URETEN dongunun BIREBIR AYNI algoritmasini
// kullanir (top-K distinct model, i<j) — aksi halde var olmayan adrese link
// verip 404 uretirdik.
function compareLinksFor(items, lang, sinir = 12) {
  const topK = [];
  const seen = new Set();
  // Varsayılan ÜRETEN döngüyle aynı olmak ZORUNDA (2026-08-21'de 8 → 6).
  // Ayrışırsa kategori sayfası var olmayan karşılaştırma adresine link verir.
  const COMPARE_TOP = Number(process.env.SEO_COMPARE_TOP || 6);
  for (const d of items || []) {
    if (topK.length >= COMPARE_TOP) break;
    if (!d || !d.name || !d.id) continue;
    const k = modelKey(d.name);
    if (k && seen.has(k)) continue;
    if (k) seen.add(k);
    topK.push(d);
  }
  const pfx = localePrefix(lang);
  const out = [];
  for (let i = 0; i < topK.length && out.length < sinir; i += 1) {
    for (let j = i + 1; j < topK.length && out.length < sinir; j += 1) {
      const a = topK[i]; const b = topK[j];
      out.push({
        href: pfx + comparePath(a, b),
        text: `${localizedName(a, lang)} vs ${localizedName(b, lang)}`,
      });
    }
  }
  return out;
}

function categoryBody(label, categoryUrl, items, guide, lang = 'tr', digerKategoriler = [], compareVar = true) {
  const tx = CAT_BODY_TEXT[lang] || CAT_BODY_TEXT.tr;
  const lbl = esc(label);
  // İç linkler AYNI DİL AĞACINDA kalmalı: /tr/category sayfası öneksiz
  // /product/… adreslerine bağlanırsa Googlebot /tr/ ve kök ürün sayfalarına
  // yalnız sitemap'ten ulaşır, iç link yoluyla hiç ulaşamaz.
  const pfx = localePrefix(lang);
  const links = items
    .filter((d) => d && d.name && d.id)
    .map((d) => {
      const score = Number(d.techScore) || 0;
      return `<li style="margin:4px 0"><a href="${esc(pfx + productPath(d))}" style="color:#0f172a;text-decoration:none">`
        + `${esc(localizedName(d, lang))}${score ? ` <span style="color:#64748b;font-size:12px">· ${score}/100</span>` : ''}</a></li>`;
    })
    .join('');
  return `<main class="seo-prerender" style="max-width:980px;margin:0 auto;padding:24px 16px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a">`
    + `<nav style="font-size:13px;color:#64748b"><a href="${pfx || '/'}">Qor AI</a> › <a href="${pfx}/category">${esc(tx.cats)}</a> › ${lbl}</nav>`
    + `<h1 style="font-size:28px;margin:12px 0 6px">${esc(tx.h1(label))}</h1>`
    + `<p style="line-height:1.7;color:#334155;max-width:680px">${esc(tx.intro(label))}</p>`
    + (links ? `<ul style="columns:2;column-gap:32px;margin:18px 0;padding:0;list-style:none">${links}</ul>` : '')
    + (compareVar ? karsilastirmaBolumu(items, lang) : '')
    + digerKategoriBolumu(digerKategoriler, lang)
    + `</main>`;
}

const IC_LINK_TEXT = {
  tr: { kars: 'Popüler karşılaştırmalar', diger: 'Diğer kategoriler' },
  en: { kars: 'Popular comparisons', diger: 'Other categories' },
};

function karsilastirmaBolumu(items, lang) {
  const rows = compareLinksFor(items, lang);
  if (!rows.length) return '';
  const tx = IC_LINK_TEXT[lang] || IC_LINK_TEXT.tr;
  const li = rows.map((r) => `<li style="margin:4px 0"><a href="${esc(r.href)}" style="color:#0f172a;text-decoration:none">${esc(r.text)}</a></li>`).join('');
  return `<h2 style="font-size:20px;margin:26px 0 8px">${esc(tx.kars)}</h2>`
    + `<ul style="columns:2;column-gap:32px;margin:0 0 8px;padding:0;list-style:none">${li}</ul>`;
}

function digerKategoriBolumu(kategoriler, lang) {
  if (!kategoriler || !kategoriler.length) return '';
  const tx = IC_LINK_TEXT[lang] || IC_LINK_TEXT.tr;
  const pfx = localePrefix(lang);
  const li = kategoriler.map((c) => `<li style="display:inline-block;margin:0 10px 8px 0"><a href="${esc(pfx + categoryPath(c))}" style="color:#0f172a;text-decoration:none">${esc(categoryLabel(c, lang))}</a></li>`).join('');
  return `<h2 style="font-size:20px;margin:26px 0 8px">${esc(tx.diger)}</h2>`
    + `<ul style="margin:0;padding:0;list-style:none">${li}</ul>`;
}

// Load all generated buying guides keyed by category.
function loadGuides() {
  const dir = join(here, '..', 'public', 'guides');
  const map = new Map();
  if (!existsSync(dir)) return map;
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    try { const g = JSON.parse(readFileSync(join(dir, f), 'utf8')); if (g && g.category) map.set(g.category, g); } catch (_) {}
  }
  return map;
}

// FAQPage JSON-LD from a guide's FAQ — eligible for the FAQ rich result.
function guideFaqLd(guide, url) {
  if (!guide || !Array.isArray(guide.faq) || !guide.faq.length) return null;
  return {
    '@type': 'FAQPage', '@id': `${url}#faq`,
    mainEntity: guide.faq.map((f) => ({
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

// ── comparison ("X vs Y") pages ─────────────────────────────────
// Adres: /compare/<slugA>-vs-<slugB>.
//
// 2026-08-22: kayit ID'leri ADRESTEN CIKARILDI. Urun adresinde ayni temizlik
// `e64350a` ile yapilmisti, compare unutulmustu:
//   /compare/ecovacs-deebot-t50s-pro-omni-qw4jn21yemj0wez-vs-mamibot-ultra-m10-6fnbz3dy8fzjesx
// Kimse bunu yazmaz, boyle bir linki paylasmaz, arama sonucunda okuyamaz.
//
// SPA tarafi (routes.js parseComparePair) her iki bicimi de cozer: yeni slug-only
// ve indekste duran eski id'li bicim. Iki fonksiyon BIREBIR ayni jetonu uretmek
// zorunda; ayrisirlarsa runtime canonical ile on-render dosya yolu/sitemap
// uyusmaz.
function compareToken(d) {
  // Slug 40 karakterle SINIRLI: build `website/compare/<token>/index.html`
  // yaziyor ve iki tam slug (90+90) Windows'un 260 karakter yol sinirini asiyor.
  const slug = slugifyProduct(d.slug || d.name || '').slice(0, 40).replace(/-+$/, '');
  return slug || String(d.id);
}
function comparePath(a, b) {
  return `/compare/${compareToken(a)}-vs-${compareToken(b)}`;
}

function cmpRow(label, va, vb, unit) {
  const fmt = (v) => {
    const n = Number(v);
    if (v == null || v === '' || (!Number.isNaN(n) && n === 0)) return '—';
    return `${esc(v)}${unit ? ` ${esc(unit)}` : ''}`;
  };
  const fa = fmt(va); const fb = fmt(vb);
  if (fa === '—' && fb === '—') return '';
  return `<tr><td style="padding:7px 12px;color:#64748b;border-top:1px solid #e2e8f0">${esc(label)}</td>`
    + `<td style="padding:7px 12px;font-weight:600;border-top:1px solid #e2e8f0">${fa}</td>`
    + `<td style="padding:7px 12px;font-weight:600;border-top:1px solid #e2e8f0">${fb}</td></tr>`;
}

// Side-by-side spec rows from two products' keySpecs (from _raw). Every label
// either product carries, A's order first. Turns the compare page from a 3-field
// stub into a real spec-by-spec table — the whole point of a comparison page.
function compareSpecRows(ksA, ksB) {
  const a = (ksA && typeof ksA === 'object') ? ksA : {};
  const b = (ksB && typeof ksB === 'object') ? ksB : {};
  const labels = [];
  const seen = new Set();
  for (const k of [...Object.keys(a), ...Object.keys(b)]) {
    const label = String(k == null ? '' : k).replace(/\s+/g, ' ').trim();
    if (!label || label.length > 48 || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  const clean = (v) => {
    const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    return (!s || s.length > 44 || SPEC_VALUE_SKIP.test(s)) ? '' : s;
  };
  const out = [];
  for (const label of labels) {
    const ca = clean(a[label]); const cb = clean(b[label]);
    if (!ca && !cb) continue;
    const row = cmpRow(label, ca, cb);
    if (row) out.push(row);
    if (out.length >= 16) break;
  }
  return out.join('');
}

// Karşılaştırma sayfası metinleri (kök adres İngilizce → varsayılan 'en').
const CMP_TEXT = {
  en: {
    cats: 'Categories', score: 'Qor AI tech score', brand: 'Brand',
    screen: 'Screen', batt: 'Battery', weight: 'Weight', inch: 'in',
    titleTail: [' — Comparison', ' | Qor AI'],
    desc: (a, b, l) => `${a} vs ${b} comparison — ${l}. Qor AI tech score and specs side by side; which one fits you better?`,
    intro: (a, b) => `${a} vs ${b} comparison: Qor AI tech score and specifications side by side. See which one suits you better in the table below.`,
    cta: (l) => `Compare all ${l}`,
  },
  tr: {
    cats: 'Kategoriler', score: 'Qor AI teknik skoru', brand: 'Marka',
    screen: 'Ekran', batt: 'Batarya', weight: 'Ağırlık', inch: 'inç',
    titleTail: [' — Karşılaştırma', ' | Qor AI'],
    desc: (a, b, l) => `${a} ile ${b} karşılaştırması — ${l}. Qor AI teknik skoru ve teknik özellikleri yan yana; hangisi sana daha uygun?`,
    intro: (a, b) => `${a} ile ${b} karşılaştırması: Qor AI yapay zekâ teknik skoru ve teknik özellikleri yan yana. Hangisi sana daha uygun, aşağıdaki tabloda saniyeler içinde gör.`,
    cta: (l) => `Tüm ${l} modellerini karşılaştır`,
  },
};

// "Kısa sonuç" bloğu — karşılaştırma sayfasının TEK özgün metni.
//
// NEDEN VAR: compare gövdesi ortalama 125 kelimeydi ve tamamı spec tablosuydu;
// yani sayfa, iki ürün sayfasında zaten yazan veriyi tekrar ediyordu. Arayan
// kişi "hangisi?" sorusuna cevap arıyor, tabloyu kendi okumak istemiyor.
//
// Her cümle VERİDEN türetilir — uydurma yorum yok: skor farkı, fiyat farkı,
// kaç özellikte ayrıştıkları. "Şunu al" demiyoruz; hangi ölçüte göre hangisinin
// önde olduğunu söylüyoruz, kararı okuyucu veriyor.
const CMP_SONUC = {
  en: {
    h: 'The short answer',
    skorFark: (w, l, d) => `${w} leads on the Qor AI tech score by ${d} points (${w} vs ${l}). `,
    skorEsit: (s) => `Both score ${s}/100 on the Qor AI tech score. `,
    fiyat: (uc, fark) => `${uc} is the cheaper of the two, by ${fark}. `,
    ayrisma: (n, ornek) => `They differ on ${n} of the compared specs${ornek ? ` — most notably ${ornek}` : ''}. `,
    secim: (skorlu, ucuz) => (skorlu === ucuz
      ? `${skorlu} is both the higher-scoring and the cheaper option.`
      : `Pick ${skorlu} for the stronger spec sheet, ${ucuz} for the lower price.`),
    secimEsit: (ucuz) => `With the scores level, ${ucuz} is the better value of the two.`,
  },
  tr: {
    h: 'Kısa sonuç',
    skorFark: (w, l, d) => `Qor AI teknik skorunda ${w}, ${l}'i ${d} puan geçiyor. `,
    skorEsit: (s) => `Qor AI teknik skorunda ikisi de ${s}/100. `,
    fiyat: (uc, fark) => `İkisinden ucuzu ${uc}; aradaki fark ${fark}. `,
    ayrisma: (n, ornek) => `Karşılaştırılan özelliklerin ${n} tanesinde ayrışıyorlar${ornek ? ` — başta ${ornek}` : ''}. `,
    secim: (skorlu, ucuz) => (skorlu === ucuz
      ? `${skorlu} hem daha yüksek skorlu hem daha ucuz olan.`
      : `Daha güçlü teknik tablo istiyorsan ${skorlu}, daha düşük fiyat istiyorsan ${ucuz}.`),
    secimEsit: (ucuz) => `Skorlar eşit olduğu için fiyat/performansta öne çıkan ${ucuz}.`,
  },
};

// İki key-spec haritasının AYRIŞTIĞI etiketler (ikisinde de değeri olan ama
// değerleri farklı olanlar). Sayısal karşılaştırma YAPMIYORUZ: birim ayrıştırma
// ("205 dk" vs "3.5 saat") kırılgan ve yanlış kazanan ilan etmek, hiç bir şey
// söylememekten kötü. Yalnız "farklılar" demek doğrulanabilir.
function ayrisanSpecler(ksA, ksB, limit = 3) {
  const a = (ksA && typeof ksA === 'object') ? ksA : {};
  const b = (ksB && typeof ksB === 'object') ? ksB : {};
  const out = [];
  for (const [k, va] of Object.entries(a)) {
    const vb = b[k];
    if (vb === undefined) continue;
    if (String(va).trim().toLowerCase() === String(vb).trim().toLowerCase()) continue;
    out.push(k);
  }
  return { sayi: out.length, ornek: out.slice(0, limit) };
}

function compareSonucBlok(a, b, ksA, ksB, lang, fiyatA, fiyatB) {
  const tx = CMP_SONUC[lang] || CMP_SONUC[SEO_DEFAULT_LOCALE];
  if (!tx) return '';
  const na = localizedName(a, lang); const nb = localizedName(b, lang);
  const sa = Number(a.techScore) || 0; const sb = Number(b.techScore) || 0;
  let metin = '';
  if (sa && sb) {
    if (sa === sb) metin += tx.skorEsit(sa);
    else metin += (sa > sb ? tx.skorFark(na, nb, sa - sb) : tx.skorFark(nb, na, sb - sa));
  }
  // Fiyat cümlesi yalnız İKİSİNİN DE aynı pazarda fiyatı varsa — tek taraflı
  // fiyat "ucuz olan" demeye yetmez.
  let ucuz = '';
  if (fiyatA && fiyatB && fiyatA.currency === fiyatB.currency && fiyatA.amount !== fiyatB.amount) {
    const aUcuz = fiyatA.amount < fiyatB.amount;
    ucuz = aUcuz ? na : nb;
    const fark = Math.abs(fiyatA.amount - fiyatB.amount);
    metin += tx.fiyat(ucuz, fmtMoney(fark, (aUcuz ? fiyatA : fiyatB).country));
  }
  const { sayi, ornek } = ayrisanSpecler(ksA, ksB);
  if (sayi) metin += tx.ayrisma(sayi, ornek.join(', '));
  // techScore amiral gemilerinde 100'de DOYUYOR — ölçüldü, üst sıradaki
  // telefonların çoğu 100/100. O yüzden "hangisini seç" cümlesi yalnız skor
  // farkına bağlı olsaydı en çok aranan çiftlerde hiç çıkmazdı. Skorlar eşitse
  // karar ölçütü fiyat olur; bu da veriden gelen bir ifade, yorum değil.
  const skorlu = sa === sb ? '' : (sa > sb ? na : nb);
  if (skorlu && ucuz) metin += tx.secim(skorlu, ucuz);
  else if (!skorlu && ucuz && sa && sb) metin += tx.secimEsit(ucuz);
  if (!metin.trim()) return '';
  return `<h2 style="font-size:20px;margin:22px 0 6px">${esc(tx.h)}</h2>`
    + `<p style="line-height:1.7;color:#334155;max-width:680px">${esc(metin.trim())}</p>`;
}

function compareBody(a, b, label, categoryUrl, ksA = null, ksB = null, lang = SEO_DEFAULT_LOCALE, fiyatA = null, fiyatB = null) {
  const tx = CMP_TEXT[lang] || CMP_TEXT[SEO_DEFAULT_LOCALE];
  const pfx = localePrefix(lang);
  const na = esc(localizedName(a, lang)); const nb = esc(localizedName(b, lang));
  const lbl = esc(label);
  const pa = esc(pfx + productPath(a)); const pb = esc(pfx + productPath(b));
  const sa = Number(a.techScore) || 0; const sb = Number(b.techScore) || 0;
  const base = [
    cmpRow(tx.score, sa ? `${sa}/100` : '', sb ? `${sb}/100` : ''),
    cmpRow(tx.brand, a.brand, b.brand),
  ].filter(Boolean).join('');
  const specRows = compareSpecRows(ksA, ksB);
  const fallback = [
    cmpRow(tx.screen, a.screenSizeValue, b.screenSizeValue, tx.inch),
    cmpRow(tx.batt, a.batteryCapacityValue, b.batteryCapacityValue, 'mAh'),
    cmpRow(tx.weight, a.weightValueKg, b.weightValueKg, 'kg'),
  ].filter(Boolean).join('');
  const rows = base + (specRows || fallback);
  return `<main class="seo-prerender" style="max-width:880px;margin:0 auto;padding:24px 16px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0f172a">`
    + `<nav style="font-size:13px;color:#64748b"><a href="${pfx || '/'}">Qor AI</a> › <a href="${pfx}/category">${tx.cats}</a> › <a href="${categoryUrl}">${lbl}</a></nav>`
    + `<h1 style="font-size:26px;margin:12px 0 6px">${na} <span style="color:#94a3b8">vs</span> ${nb}</h1>`
    + `<p style="line-height:1.7;color:#334155">${tx.intro(na, nb)}</p>`
    + `<table style="border-collapse:collapse;margin:18px 0;width:100%;max-width:680px">`
    + `<thead><tr><th></th>`
    + `<th style="padding:8px 12px;text-align:left"><a href="${pa}" style="color:#2563eb">${na}</a></th>`
    + `<th style="padding:8px 12px;text-align:left"><a href="${pb}" style="color:#2563eb">${nb}</a></th></tr></thead>`
    + `<tbody>${rows}</tbody></table>`
    + compareSonucBlok(a, b, ksA, ksB, lang, fiyatA, fiyatB)
    + `<p><a href="${categoryUrl}" style="color:#2563eb;font-weight:600">${tx.cta(lbl)} →</a></p>`
    + `</main>`;
}

function compareSeo(a, b, label, lang = SEO_DEFAULT_LOCALE) {
  const tx = CMP_TEXT[lang] || CMP_TEXT[SEO_DEFAULT_LOCALE];
  // DİL ÖNEKİ ŞART: öneksiz kurulan canonical ve /tr/compare/…
  // sayfalarını İngilizce adrese kanonikleştiriyordu — yani Google'a "bu üç
  // sayfa aslında tek sayfa, İngilizcesini al" demiş oluyorduk ve Türkçe/Almanca
  // karşılaştırma sayfaları indexe hiç girmiyordu.
  const prefix = localePrefix(lang);
  const url = `${SITE}${prefix}${comparePath(a, b)}`;
  const categoryUrl = `${SITE}${prefix}${categoryPath(a.category)}`;
  const imgA = /^https?:\/\//i.test(a.imageUrl || '') ? a.imageUrl : DEFAULT_IMG;
  const na = localizedName(a, lang);
  const nb = localizedName(b, lang);
  // Ürün çifti başlığın DEĞİŞMEZ çekirdeği: "A vs B" kırpılırsa sayfa hangi
  // iki ürünü karşılaştırdığını söyleyemez hâle gelir. Sadece son ekler düşer.
  const title = fitTitle(`${na} vs ${nb}`, tx.titleTail, 70);
  const description = truncate(
    tx.desc(na, nb, label),
  );
  const webPage = {
    '@type': 'WebPage', '@id': `${url}#webpage`, url, name: title,
    isPartOf: { '@id': `${SITE}/#website` },
  };
  const itemList = {
    '@type': 'ItemList', '@id': `${url}#itemlist`, numberOfItems: 2,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: na, url: `${SITE}${prefix}${productPath(a)}` },
      { '@type': 'ListItem', position: 2, name: nb, url: `${SITE}${prefix}${productPath(b)}` },
    ],
  };
  const breadcrumb = {
    '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Qor AI', item: `${SITE}${prefix}/` },
      { '@type': 'ListItem', position: 2, name: label, item: categoryUrl },
      { '@type': 'ListItem', position: 3, name: `${na} vs ${nb}`, item: url },
    ],
  };
  return {
    title, description, url, lang, image: imgA, imageAlt: `${na} vs ${nb}`, type: 'website',
    jsonLd: { '@context': 'https://schema.org', '@graph': [webPage, itemList, breadcrumb] },
  };
}

// Per-product <head> SEO: WebPage + Breadcrumb, ARTI fiyati olan urunlerde
// Product + Offer.
//
// TARIHCE (yaniltici olmasin diye duruyor): bu blok uzun sure "Product yayma"
// diyordu, gerekcesi "statik build'in guvenilir fiyati yok, lowestPriceUSD
// ~her zaman 0". O gerekce YAZILDIGI GUN dogruydu; bugun degil. 2026-08-21'de
// olculdu: Typesense'te lowestPriceUSD>0 olan 35.752, priceTR>0 olan 31.809
// dokuman var. Fiyat artik `_raw.prices` icinde ve zaten curated kume icin
// cekiliyor. Kural bu yuzden "hic yayma" degil, "fiyati olana yay" oldu —
// fiyatsiz Product hala yayilmaz, cunku gecersizdir.
// Ürün sayfası SEO metinleri. Kök adres İngilizce olduğu için varsayılan 'en'.
// BASLIKTA "FIYAT" GECMEK ZORUNDA. 2026-08-16'da olculdu: "Samsung Galaxy S26
// Ultra fiyat özellikleri karşılaştırma" aramasinda ilk sirada Akakce var ve
// onun basligi "… 256 GB 12 GB FIYATLARI, Özellikleri ve YORUMLARI | En Ucuzu
// Akakçe". Bizim basligimizda ("… — Özellikler & Karşılaştırma") sorgunun en
// guclu kelimesi olan FIYAT hic gecmiyordu; Turkiye'de bu urunler ezici
// cogunlukla "<urun> fiyat / fiyatlari" kalibiyla araniyor.
// Ayrica basligin BASINDA urun adi kalir (Google ilk ~60 karakteri gosterir),
// marka adi sona atilir.
// ── BASLIK KURGUSU — `…` YASAK ─────────────────────────────────────────────
//
// Eskiden baslik once tam kuruluyor, sonra truncate(68) ile KESILIYORDU. Ek
// (`| Qor AI`) sonda oldugu icin once o yariliyor, sonra urun adinin kendisi:
//   "Hikvision DS-2CD1T47G2-LUF Fiyati, Ozellikleri ve Karsilastirma | Q…"
// Olculdu (2026-08-21, tum agac): TR urun basliklarinin %80,2'si, EN %44,0,
// DE %41,8, compare %85,6 boyle bitiyordu. Arama sonucunda kirik sayfa gorunumu.
//
// Dogru davranis: baslik PARCALARDAN kurulur ve sigmayan parca DUSURULUR.
// Google zaten kendi kirpiyor; bizim kirpmamiz yalnizca kelimeyi yok ediyor.
// Ilk parca (urun adi) ASLA kesilmez — sigmazsa tek basina kalir.
function fitTitle(head, tailParts, max = 68) {
  const h = String(head || '').replace(/\s+/g, ' ').trim();
  const parts = (tailParts || []).filter((p) => p && String(p).trim());
  for (let drop = 0; drop <= parts.length; drop += 1) {
    const kept = parts.slice(0, parts.length - drop);
    const candidate = kept.reduce((acc, p) => acc + p, h);
    if (candidate.length <= max) return candidate;
  }
  return h;
}

// Baslik parcalari EN GENISTEN EN DARA sirali: sigmayan SONDAN dusurulur.
// `fiyat` parcasi YALNIZ sayfanin kendi ulkesinde gercekten fiyat varsa
// eklenir — "Fiyati" yazip fiyat gostermemek karsilanmayan bir vaat ve
// olculdugunde yayindaki urun sayfalarinin %60'i tam olarak bunu yapiyordu.
const PROD_SEO_TEXT = {
  en: {
    titleParts: (hasPrice) => (hasPrice
      ? [' Price', ' & Specs', ' | Qor AI']
      : [' Specs', ' & Comparison', ' | Qor AI']),
    score: (s) => `Qor AI tech score ${s}/100. `,
    specs: (n) => `${n} technical specs. `,
    priceLine: (p) => `Price ${p}. `,
    tail: 'Compare prices across stores, see the AI tech score and similar models.',
  },
  tr: {
    titleParts: (hasPrice) => (hasPrice
      ? [' Fiyatı', ' ve Özellikleri', ' | Qor AI']
      : [' Özellikleri', ' ve Karşılaştırma', ' | Qor AI']),
    score: (s) => `Qor AI teknik skoru ${s}/100. `,
    specs: (n) => `${n} teknik özellik. `,
    priceLine: (p) => `Fiyatı ${p}. `,
    tail: 'Mağaza fiyatlarını karşılaştır, yapay zekâ teknik skorunu ve benzer modelleri gör.',
  },
};

// NOT: burada bir zamanlar ~22 terimlik elle yazilmis bir TR/DE spec etiket
// sozlugu vardi. Kaldirildi (2026-08-21): etiketler artik localizedKeySpecs()
// icinde admin/js/spec_i18n.js ile — site ve admin ile AYNI dosya — cevriliyor.
// Ikinci bir sozluk tutmak tam da bu dosyanin kacinmasi gereken sey: iki kopya
// ayrisir ve ayristigi gun kimse fark etmez.

function productSeo(d, label, keySpecs = null, lang = SEO_DEFAULT_LOCALE, price = null) {
  const tx = PROD_SEO_TEXT[lang] || PROD_SEO_TEXT[SEO_DEFAULT_LOCALE];
  const url = `${SITE}${localePrefix(lang)}${productPath(d)}`;
  const categoryUrl = `${SITE}${localePrefix(lang)}${categoryPath(d.category)}`;
  const score = Number(d.techScore) || 0;
  const specs = Number(d.specsCount) || 0;
  const img = /^https?:\/\//i.test(d.imageUrl || '') ? d.imageUrl : DEFAULT_IMG;
  // Ürün adı DİLE GÖRE — kaynak `name` Türkçedir, İngilizce/Almanca sayfada
  // Türkçe başlık göstermek tam da "İngilizce arıyorum Türkçe çıkıyor"
  // şikayetinin sebebiydi.
  const dispName = localizedName(d, lang);
  const title = fitTitle(dispName, tx.titleParts(!!price), 68);
  // Lead the description with a few REAL spec values so it is unique per product
  // and long enough (Bing flagged descriptions as too short + too templated).
  //
  // Etiketler ARTIK dile göre geliyor (localizedKeySpecs), bu yüzden buradaki
  // eski `specEtiket()` sözlüğü kaldırıldı: iki kat çeviri, temiz etiketi
  // yeniden bozuyordu.
  const rows = keySpecRows(keySpecs, 4);
  const specHi = rows.map(([k, v]) => `${k}: ${v}`).join(', ');
  const description = truncate(
    `${dispName}${d.brand ? ` (${d.brand})` : ''} — ${label}. `
    + `${price ? tx.priceLine(price.text) : ''}`
    + `${specHi ? `${specHi}. ` : ''}`
    + `${score ? tx.score(score) : ''}`
    + `${specs ? tx.specs(specs) : ''}`
    + tx.tail,
  );
  const webPage = {
    '@type': 'WebPage', '@id': `${url}#webpage`, url, name: title,
    isPartOf: { '@id': `${SITE}/#website` }, primaryImageOfPage: img,
  };
  const breadcrumb = {
    '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Qor AI', item: `${SITE}${localePrefix(lang)}/` },
      { '@type': 'ListItem', position: 2, name: label, item: categoryUrl },
      { '@type': 'ListItem', position: 3, name: dispName, item: url },
    ],
  };
  // Product+Offer YALNIZ gercek fiyat varken. Fiyatsiz Product dugumu Search
  // Console'da "invalid Product snippet" uretir ve hicbir sey kazandirmaz —
  // eski kodun bunu hic yaymamasinin gerekcesi buydu ve o gerekce fiyat verisi
  // yokken DOGRUYDU. Bugun (2026-08-21 olcumu) Typesense'te 35.752 urunun
  // fiyati var, dolayisiyla kosul artik "hic yayma" degil "fiyati olana yay".
  const graph = [webPage, breadcrumb];
  if (price) {
    graph.push({
      '@type': 'Product', '@id': `${url}#product`, name: dispName, url,
      // `description` ZORUNLU DEGIL ama Search Console "Satici girisleri"
      // (Merchant listings) raporunda EKSIK ALAN olarak bildiriliyor
      // (2026-08-22 uyarisi). Sayfanin meta aciklamasinin AYNISI kullaniliyor:
      // ikisi ayrisirsa yapisal veri sayfada gorunmeyen bir sey iddia eder.
      description,
      image: img, category: label,
      ...(d.brand ? { brand: { '@type': 'Brand', name: String(d.brand) } } : {}),
      ...(d.gtin ? { gtin: String(d.gtin) } : {}),
      ...(d.mpn ? { mpn: String(d.mpn) } : {}),
      offers: {
        '@type': 'Offer', url,
        price: String(price.amount),
        priceCurrency: price.currency,
        availability: 'https://schema.org/InStock',
        // Fiyat gecerliligi: fiyat hatti her gece kosuyor, ama Google'a
        // "yarina kadar gecerli" demek her gun yeniden tarama beklentisi
        // yaratir. 7 gun, gercek tazeleme araligiyla uyumlu ve dogrulanabilir.
        priceValidUntil: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
      },
    });
  }
  return {
    title, description, url, lang, image: img, imageAlt: dispName, type: 'product',
    jsonLd: { '@context': 'https://schema.org', '@graph': graph },
  };
}

function categoryPath(category) {
  const cat = String(category || '').trim().toLowerCase();
  return cat ? `/category/${cat}` : '';
}

// Real modification date or NOTHING. Defaulting to "today" stamped every URL
// with a fresh lastmod on every nightly run, which teaches Google/Bing that the
// site's lastmod is meaningless noise — they then ignore it and crawl stale.
// ÖN-RENDER İÇERİK SÜRÜMÜ — sitemap `lastmod`'unun tabanı.
//
// NEDEN VAR: `lastmod` şimdiye kadar YALNIZ ürün verisinin zaman damgasından
// üretiliyordu. Ama sayfanın gördüğü metin ürün verisi değişmeden de
// değişebiliyor: şablon, kopya, ya da 2026-08-05'teki gibi SAYFANIN DİLİ.
// O gün 7867 adresin tamamı Türkçeden İngilizceye döndü, buna rağmen
// sitemap'te yalnız 1582'sinde güncel tarih vardı; kalan ~6200 sayfa Google'a
// "temmuzdan beri değişmedim" diyordu ve yeniden taranmıyordu.
//
// Bu tarih, ön-render ÇIKTISI anlamlı biçimde değiştiğinde ELLE yükseltilir.
// Uydurma tazelik değildir: sayfa gerçekten o gün değişmiştir.
// 2026-08-21: başlık kurgusu (`…` kaldırıldı), spec etiketleri tek kaynaktan
// (admin/js/spec_i18n.js) çevriliyor, fiyatı olan ürünlerde gövdeye fiyat +
// Product/Offer şeması eklendi. Her sayfanın GÖRÜNEN metni değişti — uydurma
// tazelik değil, gerçek değişiklik.
// 2026-08-22: analiz sayfaları dil başına ayrı adrese ayrıldı
// (`/analiz/<slug>` + `/tr/analiz/<slug>`), hreflang artık gerçek alternatifi
// gösteriyor, gövde türe göre (ürün / link / abonelik) yazılıyor ve başlık ile
// açıklama admin'de üretilen meta'dan geliyor.
const SEO_CONTENT_VERSION = '2026-08-22';

function lastmodFromTs(value) {
  const n = Number(value) || 0;
  if (!n) return SEO_CONTENT_VERSION;
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return SEO_CONTENT_VERSION;
  const iso = d.toISOString().slice(0, 10);
  // Veri tarihi ile içerik sürümünden HANGİSİ YENİYSE o.
  return iso > SEO_CONTENT_VERSION ? iso : SEO_CONTENT_VERSION;
}

// Ham tarih string'leri (blog `updated` gibi) için aynı taban.
function lastmodAtLeastVersion(value) {
  const iso = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) && iso > SEO_CONTENT_VERSION ? iso : SEO_CONTENT_VERSION;
}

// Renders the <head> SEO block injected between the seo markers.
// LCP gorseli icin on-yukleme URL'i. SPA'nin GERCEKTEN isteyecegi varyanti
// uretmek ZORUNDA: og:image ham (oneksiz) URL'i tasiyor ama hem kart slotu hem
// urun hero'su `m_` varyantini istiyor. Yanlis varyanti preload etmek iki ayri
// indirme demek — yani duzeltmek yerine ISI BOZAR.
// TEK DOGRULUK KAYNAGI: web/src/lib/imageUrl.js -> epeyVariants().
// Burada yalnizca oradaki iki kural yansitiliyor; o dosya degisirse burasi da
// guncellenmeli.
function lcpVariant(url, slot) {
  const clean = String(url || '').trim();
  if (!/^https?:\/\//i.test(clean) || !/resim\.epey\.com|(^|\.)epey\.com/i.test(clean)) return '';
  // 2026-08-15: `full` slotu da ARTIK `m_` istiyor (bkz. imageUrl.js —
  // basamaklar baytla olculdu: master 1550 KB / b_ 488 KB / m_ 145 KB
  // ortalama). Onceden burasi `b_`ye, hatta onek tasimayan kayitlarda MASTER'a
  // cikiyordu; preload ile istemcinin istedigi dosya ayrisirsa sayfa IKI dosya
  // birden indirir, yani bu fonksiyon imageUrl.js ile HER ZAMAN ayni basamagi
  // vermek zorunda. Iki slot da ayni kurala dustugu icin dallanma kalkti.
  return clean
    .replace(/\/b_([^/?#]+)([?#].*)?$/i, '/m_$1$2')
    .replace(/\/s_([^/?#]+)([?#].*)?$/i, '/m_$1$2')
    .replace(/\/k_([^/?#]+)([?#].*)?$/i, '/m_$1$2')
    .replace(/(\/\d+\/)([^/?#]+)$/i, (m, folder, file) => (/^[a-z]_/i.test(file) ? m : `${folder}m_${file}`));
}


// ── Rota chunk'ini ONDEN yukle ──────────────────────────────────────────────
// Tembel rotalarda zincir suydu: index.js indi -> AYRISTI -> React lazy import'a
// ULASTI -> ancak O ZAMAN rota chunk'i istendi. Yani rota kodu, ana paket
// calisana kadar aga hic cikmiyordu. Olculdu (yavas 4G + 4x CPU): sayfanin
// lead paragrafi (LCP elemani) /subscriptions'ta 4828 ms'de boyaniyordu.
// modulepreload ile rota chunk'i ana paketle PARALEL iniyor.
// Dosya adlari hash'li oldugu icin vite manifest'inden okunuyor. Gece cron'u
// seo.mjs'i vite'siz kosuyor; o durumda manifest bir onceki build'e ait ve
// website/spa altindaki dosyalar da degismedigi icin dogru kalir.
let VITE_MANIFEST = null;
function manifest() {
  if (VITE_MANIFEST) return VITE_MANIFEST;
  const f = join(site, '.vite', 'manifest.json');
  try { VITE_MANIFEST = JSON.parse(readFileSync(f, 'utf8')); }
  catch { VITE_MANIFEST = {}; console.warn('[seo] vite manifest okunamadi — rota on-yuklemesi atlandi'); }
  return VITE_MANIFEST;
}
// Rota dizini -> kaynak dosya. Ana sayfa (dir '') EAGER, on-yukleme gerekmez.
const ROUTE_ENTRY = {
  search: 'src/pages/Search.jsx',
  category: 'src/pages/Category.jsx',
  product: 'src/pages/ProductDetail.jsx',
  compare: 'src/pages/Compare.jsx',
  'link-analysis': 'src/pages/LinkAnalysis.jsx',
  subscriptions: 'src/pages/Subscriptions.jsx',
  premium: 'src/pages/Premium.jsx',
  quiz: 'src/pages/Quiz.jsx',
  profile: 'src/pages/Profile.jsx',
  go: 'src/pages/Go.jsx',
  blog: 'src/pages/Blog.jsx',
  blogpost: 'src/pages/BlogPost.jsx',
  terms: 'src/pages/Legal.jsx', privacy: 'src/pages/Legal.jsx', refund: 'src/pages/Legal.jsx',
  cookies: 'src/pages/Legal.jsx', contact: 'src/pages/Legal.jsx', about: 'src/pages/Legal.jsx',
  faq: 'src/pages/Legal.jsx',
  'ai-chat': 'src/pages/AiChat.jsx',
};
// Rota chunk'inin DOLAYLI CSS'i de sayilir. Manifest girdisindeki `css` yalnizca
// o chunk'in KENDI stilini listeler; rota baska chunk'lari import ediyorsa
// onlarin CSS'i ancak rota chunk'i AYRISTIKTAN sonra kesfediliyor.
// Olculdu (2026-08-15, urun sayfasi, yavas 4G + 4x CPU): ilk dalga 1364 ms'de
// cikiyor, IKINCI CSS dalgasi (AiCharts, AiAnalysis, profileMatch, QuizFlow,
// Reviews) 3196 ms'de kesfediliyor ve React ancak 5076 ms'de boyuyordu. LCP
// gorseli 1782 ms'de HAZIRDI — yani darbogaz gorsel degil, gec kesfedilen bu
// stil dalgasiydi. Transitif yuruyus hepsini ilk dalgaya alir.
function routeCssAll(src, manifestObj, gorulen = new Set()) {
  const out = [];
  const yuru = (anahtar) => {
    if (!anahtar || gorulen.has(anahtar)) return;
    gorulen.add(anahtar);
    const e = manifestObj[anahtar];
    if (!e) return;
    for (const c of e.css || []) out.push(c);
    for (const imp of e.imports || []) yuru(imp);
  };
  yuru(src);
  return [...new Set(out)];
}

// Rota chunk'inin STATIK import grafigi (transitif). Girisin (index.html)
// kendi grafigi HARIC: vite onlari zaten index.html'e modulepreload olarak
// yaziyor, ikinci kez yazmak yalnizca gurultu olur.
function routeJsAll(src, manifestObj) {
  const girisSet = new Set();
  const yuruGiris = (anahtar) => {
    if (!anahtar || girisSet.has(anahtar)) return;
    girisSet.add(anahtar);
    for (const imp of manifestObj[anahtar]?.imports || []) yuruGiris(imp);
  };
  const giris = Object.keys(manifestObj).find((k) => manifestObj[k].isEntry);
  yuruGiris(giris);

  const out = [];
  const gorulen = new Set([src]);
  const yuru = (anahtar) => {
    if (!anahtar || gorulen.has(anahtar) || girisSet.has(anahtar)) return;
    gorulen.add(anahtar);
    const e = manifestObj[anahtar];
    if (!e) return;
    if (e.file) out.push(e.file);
    for (const imp of e.imports || []) yuru(imp);
  };
  for (const imp of manifestObj[src]?.imports || []) yuru(imp);
  return [...new Set(out)];
}

// Ana sayfanin LCP'si kabuk hero'sunun METNI (.qb-sub). Chrome tracing gosterdi
// ki FCP ile LCP arasindaki ~730 ms'in yalnizca ~50 ms'i ana is parcacigi:
// metin FCP'den 48 ms sonra ZATEN ekranda (yedek yuzle), ama Chrome onu LCP
// adayi saymiyor ve LCP tam `jakarta-400-latin-ext` bitis anina dusuyor
// (olculdu: -5140 ms ↔ -5140 ms). Fontlar satir ici @font-face'te tanimli ama
// yukleme ancak RENDER-BLOCKING harici CSS inince basliyordu (CSS bitis -6117
// ↔ font istegi -6107), yani ~430 ms bosuna bekleniyordu.
// Olculdu (yerel website/ agaci, gzip'li, Yavas 4G + 4x CPU, 8 kosu medyan):
//   mevcut 2420 ms -> tek preload 1672 ms   (TR)
//   mevcut 2452 ms -> tek preload 1680 ms   (EN)
// FCP bedeli +56 ms. Iki/dort font preload etmek DAHA KOTU (bant genisligi
// yarisi): ext x2 1740 ms, dort 1840 ms. YALNIZ ANA SAYFA: urun sayfasinda
// LCP bir GORSEL ve ayni preload orada 2972 -> 3052 ms KAYBETTIRIYOR.
// UYARI: bu olcumu gzip'siz yerel sunucuyla yaparsan sonuc TERSINE doner
// (preload kaybeder gibi gorunur) — sunucu sikistirmayi kapatma.
const HOME_FONT_PRELOAD = '<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/jakarta-400-latin-ext.woff2" crossorigin />';

function routePreloadTags(routeKey) {
  const src = ROUTE_ENTRY[routeKey];
  if (!src) return [];
  const m = manifest();
  const e = m[src];
  if (!e || !e.file) return [];
  const tags = [`<link rel="modulepreload" crossorigin fetchpriority="low" href="/${e.file}" />`];
  // Rota chunk'inin STATIK bagimliliklari da ilk dalgaya alinir. Chunk'in
  // KENDISI on-yuklense bile bagimliliklari ancak o chunk AYRISTIKTAN sonra
  // kesfediliyordu — yani ikinci bir seri dalga. Olculdu (2026-08-19, canli
  // urun sayfasi, 390x844 + 4x CPU + Yavas 4G, scripts/_urun_gecikme.mjs):
  //   ilk dalga     1367 → 2058 ms  (ProductDetail chunk'i)
  //   IKINCI dalga  3021 → 4091 ms  (pocketbase 11 KB, useAiAccess 31 KB,
  //                                  profileMatch 34 KB, offers, pbHistory …)
  //   urun verisi istegi ancak 4145 ms'de cikiyor, icerik 5722 ms'de boyaniyor.
  // Yani 1,1 sn'lik bu dalga, VERI istegini de kendisi kadar geciktiriyor.
  // YALNIZ `imports` yuruinur, `dynamicImports` DEGIL: ikincisi tembel yuklenen
  // (AiAnalysis, Reviews, AiCharts …) kod ve ilk boyamanin yolunda degil —
  // onlari da cekmek ilk dalganin bant genisligini bosuna boler.
  for (const f of routeJsAll(src, m)) tags.push(`<link rel="modulepreload" crossorigin fetchpriority="low" href="/${f}" />`);
  // Rota CSS'i: `as="style"` ile onden cekilir. Stylesheet olarak eklemek
  // render-blocking yapardi — amac tam tersi.
  for (const c of routeCssAll(src, m)) tags.push(`<link rel="preload" as="style" fetchpriority="low" href="/${c}" />`);
  return tags;
}

function seoBlock({ title, description, url, image = DEFAULT_IMG, imageAlt = title, type = 'website', noindex = false, jsonLd = null, alternates = null, preloadImage = '', routeKey = '' }) {
  const lines = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(url)}" />`,
    ...((alternates || []).map((alt) => `<link rel="alternate" hreflang="${esc(alt.hreflang)}" href="${esc(alt.href)}" />`)),
    `<meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'}" />`,
    `<meta property="og:type" content="${esc(type)}" />`,
    '<meta property="og:site_name" content="Qor AI" />',
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    // LCP gorseli: HTML ile BIRLIKTE inmeye baslar. Bu olmadan zincir
    // HTML -> JS -> Typesense -> render -> gorsel seklinde UC ardisik gidis-donus
    // oluyordu (olculdu: kategori LCP 9,5 sn / urun 7,5 sn, yavas 4G).
    ...(preloadImage ? [`<link rel="preload" as="image" href="${esc(preloadImage)}" fetchpriority="high" />`] : []),
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:alt" content="${esc(imageAlt)}" />`,
    `<meta property="og:url" content="${esc(url)}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
    `<meta name="twitter:image:alt" content="${esc(imageAlt)}" />`,
  ];
  if (jsonLd) {
    lines.push(`<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`);
  }
  return lines.join('\n  ');
}

// Crawlable body for the legal / policy / about / FAQ pages (privacy, terms,
// refund, cookies, contact, about, faq). Mirrors LegalPage's render
// (web/src/pages/Legal.jsx) from the SAME content source (legalContent.js), so
// the static HTML the AdSense reviewer + non-JS crawlers read is the FULL
// policy text — not the empty #root shell that got the site rejected twice.
// React wipes #root on mount, so real visitors still get the live SPA.
function legalBody(kind, lang = 'tr') {
  const copy = LEGAL_COPY[lang] || LEGAL_COPY.en;
  const meta = LEGAL_META[kind];
  if (!meta || !copy[kind]) return '';
  const common = copy.common;
  const [title, desc] = meta[lang] || meta.en;
  const sections = copy[kind];
  const toc = sections
    .map(([h], i) => `<a href="#s${i + 1}" style="color:#2563eb;text-decoration:none;margin:0 12px 6px 0;display:inline-block">${i + 1}. ${esc(h)}</a>`)
    .join('');
  const body = sections.map(([h, paras], i) =>
    `<section id="s${i + 1}" style="margin:22px 0">`
    + `<h2 style="font-size:20px;margin:0 0 8px">${esc(h)}</h2>`
    + paras.map((p) => `<p style="line-height:1.7;color:#334155;margin:8px 0">${esc(p)}</p>`).join('')
    + '</section>').join('');
  const related = ['terms', 'privacy', 'refund', 'cookies', 'about', 'faq', 'contact']
    .filter((k) => k !== kind && LEGAL_META[k])
    .map((k) => { const m = LEGAL_META[k]; const t = (m[lang] || m.en)[0]; return `<a href="${esc(m.path)}" style="color:#2563eb;margin:0 12px 6px 0;display:inline-block">${esc(t)}</a>`; })
    .join('');
  return '<main class="seo-prerender" style="max-width:880px;margin:0 auto;padding:24px 16px;font-family:\'Plus Jakarta Sans\',system-ui,sans-serif;color:#0f172a">'
    + `<nav style="font-size:13px;color:#64748b"><a href="/" style="color:#64748b">${esc(common.home)}</a> › ${esc(title)}</nav>`
    + `<h1 style="font-size:28px;margin:14px 0 6px">${esc(title)}</h1>`
    + `<p style="color:#475569;line-height:1.6">${esc(desc)}</p>`
    + `<p style="font-size:13px;color:#94a3b8;margin:6px 0 0">${esc(common.updated)}</p>`
    + `<div style="background:#f1f5f9;border-radius:12px;padding:14px 16px;margin:16px 0"><strong>Qor AI</strong><p style="line-height:1.7;color:#334155;margin:6px 0 0">${esc(common.legalBrand)}</p></div>`
    + (toc ? `<nav style="margin:16px 0;font-size:14px">${toc}</nav>` : '')
    + body
    + `<div style="margin:24px 0;font-size:14px"><strong>${esc(common.quickLinks)}:</strong><br/>${related}</div>`
    + `<p style="font-size:14px;margin:8px 0"><a href="mailto:${esc(common.email)}" style="color:#2563eb">${esc(common.contact)}: ${esc(common.email)}</a></p>`
    + '</main>';
}

// Crawlable homepage body: H1 + a real description of the service + an internal
// link grid to every category landing page and the main tools. Turns the root
// "/" from an empty SPA shell into a content-bearing hub — the first page the
// AdSense reviewer and Googlebot hit. React wipes #root on mount.
// Homepage prerender copy in both served languages (en=root, tr=/tr).
const HOME_TEXT = {
  tr: {
    h1: 'Qor AI — Yapay Zekâ Ürün Danışmanı',
    p1: 'Qor AI; telefon, laptop, ekran kartı, kulaklık, televizyon, akıllı saat ve PC bileşenlerinden dijital aboneliklere kadar binlerce ürünü yapay zekâ ile inceleyip karşılaştırmanı sağlayan bir alışveriş ve ürün karar asistanıdır. Ürünleri ara, yan yana karşılaştır, bir ürün linkini yapıştırıp anında AI analizini al, abonelikleri değerlendir ve sana en uygun seçeneği saniyeler içinde bul.',
    p2: 'Her üründe Qor AI teknik skoru, güncel fiyatlar, öne çıkan özellikler ve benzer modellerle karşılaştırma bir arada sunulur. Aşağıdan kategorilere göz at ya da bir aracı seç.',
    cats: 'Kategoriler', tools: 'Araçlar',
    toolLinks: [['/category', 'Tüm Kategoriler'], ['/subscriptions', 'Abonelik Karşılaştır'], ['/link-analysis', 'Link Analizi'], ['/ai-chat', 'Qor AI Sohbet'], ['/quiz', 'Kişisel Quiz'], ['/blog', 'Blog & Alım Rehberleri'], ['/premium', 'Premium'], ['/about', 'Hakkımızda']],
  },
  en: {
    h1: 'Qor AI — AI Product & Subscription Advisor',
    p1: 'Qor AI is a shopping and product-decision assistant that uses AI to research and compare thousands of products — phones, laptops, GPUs, headphones, TVs, smartwatches and PC components — as well as digital subscriptions. Search products, compare them side by side, paste a product link for an instant AI analysis, evaluate subscriptions and find the option that fits you best in seconds.',
    p2: 'Every product shows the Qor AI tech score, current prices, key features and a comparison with similar models. Browse the categories below or pick a tool.',
    cats: 'Categories', tools: 'Tools',
    toolLinks: [['/category', 'All categories'], ['/subscriptions', 'Compare subscriptions'], ['/link-analysis', 'Link analysis'], ['/ai-chat', 'Qor AI Chat'], ['/quiz', 'Personal quiz'], ['/blog', 'Blog & buying guides'], ['/premium', 'Premium'], ['/about', 'About']],
  },
};

function homeBody(guides, lang = 'tr') {
  const tx = HOME_TEXT[lang] || HOME_TEXT.tr;
  const cats = [...guides.keys()]
    .map((cat) => ({ href: categoryPath(cat), label: categoryLabel(cat, lang) }))
    .filter((c) => c.href && c.label)
    .sort((a, b) => a.label.localeCompare(b.label, lang));
  const catLinks = cats
    .map((c) => `<li style="margin:4px 0"><a href="${esc(c.href)}" style="color:#2563eb;text-decoration:none">${esc(c.label)}</a></li>`)
    .join('');
  const tools = tx.toolLinks
    .map(([h, t]) => `<li style="margin:4px 0"><a href="${h}" style="color:#2563eb;text-decoration:none">${esc(t)}</a></li>`).join('');
  return '<main class="seo-prerender" style="max-width:1000px;margin:0 auto;padding:24px 16px;font-family:\'Plus Jakarta Sans\',system-ui,sans-serif;color:#0f172a">'
    + `<h1 style="font-size:30px;margin:0 0 10px">${esc(tx.h1)}</h1>`
    + `<p style="line-height:1.7;color:#334155;max-width:760px">${esc(tx.p1)}</p>`
    + `<p style="line-height:1.7;color:#334155;max-width:760px">${esc(tx.p2)}</p>`
    + `<h2 style="font-size:20px;margin:24px 0 8px">${esc(tx.cats)}</h2>`
    + `<ul style="columns:2;-webkit-columns:2;list-style:none;padding:0;margin:0">${catLinks}</ul>`
    + `<h2 style="font-size:20px;margin:24px 0 8px">${esc(tx.tools)}</h2>`
    + `<ul style="list-style:none;padding:0;margin:0">${tools}</ul>`
    + '</main>';
}

// Shared category link grid (used by the homepage + the /category landing).
function categoryLinkGrid(guides, lang = 'tr') {
  const cats = [...guides.keys()]
    .map((cat) => ({ href: categoryPath(cat), label: categoryLabel(cat, lang) }))
    .filter((c) => c.href && c.label)
    .sort((a, b) => a.label.localeCompare(b.label, 'tr'));
  return '<ul style="columns:2;-webkit-columns:2;list-style:none;padding:0;margin:0">'
    + cats.map((c) => `<li style="margin:4px 0"><a href="${esc(c.href)}" style="color:#2563eb;text-decoration:none">${esc(c.label)}</a></li>`).join('')
    + '</ul>';
}

// Descriptive, crawlable bodies for the main navigable landing pages that
// otherwise ship an empty #root — i.e. every nav target a reviewer clicks
// (Kategoriler, Abonelikler, Link Analizi, Premium) plus AI Chat and Quiz. No
// nav destination should be a blank page. Accurate to CURRENT features only
// (no removed PC Builder). React wipes #root on mount.
const LANDING = {
  category: {
    h1: 'Kategoriler',
    paras: [
      'Qor AI kataloğundaki teknoloji ürünlerini kategoriye göre keşfet: telefonlar, laptoplar, ekran kartları, işlemciler, kulaklıklar, televizyonlar, akıllı saatler, monitörler, PC bileşenleri ve daha fazlası. Her kategoride yapay zekâ teknik skoru, güncel fiyatlar ve öne çıkan özellikler bir arada sunulur.',
      'Bir kategoriye gir, modelleri filtrele, yan yana karşılaştır ve sana en uygun olanı seç. Aşağıdaki kategorilerden başlayabilirsin.',
    ],
    grid: true,
    links: [['/', 'Ana Sayfa'], ['/blog', 'Blog & Alım Rehberleri']],
  },
  subscriptions: {
    h1: 'Abonelik Karşılaştırma',
    paras: [
      'Netflix, Spotify, YouTube Premium, Disney+, Amazon Prime, ChatGPT Plus, Game Pass ve daha fazla dijital aboneliği fiyat, içerik ve değer açısından yapay zekâ ile karşılaştır. Hangi platform sana daha çok değer sağlıyor, hangisi bütçene uygun — Qor AI yan yana gösterir.',
      'Müzik, dizi-film, oyun ve yapay zekâ aboneliklerini tek ekranda değerlendir; ihtiyacına en uygun paketi seç, gereksiz aboneliklerden kurtul.',
    ],
    links: [['/subscriptions', 'Abonelikleri karşılaştır'], ['/premium', 'Premium'], ['/blog', 'Rehberler']],
  },
  'link-analysis': {
    h1: 'Link Analizi',
    paras: [
      'Herhangi bir ürün bağlantısını yapıştır — Qor AI ürünü tanısın, özelliklerini çıkarsın, artılarını ve eksilerini özetlesin. Birden fazla linki aynı anda yapıştırıp ürünleri karşılaştırabilirsin.',
      'Mağaza sayfaları arasında kaybolmadan, bir ürünün gerçekten değer verip vermediğini yapay zekâ destekli analizle saniyeler içinde gör.',
    ],
    links: [['/link-analysis', 'Link analizine başla'], ['/category', 'Kategoriler'], ['/ai-chat', 'Qor AI Sohbet']],
  },
  premium: {
    h1: 'Premium',
    paras: [
      'Qor AI Premium, daha kapsamlı yapay zekâ kullanımı açar: Qor AI Sohbet, görsel tarayıcı, ürün AI analizi, link analizi, link karşılaştırma, abonelik analizi, premium öneriler ve genişletilmiş fiyat geçmişi.',
      'Güncel fiyatlar, deneme bilgisi ve plan ayrıntıları bu sayfada listelenir. Premium şu an yalnızca Google Play üzerinden satın alınabilir; web ödemeleri yakında eklenecek. İptal ve iade koşulları için İade Politikası\'na göz atabilirsin.',
    ],
    links: [['/premium', 'Premium planları'], ['/refund', 'İade Politikası'], ['/terms', 'Kullanım Koşulları']],
  },
  'ai-chat': {
    h1: 'Qor AI Sohbet',
    paras: [
      'Telefon, laptop, kulaklık ya da abonelik — aklındaki ürün sorusunu sor, Qor AI yapay zekâ danışmanından anında, tarafsız öneri al. "Bu bütçeye hangi laptop?", "Bu iki telefondan hangisi?" gibi soruları doğrudan sorabilirsin.',
      'Qor AI Sohbet bir araştırma asistanıdır; alternatifleri açıklar ve doğru soruları görünür kılar. Önemli özellik ve fiyatları satın almadan önce satıcı kaynağından doğrula.',
    ],
    links: [['/ai-chat', 'Sohbete başla'], ['/category', 'Kategoriler'], ['/quiz', 'Kişisel Quiz']],
  },
  quiz: {
    h1: 'Kişisel Quiz',
    paras: [
      'Birkaç soruyu yanıtla, Qor AI sana en uygun teknoloji ürününü önersin. Bütçeni, kullanım amacını ve önceliklerini belirt; yapay zekâ profiline göre kişiselleştirilmiş öneriler getirsin.',
      'Quiz, ne aradığından emin olmayanlar için hızlı bir başlangıç noktasıdır; sonrasında önerilen ürünleri karşılaştırıp inceleyebilirsin.',
    ],
    links: [['/quiz', 'Quizi başlat'], ['/category', 'Kategoriler'], ['/ai-chat', 'Qor AI Sohbet']],
  },
};

// en copy for the landing/feature pages (tr lives in LANDING above). Only h1 +
// paras + link labels are translated; hrefs are shared and get language-prefixed
// by localizeBodyLinks. Falls back to the tr entry if a key is missing.
const GRID_HEADING = { tr: 'Tüm kategoriler', en: 'All categories' };
const LANDING_I18N = {
  en: {
    category: {
      h1: 'Categories',
      paras: [
        'Explore the tech products in the Qor AI catalogue by category: phones, laptops, GPUs, CPUs, headphones, TVs, smartwatches, monitors, PC components and more. Each category combines the AI tech score, current prices and key features.',
        'Open a category, filter the models, compare them side by side and pick the one that fits you best. Start from the categories below.',
      ],
      links: [['/', 'Home'], ['/blog', 'Blog & buying guides']],
    },
    subscriptions: {
      h1: 'Subscription Comparison',
      paras: [
        'Compare Netflix, Spotify, YouTube Premium, Disney+, Amazon Prime, ChatGPT Plus, Game Pass and more digital subscriptions by price, content and value with AI. Which platform gives you the most value, which one fits your budget — Qor AI shows them side by side.',
        'Evaluate music, streaming, gaming and AI subscriptions on one screen, pick the plan that fits your needs and drop the ones you don’t use.',
      ],
      links: [['/subscriptions', 'Compare subscriptions'], ['/premium', 'Premium'], ['/blog', 'Guides']],
    },
    'link-analysis': {
      h1: 'Link Analysis',
      paras: [
        'Paste any product link — Qor AI identifies the product, extracts its specs and summarizes its pros and cons. Paste several links at once to compare products.',
        'Without getting lost across store pages, see in seconds whether a product is really worth it with AI-powered analysis.',
      ],
      links: [['/link-analysis', 'Start link analysis'], ['/category', 'Categories'], ['/ai-chat', 'Qor AI Chat']],
    },
    premium: {
      h1: 'Premium',
      paras: [
        'Qor AI Premium unlocks deeper AI use: Qor AI Chat, visual scanner, product AI analysis, link analysis, link comparison, subscription analysis, premium recommendations and extended price history.',
        'Current prices, trial details and plan information are listed on this page. Premium can currently be purchased only through Google Play; web payments are coming soon. See the Refund Policy for cancellation and refund terms.',
      ],
      links: [['/premium', 'Premium plans'], ['/refund', 'Refund Policy'], ['/terms', 'Terms of Use']],
    },
    'ai-chat': {
      h1: 'Qor AI Chat',
      paras: [
        'Phone, laptop, headphones or a subscription — ask your product question and get instant, unbiased advice from the Qor AI assistant. Ask things like “which laptop for this budget?” or “which of these two phones?”.',
        'Qor AI Chat is a research assistant; it explains the alternatives and surfaces the right questions. Verify key features and prices from the seller before buying.',
      ],
      links: [['/ai-chat', 'Start chatting'], ['/category', 'Categories'], ['/quiz', 'Personal quiz']],
    },
    quiz: {
      h1: 'Personal Quiz',
      paras: [
        'Answer a few questions and let Qor AI recommend the tech product that fits you best. State your budget, use case and priorities; the AI brings personalized recommendations based on your profile.',
        'The quiz is a quick starting point for anyone unsure what to look for; afterwards you can compare and review the recommended products.',
      ],
      links: [['/quiz', 'Start the quiz'], ['/category', 'Categories'], ['/ai-chat', 'Qor AI Chat']],
    },
  },
};

function landingBody(kind, guides, lang = 'tr') {
  const base = LANDING[kind];
  if (!base) return '';
  const tr = lang === 'tr' ? base : { ...base, ...((LANDING_I18N[lang] || {})[kind] || {}) };
  const paras = tr.paras.map((t) => `<p style="line-height:1.7;color:#334155;max-width:760px;margin:10px 0">${esc(t)}</p>`).join('');
  const grid = base.grid ? `<h2 style="font-size:20px;margin:24px 0 8px">${esc(GRID_HEADING[lang] || GRID_HEADING.tr)}</h2>${categoryLinkGrid(guides, lang)}` : '';
  const links = (tr.links && tr.links.length)
    ? `<p style="margin:18px 0;font-size:14px">${tr.links.map(([h, t]) => `<a href="${h}" style="color:#2563eb;margin-right:14px">${esc(t)}</a>`).join('')}</p>`
    : '';
  return '<main class="seo-prerender" style="max-width:980px;margin:0 auto;padding:24px 16px;font-family:\'Plus Jakarta Sans\',system-ui,sans-serif;color:#0f172a">'
    + `<h1 style="font-size:28px;margin:0 0 10px">${esc(tr.h1)}</h1>`
    + paras + grid + links
    + '</main>';
}


// ── Acilis kabugunun LCP blogu ──────────────────────────────────────────────
// Kabuk FCP'de (~1,7 sn) boyaniyor. Icerigi iskelet oldugunda LCP ADAYI yok:
// en buyuk icerik React mount + rota chunk'i bekliyor. Olculdu (/subscriptions,
// yavas 4G + 4x CPU): icerik 4211 ms'de DOM'a giriyor, LCP 5244 ms.
// Ana sayfada gercek hero'yu kabuga koymak LCP'yi 3932 -> 2488 yapmisti; ayni
// sey rota sayfalari icin de gecerli. FARK: her sayfa KENDI metnini tasir —
// ana sayfanin basligini 23 bin sayfaya kopyalamak "olcekli icerik" sinyali
// olurdu, o yuzden reddedilmisti.
// Metinler i18n'den OKUNUR, kopyalanmaz: iki yerde tutulsa ayrisir ve kabuk
// kalkarken kullanici metnin degistigini GORUR.
const T = (lang, key) => (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || '';
const BOOT_LANGS = ['en', 'tr'];

// Iskelet ROTA BICIMLI. Onceden her rota ayni uc kutuyu goruyordu (210 / 52 /
// 150 px) ve o uc kutu ekranin yalnizca ust yarisini kapliyordu; gerisi bos
// zemindi. Olculdu (2026-08-19, scripts/_mobil_bosluk.mjs, canli, 390x844 +
// 4x CPU + Yavas 4G, YUKLENIRKEN kaydirma): urun sayfasinda 517 karenin 38'i,
// compare'de 417 karenin 25'i "icerikli blok orani < %1,5", yani EKRAN BOS.
// Iskeletin gercek yerlesimi taklit etmesi hem beklemeyi okunur kilar hem de
// icerik gelince gozun aradigi seyi ayni yerde bulmasini saglar.
// Kabuk `position:fixed` — bu dugumler yerlesime girmez, CLS uretmez.
function bootSkeleton(routeKey = '') {
  const sk = (h, w, r) => `<div class="qb-sk" style="height:${h}px${w ? `;width:${w}` : ''}${r ? `;border-radius:${r}` : ''}"></div>`;
  if (routeKey === 'product') {
    return '<div class="qb-skel">'
      + sk(12, '46%')                                   // kirinti yolu
      + sk(300)                                         // hero gorseli
      + sk(24, '88%') + sk(24, '54%')                   // urun adi (iki satir)
      + `<div class="qb-row">${sk(30, '', '999px')}${sk(30, '', '999px')}${sk(30, '', '999px')}</div>`
      + `<div class="qb-row">${sk(40, '', '12px')}${sk(40, '', '12px')}</div>`   // Karsilastir / Analiz Et
      + sk(16, '72%') + sk(16, '90%') + sk(16, '64%') + sk(16, '82%')            // spec satirlari
      + '</div>';
  }
  if (routeKey === 'compare') {
    return '<div class="qb-skel">'
      + sk(26, '58%')
      + `<div class="qb-row">${sk(190)}${sk(190)}</div>`
      + sk(18, '40%')
      + sk(22, '94%') + sk(22, '94%') + sk(22, '94%') + sk(22, '94%') + sk(22, '94%')
      + '</div>';
  }
  return '<div class="qb-skel">'
    + sk(210)
    + sk(52, '', '999px')
    + sk(150) + '</div>';
}

// PageHero'nun (subscriptions / link-analysis / premium) kabuk karsiligi.
function pageHeroBlock(lang, kicker, title, accent, after, lead) {
  // Siniflar KABUGA OZEL (qb-*). Onceden gercek sayfanin siniflari
  // (.page-hero, .page-hero-inner...) kullaniliyordu ve ROTA CSS'i sonradan
  // inince KABUGUN KENDI dugumlerini yeniden bicimlendirip oynatiyordu —
  // olculen CLS'in kaynagi buydu (0.007-0.015). Kendi adlarini kullanan kabuga
  // hicbir rota CSS'i dokunamaz, dolayisiyla gec gelen stil onu kimildatamaz.
  return `<div class="qb-hero" data-l="${lang}"><section class="qb-ph">`
    + '<div class="container qb-ph-inner">'
    + (kicker ? `<span class="qb-kicker">${esc(kicker)}</span>` : '')
    + `<div class="qb-ph-title">${esc(title)}${accent ? `<span class="qb-accent">${esc(accent)}</span>` : ''}${esc(after || '')}</div>`
    + `<p class="qb-lead">${esc(lead)}</p>`
    + '</div></section></div>';
}

// Kategori sayfasinin kendi basligi (.cat-hero).
function catHeroBlock(lang, label) {
  return `<div class="qb-hero" data-l="${lang}"><div class="qb-cat"><div class="container">`
    + `<div class="qb-cat-title">${esc(label)}</div>`
    + `<p class="qb-cat-sub">${esc(T(lang, 'catalog.subtitle'))}</p>`
    + '</div></div></div>';
}

// routeKey -> uc dilde kabuk hero'su. Bos donerse iskelet kullanilir.
function bootHero(routeKey, extra = {}) {
  if (routeKey === 'subscriptions') {
    return BOOT_LANGS.map((l) => pageHeroBlock(l, T(l, 'subs.heroKicker'), T(l, 'subs.heroTitle'),
      T(l, 'subs.heroAccent'), T(l, 'subs.heroTitleAfter'), T(l, 'subs.heroLead'))).join('');
  }
  if (routeKey === 'link-analysis') {
    return BOOT_LANGS.map((l) => pageHeroBlock(l, T(l, 'la.heroKicker'), T(l, 'la.heroTitle'),
      T(l, 'la.heroAccent'), T(l, 'la.heroTitleAfter'), T(l, 'la.heroLead'))).join('');
  }
  if (routeKey === 'category' && extra.labels) {
    return BOOT_LANGS.map((l) => catHeroBlock(l, extra.labels[l] || extra.labels.en || '')).join('');
  }
  return '';
}

function renderPage(template, seo, bodyHtml) {
  // Function replacers, not string replacers: product names flow into the SEO
  // block and body, and a literal "$&"/"$1" in a name would otherwise be
  // interpreted as a String.replace special pattern and corrupt the output.
  const block = `<!-- seo:start -->\n  ${seoBlock(seo)}\n  <!-- seo:end -->`;
  let out = template.replace(/<!-- seo:start -->[\s\S]*?<!-- seo:end -->/, () => block);
  // <html lang> HER ZAMAN sayfanin kendi dili olur -- KOSULSUZ.
  //
  // Eskiden `if (lang !== 'tr')` diye bir kapi vardi; varsayim "sablon zaten
  // lang=tr" idi. Ama sablon `web/index.html` DEGIL, vite ciktisi
  // `website/index.html`; seo.mjs Ingilizce KOK sayfayi tam oraya yaziyor ve
  // ondan sonra uretilen TURKCE sayfalar lang="en" miras aliyor. Olculdu
  // 2026-09-01: website/tr/index.html -> <html lang="en"> (basligi ve
  // canonical'i Turkce oldugu halde). JS calistirmayan bir bot Turkce govdeyi
  // lang="en" altinda goruyordu.
  //
  // Kapi kaldirildi: uretim sirasina ve sablonun o anki haline bakilmaksizin
  // her sayfa kendi dilini ilan eder.
  const lang = seo.lang || SEO_DEFAULT_LOCALE;
  out = out.replace(/<html lang="[a-z-]+"/i, () => `<html lang="${lang}"`);
  if (bodyHtml) out = out.replace('<div id="root"></div>', () => `<div id="root">${bodyHtml}</div>`);
  // Acilis kabugundaki hero metni YALNIZCA ana sayfada kalir. Sablonda duruyor
  // cunku kabuk statik; diger rotalarda buradan SILINIR. Aksi halde ana
  // sayfanin uc dildeki basligi 23 bin sayfaya kopyalanir — bu sitenin daha
  // once yandigi "olcekli/kopya icerik" sinyalinin ta kendisi. Silinince kabuk
  // notr iskelete duser (.qb-skel).
  // Kabuktaki LCP blogu: ana sayfa sablondaki kendi hero'sunu KORUR; diger
  // rotalar kendi hero'suyla degistirilir; geri kalanlar iskelete duser.
  if (seo.isHome) {
    // Ana sayfanin hero'su sablonda duruyor (metni Home.jsx'te satir ici, i18n
    // anahtari yok). Yalnizca iskeleti cikar: aksi halde hero'nun ALTINDA bos
    // iskelet cubuklari da cizilir.
    out = out.replace(/<div class="qb-skel">[\s\S]*?<\/div>\s*<!--\/qb-hero-->/, '<!--/qb-hero-->');
    // LCP fontu, satir ici @font-face blogunun HEMEN ONUNE. Sablon bir onceki
    // kosunun ciktisi olabildigi icin iki kez eklenmemeli.
    if (!out.includes(HOME_FONT_PRELOAD)) {
      out = out.replace('  <style>', () => `  ${HOME_FONT_PRELOAD}\n  <style>`);
    }
  } else {
    const blok = bootHero(seo.routeKey || '', seo.bootExtra || {}) || bootSkeleton(seo.routeKey || '');
    out = out.replace(/<!--qb-hero-->[\s\S]*?<!--\/qb-hero-->/, () => `<!--qb-hero-->${blok}<!--/qb-hero-->`);
  }
  // Rota on-yuklemesi head'in EN SONUNA, yani vite'in giris modulunden SONRA.
  // Ilk denemede seo blogunun icindeydi (head'in basi) ve OLCUM ONCELIK
  // TERSLENMESI gosterdi: rota chunk'i 1585 ms'de indi ama ona BAGIMLI olan
  // vendor+index 2366 ms'e itildi — yani on-yukleme LCP'yi iyilestirmek yerine
  // kotulestiriyordu. Ayrica fetchpriority=low: bos bant genisligini kullansin,
  // kritik paketin onune gecmesin.
  const rp = routePreloadTags(seo.routeKey || '');
  if (rp.length) out = out.replace('</head>', () => `  ${rp.join('\n  ')}\n</head>`);
  // Rotaya ozel head icerigi (bugun yalnizca /analiz listesinin TOHUMU).
  // #root govdesine DOKUNMAZ: seo-audit'in siniri `</div>` ile ilk <script>
  // arasidir, bu blok ise head'de duruyor.
  if (seo.headExtra) out = out.replace('</head>', () => `  ${seo.headExtra}\n</head>`);
  return out;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function writeTextFile(file, body, { optional = false } = {}) {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  let lastErr = null;
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    try {
      writeFileSync(tmp, body);
      // HEDEFI ONCEDEN SILME. Eskiden burada `rmSync(file)` vardi ve
      // arkasindan `rename` geliyordu: rename kilide takilirsa dosya ARTIK
      // YOKTU. Olculdu 2026-08-29 — ana sayfa boyle kaybolunca 403 supurmesi
      // yerine bos noindex kabuk yazdi ve build denetimde durdu. `rename`
      // Windows'ta da var olan dosyanin USTUNE yazar (MoveFileEx replace);
      // silme yalnizca rename gercekten reddedilirse, SON CARE olarak.
      try {
        renameSync(tmp, file);
      } catch (renameErr) {
        if (!['EEXIST', 'EPERM', 'EACCES'].includes(renameErr?.code)) throw renameErr;
        rmSync(file, { force: true });
        renameSync(tmp, file);
      }
      return true;
    } catch (err) {
      lastErr = err;
      try { rmSync(tmp, { force: true }); } catch (_) {}
      if (!['UNKNOWN', 'EPERM', 'EBUSY', 'EACCES'].includes(err?.code) || attempt === 8) break;
      sleepSync(80 * attempt);
    }
  }
  if (optional) {
    console.warn(`[seo] skipped locked file ${file}: ${lastErr?.message || lastErr}`);
    return false;
  }
  throw lastErr;
}

function writeHtml(routeDir, html) {
  const dir = routeDir ? join(site, routeDir) : site;
  mkdirSync(dir, { recursive: true });
  writeTextFile(join(dir, 'index.html'), html);
}

// ── Typesense: pull the whole catalogue ─────────────────────────
async function fetchAllProducts() {
  const perPage = 250;
  const fields = 'id,name,slug,brand,category,subcategory,imageUrl,techScore,trendScore,lowestPriceUSD,specsCount,screenSizeValue,batteryCapacityValue,weightValueKg,updatedAtTs,scrapedAtTs';
  // Katalog ~430 sayfada cekiliyor. Tek bir sayfanin gecici olarak dusmesi TUM
  // build'i iptal ediyordu — ve prebuild website/'i coktan bosalttigi icin geriye
  // gutted bir agac kaliyordu. 2026-08-15: Hetzner'a giden yol %40 paket kaybina
  // dustu; kapiyi gecen (3/3 agir sorgu) bir kosu bile sayfalama ortasinda
  // oluyordu. Yuzlerce ardisik istekte tek seferlik hata KACINILMAZ, dolayisiyla
  // dogru davranis "yeniden dene", "pes et" degil.
  const page = async (p) => {
    const qs = new URLSearchParams({
      q: '*', query_by: 'name', sort_by: 'techScore:desc',
      per_page: String(perPage), page: String(p), include_fields: fields,
    });
    const url = `${TS_URL}/collections/${TS_COLLECTION}/documents/search?${qs}`;
    let son = null;
    for (let deneme = 1; deneme <= 5; deneme += 1) {
      try {
        const ctrl = new AbortController();
        const to = setTimeout(() => ctrl.abort(), 45000);
        try {
          const res = await fetch(url, { headers: { 'X-TYPESENSE-API-KEY': TS_KEY }, signal: ctrl.signal });
          if (!res.ok) throw new Error(`Typesense ${res.status}`);
          return await res.json();
        } finally { clearTimeout(to); }
      } catch (err) {
        son = err;
        if (deneme === 5) break;
        // Artan bekleme: 1,5 / 3 / 6 / 12 sn. Yol dalgali oldugu icin beklemek
        // tekrar denemekten daha etkili.
        await new Promise((r) => setTimeout(r, 1500 * (2 ** (deneme - 1))));
      }
    }
    throw new Error(`sayfa ${p} 5 denemede alinamadi: ${son?.message || son}`);
  };

  const first = await page(1);
  const total = first.found || 0;
  const out = (first.hits || []).map((h) => h.document);
  const lastPage = Math.ceil(total / perPage);
  for (let p = 2; p <= lastPage; p += 1) {
    const res = await page(p);
    (res.hits || []).forEach((h) => out.push(h.document));
  }
  return out;
}

// The clean labeled keySpecs map lives ONLY inside `_raw` (a ~25-70 KB blob per
// doc), so we never pull it for the whole 106k catalogue. Instead we fetch `_raw`
// just for the ~few-thousand CURATED products that get a static shell, in id
// batches, and return id → keySpecs. This is what upgrades each product page from
// a thin near-duplicate template to a page with real, unique spec content.
// Bir ürünün ham kaydını alır, İSTENEN DİLDE temiz {etiket: değer} döner.
//
// Çeviriyi admin/js/spec_i18n.js yapar (site ve admin ile aynı dosya). Buradaki
// tek ek iş ARTIK KALMASI GEREKMEYEN satırları elemek: sözlükte karşılığı
// bulunamayan bir etiket olduğu gibi geçiyordu ve İngilizce sayfada Türkçe
// olarak görünüyordu. KURAL: yarım çevrilmiş satırı yazma, satırı hiç yazma —
// eksik spec, yanlış dildeki spec'ten iyidir.
//
// TR için ayrı bir eleme YOK: `multiLangSections.tr` zaten temiz kaynak ve
// ölçüldüğünde İngilizce izi %0,1'di. Oraya bir tahmin sezgisi yazmak yerine
// seo-audit.mjs'e kapı koyduk; sızıntı olursa build kırılır ve veriyle öğreniriz.
function localizedKeySpecs(raw, lang, limit = 16) {
  if (!raw || typeof raw !== 'object') return {};
  // SPEC DİLİ ≠ SAYFA DİLİ. Almanca spec üretilmiyor (specs yalnız TR+EN
  // tutuluyor), Almanca arayüz onları İNGİLİZCE okur. Site bunu zaten böyle
  // yapıyor — bkz. web/src/pages/ProductDetail.jsx:369. Ön-render bu kuralı
  // bilmiyordu ve `de` isteyince spec_i18n çevirecek sözlük bulamayıp KAYNAK
  // TÜRKÇEYİ olduğu gibi döndürüyordu: ölçüldü, öneksiz ürün sayfalarının
  // %100'ünde "Islak Mop: Var, Su Haznesi: 70 ml" gibi ham Türkçe vardı.
  const specLang = lang === 'tr' ? 'tr' : 'en';
  let model;
  try { model = SPEC_I18N.localizeProduct(raw, specLang, {}); } catch (_) { return {}; }
  if (!model) return {};
  const sourceLang = String(model.sourceLang || 'tr').toLowerCase();
  const needsResidueGuard = specLang !== sourceLang;
  const kirli = (translated, source) => {
    if (!needsResidueGuard) return false;
    try { return !!SPEC_I18N.translationHasTurkishResidue(specLang, String(translated), String(source || '')); } catch (_) { return false; }
  };

  const out = {};
  const ekle = (rows) => {
    if (!rows || typeof rows !== 'object') return;
    for (const [k, v] of Object.entries(rows)) {
      if (Object.keys(out).length >= limit) return;
      const label = String(k == null ? '' : k).replace(/\s+/g, ' ').trim();
      const value = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
      if (!label || !value || label.length > 48 || value.length > 64) continue;
      if (out[label]) continue;
      if (kirli(label, label) || kirli(value, value)) continue;
      out[label] = value;
    }
  };

  ekle(model.keySpecs);
  // Öne çıkanlar bloğu eleme sonrası çok inceldiyse bölüm ağacından tamamla —
  // aksi halde sözlüğü zayıf kategorilerde sayfa spec'siz kalırdı.
  if (Object.keys(out).length < 3 && model.sections && typeof model.sections === 'object') {
    for (const rows of Object.values(model.sections)) ekle(rows);
  }
  return out;
}

async function fetchKeySpecsByIds(ids) {
  const byId = new Map();
  const BATCH = 90;
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH).filter(Boolean);
    if (!slice.length) continue;
    const qs = new URLSearchParams({
      q: '*', query_by: 'name',
      filter_by: `id:[${slice.join(',')}]`,
      per_page: String(slice.length), include_fields: 'id,_raw',
    });
    // ZAMAN AŞIMI ŞART: katalog sayfalamasının aksine bu çağrının hiç sınırı
    // yoktu. Hetzner'a giden yol paket kaybına düştüğünde asılı bir soket
    // burada SÜRESİZ bekler ve gece koşusu hiç bitmez — hata da vermez, ki
    // teşhisi en zor olan bu. 45 sn, katalog sayfalamasıyla aynı sınır.
    let res;
    try {
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 45000);
      try {
        res = await fetch(
          `${TS_URL}/collections/${TS_COLLECTION}/documents/search?${qs}`,
          { headers: { 'X-TYPESENSE-API-KEY': TS_KEY }, signal: ctrl.signal },
        );
      } finally { clearTimeout(to); }
    } catch (_) { continue; }
    if (!res || !res.ok) continue;
    let j;
    try { j = await res.json(); } catch (_) { continue; }
    for (const h of (j.hits || [])) {
      const doc = h.document || {};
      if (!doc.id || !doc._raw) continue;
      try {
        const raw = JSON.parse(doc._raw);
        // Spec'leri BURADA, `_raw` elimizdeyken dile göre çeviriyoruz; ham blob
        // saklanmıyor. 6.374 ürün × ~25-70 KB `_raw` bellekte tutulsaydı tek
        // başına ~300 MB ederdi ve bu makinede (4 GB, swap zaten dolu) build'i
        // öldürürdü. Çıktı ürün başına birkaç yüz bayt.
        // Spec YALNIZ iki dilde var: tr ve en. Almanca sayfa İngilizce spec
        // gösteriyor (localizedKeySpecs içindeki specLang kuralı), yani `de`
        // için ayrıca hesaplamak birebir aynı sonucu üretip işi %50 artırırdı.
        // 6.374 ürün × 60-150 spec × regex ağırlıklı normalizasyon, 2 vCPU'lu
        // gece koşusunda ölçülebilir bir yük.
        const trKs = localizedKeySpecs(raw, 'tr');
        const enKs = localizedKeySpecs(raw, 'en');
        const perLang = {};
        for (const lang of SEO_LOCALES) perLang[lang] = (lang === 'tr' ? trKs : enKs);
        if (SEO_LOCALES.some((l) => perLang[l] && Object.keys(perLang[l]).length)) {
          byId.set(doc.id, { ks: perLang, prices: (raw && raw.prices) || null });
        } else if (raw && raw.prices) {
          byId.set(doc.id, { ks: perLang, prices: raw.prices });
        }
        // ÜRÜN ADININ ÇEVİRİSİ — 2026-08-07.
        // `name` alanı Epey'den geldiği için TÜRKÇE ("… Bilgisayar Kasası") ve
        // ön-render üç dilde de onu basıyordu: İngilizce arayan kullanıcı
        // Google'da Türkçe başlık görüyordu. Çeviri zaten veride var
        // (`nameTranslated.en`), ama yalnız `_raw` içinde — Typesense'te üst
        // seviye alan değil. Zaten burada `_raw` çekiliyor, adı da alıyoruz.
        // Web istemcisi (lib/productNames.js displayProductName) aynı alanı
        // kullanıyor; böylece ön-render ile SPA aynı adı gösterir.
        const nt = raw && raw.nameTranslated;
        if (nt && typeof nt === 'object') nameById.set(doc.id, nt);
      } catch (_) {}
    }
  }
  return byId;
}

// Ürünün BİR DİLDEKİ görünen adı. Almanca ad üretilmiyor (specs yalnız TR+EN
// tutuluyor) → de, en'e düşer; en yoksa kaynak ad (Türkçe) kalır.
const nameById = new Map();
function localizedName(d, lang) {
  const nt = nameById.get(d?.id);
  const pick = (code) => {
    const v = nt && nt[code];
    return v && String(v).trim() ? String(v).trim() : '';
  };
  // SATICI SKU KODU BURADA DA TEMIZLENIR. Once yalniz istemci temizliyordu,
  // yani /product/<slug> ON-RENDER'inda <title> ve <h1> hala
  // "... Monitor (69D0GACBTK)" diyordu: Google kodlu basligi indeksliyor,
  // ziyaretci ise temiz adi goruyordu. Ayni ayrisma sinifi bu projede
  // karsilastirma raporunda da yasandi — on-render ile SPA ayni metni
  // gostermek ZORUNDA.
  const ham = lang === 'tr'
    ? (pick('tr') || String(d?.name || ''))
    : (pick('en') || String(d?.name || ''));
  return cleanProductName(ham) || ham;
}

// ── Static routes ───────────────────────────────────────────────
const STATIC_ROUTES = [
  {
    dir: '', path: '/', changefreq: 'daily', priority: '1.0',
    seo: {
      title: 'Qor AI — Yapay Zekâ Ürün Danışmanı',
      description: 'Teknoloji ürünlerini ve dijital abonelikleri yapay zekâ ile keşfet, karşılaştır ve karar ver. Telefonlar, laptoplar, GPU\'lar ve daha fazlası — Qor AI ile analiz edildi.',
      type: 'website',
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Organization', '@id': `${SITE}/#organization`, name: 'Qor AI', url: `${SITE}/`, logo: DEFAULT_IMG,
            description: 'Yapay zekâ destekli ürün ve dijital abonelik danışmanı.',
            // sameAs = markanin DOGRULANMIS diger profilleri. Google bunlari
            // ayni varliga baglar (knowledge panel / marka sinyali). Footer'daki
            // rel="me" baglantilariyla ayni liste olmali — biri degisirse
            // digerini de guncelle (components/Footer.jsx -> SOSYAL).
            sameAs: [
              'https://play.google.com/store/apps/details?id=com.compair.app',
              'https://www.tiktok.com/@qorai.net',
              'https://www.youtube.com/@qorainet',
              'https://www.instagram.com/qorainet/',
            ],
          },
          {
            '@type': 'WebSite', '@id': `${SITE}/#website`, name: 'Qor AI', url: `${SITE}/`,
            publisher: { '@id': `${SITE}/#organization` },
            potentialAction: {
              '@type': 'SearchAction',
              // Arama artik kendi rotasinda (/search). Ana sayfadaki `?q=`
              // destegi geriye donuk uyumluluk icin duruyor ama kanonik
              // arama girisi burasi.
              target: `${SITE}/search?q={search_term_string}`,
              'query-input': 'required name=search_term_string',
            },
          },
          {
            // Declares Qor AI to Google as an AI-powered product-analysis app (not
            // just another listing site). Every feature below is real and visible
            // in the live UI, so this is an honest machine-readable declaration —
            // not cloaking. This is the strongest signal that the site IS an AI tool.
            '@type': 'WebApplication', '@id': `${SITE}/#webapp`, name: 'Qor AI',
            url: `${SITE}/`, applicationCategory: 'ShoppingApplication',
            operatingSystem: 'Web, Android', inLanguage: ['tr', 'en'],
            description: 'Teknoloji ürünlerini ve dijital abonelikleri yapay zekâ ile '
              + 'analiz eden, karşılaştıran ve kişiye özel öneren AI ürün danışmanı.',
            featureList: [
              'Yapay zekâ ürün analizi',
              'Yapay zekâ ile ürün karşılaştırma',
              'Ürün linki analizi — linki yapıştır, AI tanısın ve analiz etsin',
              'Dijital abonelik karşılaştırma (Netflix, Spotify, YouTube Premium…)',
              'AI teknik skoru (0–100)',
              'Kişiye özel ürün önerisi',
              'AI sohbet danışmanı',
            ],
            publisher: { '@id': `${SITE}/#organization` },
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          },
        ],
      },
    },
  },
  {
    dir: 'category', path: '/category', changefreq: 'daily', priority: '0.9',
    seo: {
      title: 'Tüm Teknoloji Kategorileri — Karşılaştır ve Keşfet | Qor AI',
      description: 'Akıllı telefon, laptop, ekran kartı, kulaklık ve TV dahil 40+ kategoride AI puanlı ürünleri keşfet; marka, fiyat ve özellik filtreleriyle yan yana karşılaştır.',
    },
  },
  {
    // `/compare` KABUĞU ŞART — yoksa sayfa 403 veriyordu.
    // website/compare/ dizini 1288 ön-render karşılaştırma sayfası tutuyor ama
    // dizinin KENDİ index.html'i yoktu. nginx bu durumda `/compare` isteğini
    // `/compare/`ye 301'liyor, orada da dizin listeleme kapalı olduğu için
    // 403 Forbidden dönüyordu. Yani karşılaştırma ekranında SAYFA YENİLEMEK
    // ya da adresi doğrudan açmak her seferinde 403'tü; SPA içi gezinmede
    // sorun görünmediği için gözden kaçmıştı. Diğer tüm rotaların (category,
    // product, blog…) kabuğu vardı, yalnız compare atlanmıştı.
    // Ürünsüz `/compare` boş bir seçim ekranıdır → noindex, sitemap dışı.
    dir: 'compare', path: '/compare', sitemap: false, noindex: true,
    seo: {
      title: 'Ürün Karşılaştır — Qor AI',
      description: 'Ürünleri yan yana karşılaştır: teknik skor, özellikler ve güncel fiyatlar tek ekranda.',
      noindex: true,
    },
  },
  {
    // `/product` (id'siz) yalnızca derin-link geri dönüşü için duran BOŞ bir
    // kabuktur — hiçbir içerik render etmez. sitemap'te değildi ama noindex de
    // almıyordu; Google dış bir linkle bulursa BOŞ sayfa indeksliyordu
    // (AdSense "düşük değerli içerik" sinyali). Artık noindex.
    dir: 'product', path: '/product', sitemap: false, noindex: true,
    seo: {
      title: 'Ürün özellikleri ve karşılaştırma — Qor AI',
      description: 'Qor AI ürün detay sayfası. Ürün özelliklerini, teknik skoru, görselleri ve karşılaştırma seçeneklerini incele.',
      noindex: true,
    },
  },
  {
    // `/search` KABUGU SART: rota SPA'da var ama ön-render kabuğu olmadan
    // adresi doğrudan açmak / sayfayı yenilemek / paylaşılan bir arama
    // bağlantısına tıklamak 404 verirdi (nginx yalnız var olan dizinleri
    // servis ediyor — `/compare` ile birebir aynı tuzak).
    // İç arama sonuçları noindex + sitemap dışı: Google iç arama sonuç
    // sayfalarını açıkça "düşük değerli" sayar ve AdSense geçmişi
    // (4 red, "düşük değerli içerik") bunu indexe açmayı doğrudan zarar yapar.
    dir: 'search', path: '/search', sitemap: false, noindex: true,
    seo: {
      title: 'Ürün Ara — Qor AI',
      description: 'Qor AI kataloğunda yapay zekâ puanlı teknoloji ürünlerini ara; özellikleri, puanları ve güncel fiyatları karşılaştır.',
      noindex: true,
    },
  },
  {
    dir: 'link-analysis', path: '/link-analysis', changefreq: 'weekly', priority: '0.8',
    seo: {
      title: 'Link Analizi — Linki Yapıştır, Yapay Zekâ Analiz Etsin | Qor AI',
      description: 'Herhangi bir ürün bağlantısını yapıştır: Qor AI ürünü tanır, teknik özelliklerini çıkarır, artı ve eksilerini özetler. Birden fazla linki aynı anda karşılaştır.',
    },
  },
  {
    dir: 'subscriptions', path: '/subscriptions', changefreq: 'weekly', priority: '0.8',
    seo: {
      title: 'Abonelik Karşılaştırma — Netflix, Spotify, YouTube | Qor AI',
      description: 'Netflix, Spotify, YouTube Premium, Disney+, Game Pass ve ChatGPT Plus aboneliklerini fiyat, içerik ve değer açısından yapay zekâ ile yan yana karşılaştır.',
    },
  },
  {
    dir: 'premium', path: '/premium', changefreq: 'weekly', priority: '0.8',
    seo: {
      title: 'Qor AI Premium — Fiyatlar, Planlar ve Premium Özellikler',
      description: 'Qor AI Premium ile daha kapsamlı yapay zekâ: AI sohbet, görsel tarayıcı, ürün ve link analizi, abonelik analizi, premium öneriler ve genişletilmiş fiyat geçmişi.',
    },
  },
  {
    dir: 'terms', path: '/terms', changefreq: 'monthly', priority: '0.5',
    seo: {
      title: 'Kullanım Koşulları — Qor AI',
      description: 'Qor AI kullanım koşulları: Premium abonelikler, AI çıktıları, kabul edilebilir kullanım, iptal, hesap silme, ödeme ve hizmet sınırları.',
    },
  },
  {
    dir: 'privacy', path: '/privacy', changefreq: 'monthly', priority: '0.5',
    seo: {
      title: 'Gizlilik Politikası — Qor AI',
      description: 'Qor AI gizlilik politikası: hesap verileri, AI girdileri, ödeme ve abonelik verileri, hesap silme, çerezler, saklama ve kullanıcı hakları.',
    },
  },
  {
    dir: 'refund', path: '/refund', changefreq: 'monthly', priority: '0.5',
    seo: {
      title: 'İade Politikası — Qor AI',
      description: 'Qor AI iade politikası: Polar web ödemeleri, 3 günlük ücretsiz deneme, aboneliği iptal etme, yenilemeler, mobil uygulama mağazası satın almaları ve iade talep süreci.',
    },
  },
  {
    dir: 'cookies', path: '/cookies', changefreq: 'monthly', priority: '0.4',
    seo: {
      title: 'Çerez Politikası — Qor AI',
      description: 'Qor AI çerez politikası: zorunlu depolama, tarayıcı dili, analiz, performans ve affiliate atıf çerezleri.',
    },
  },
  {
    dir: 'contact', path: '/contact', changefreq: 'monthly', priority: '0.5',
    seo: {
      title: 'Bize Ulaşın — Qor AI',
      description: 'Qor AI destek, ödeme, iade, gizlilik, hesap silme, ürün verisi, iş birliği ve basın talepleri için tek resmi iletişim adresi.',
    },
  },
  {
    dir: 'about', path: '/about', changefreq: 'monthly', priority: '0.5',
    seo: {
      title: 'Qor AI Hakkında',
      description: 'Qor AI nedir, kimler içindir, Premium ne satar, hesap silme nasıl yapılır, öneriler nasıl çalışır ve ödeme akışları nasıl yönetilir.',
    },
  },
  {
    dir: 'faq', path: '/faq', changefreq: 'monthly', priority: '0.5',
    seo: {
      title: 'SSS — Qor AI',
      description: 'Qor AI Premium, ödeme, iade, gizlilik, hesap silme, iletişim, AI doğruluğu ve ürün verileri hakkında sık sorulan sorular.',
    },
  },
  {
    dir: 'quiz', path: '/quiz', changefreq: 'monthly', priority: '0.7',
    seo: {
      title: 'Kişisel Quiz — Sana En Uygun Teknoloji Ürününü Bul | Qor AI',
      description: 'Bütçeni, kullanım amacını ve önceliklerini söyle; Qor AI yapay zekâ profiline göre sana en uygun telefonu, laptopu veya diğer teknoloji ürününü önersin.',
    },
  },
  {
    dir: 'go', path: '/go', noindex: true,
    seo: {
      title: 'Mağazaya yönlendiriliyor — Qor AI',
      description: 'Qor AI mağaza yönlendirme sayfası.',
      noindex: true,
    },
  },
  {
    dir: 'ai-chat', path: '/ai-chat', changefreq: 'monthly', priority: '0.7',
    seo: {
      title: 'Qor AI Sohbet — Yapay Zekâ Teknoloji ve Alışveriş Danışmanı',
      description: 'Telefon, laptop, kulaklık ya da abonelik — sorunu yaz, Qor AI yapay zekâ danışmanından anında tarafsız öneri al; alternatifleri birlikte değerlendirin.',
    },
  },
  {
    dir: 'profile', path: '/profile', noindex: true,
    seo: { title: 'Profilim — Qor AI', description: 'Qor Coin bakiyen, karşılaştırmaların, analizlerin ve yorumların.', noindex: true },
  },
];

// ── Multilingual SEO (en=root, tr=/tr) ─────────────────────────────────────
// KÖK ADRESİN DİLİ = İNGİLİZCE (2026-08-05). Eskiden kök Türkçeydi: Google'da
// "qorai iphone specs" arayan bir İngiliz/Alman kullanıcıya Türkçe başlık ve
// açıklama çıkıyordu. Site dili GERÇEK ziyaretçi için hâlâ tarayıcıdan
// belirleniyor (bkz. web/src/main.jsx) — burada değişen yalnız arama
// motorlarının indekslediği ÖN-RENDER HTML'in dili.
// Adresler: /...  = en · /tr/... = tr · x-default → kök (en)
const SEO_DEFAULT_LOCALE = 'en';
const SEO_LOCALES = ['en', 'tr'];
const localePrefix = (lang) => (lang === SEO_DEFAULT_LOCALE ? '' : `/${lang}`);

// A static route gets a tr variant only when it is indexable AND has real,
// translatable content: the homepage, the legal pages (legalBody is lang-aware)
// and the landing/feature pages (LANDING_I18N). /go and the /product placeholder
// stay tr-only. Products/compare are NOT multiplied by language — a 3× explosion
// of thin shells is exactly the crawl-budget/“scaled content” trap to avoid.
const isMultilangRoute = (r) =>
  !r.noindex && !r.seo?.noindex && (r.dir === '' || !!LEGAL_META[r.dir] || !!LANDING[r.dir]);

// hreflang cluster for a path that has no language prefix. x-default → tr (root).
function hreflangAlts(basePath) {
  const p = basePath === '/' ? '' : basePath;
  const alts = SEO_LOCALES.map((l) => ({ hreflang: l, href: `${SITE}${localePrefix(l)}${p || '/'}` }));
  alts.push({ hreflang: 'x-default', href: `${SITE}${p || '/'}` });
  return alts;
}

// Prefix a prerendered body's in-site links so a crawler/visitor on /tr stays in
// /tr (the default-locale body is returned unchanged). ONLY links whose root
// actually has per-language prerenders are prefixed — blog (slug-based i18n),
// /ai-chat and /go are left alone so we never point at a page that doesn't exist.
//
// DÜZELTİLDİ (2026-08-06): kapı `lang === 'tr'` idi — kök adres Türkçeyken doğru
// olan bu kontrol, kök İngilizceye döndükten sonra TERSİNE dönmüştü: Türkçe
// sayfaların İÇ LİNKLERİ öneksiz (yani İngilizce) sayfalara gidiyordu, üstelik
// Almanca sayfalar prefixlenirken. Kapı artık VARSAYILAN dile bakıyor.
const MULTILANG_LINK_RE = /href="(\/(?:category|product|compare|link-analysis|subscriptions|premium|quiz|terms|privacy|refund|cookies|contact|about|faq)(?:[/?#][^"]*)?|\/)"/g;
function localizeBodyLinks(html, lang) {
  if (lang === SEO_DEFAULT_LOCALE || !html) return html;
  return html.replace(MULTILANG_LINK_RE, (_m, p) => `href="/${lang}${p}"`);
}

// tr <title>/<description> for the indexable content routes. Legal routes are
// resolved from LEGAL_META instead; tr uses the route's own seo. Missing → tr.
const STATIC_SEO_I18N = {
  en: {
    '': { title: 'Qor AI — AI Product & Subscription Advisor', description: 'Discover, compare and decide on tech products and digital subscriptions with AI. Phones, laptops, GPUs and more — analyzed by Qor AI.' },
    category: { title: 'All Tech Categories — Compare & Discover | Qor AI', description: 'Explore AI-scored products across 40+ categories including phones, laptops, GPUs, headphones and TVs; filter by brand, price and specs and compare side by side.' },
    'link-analysis': { title: 'Link Analysis — Paste a Product Link, Let AI Review It | Qor AI', description: 'Paste any product link: Qor AI identifies the product, extracts its specs and summarizes pros and cons. Paste several links at once to compare products with AI.' },
    subscriptions: { title: 'Subscription Comparison — Netflix, Spotify, YouTube | Qor AI', description: 'Compare Netflix, Spotify, YouTube Premium, Disney+, Game Pass and ChatGPT Plus subscriptions by price, content and value with AI — side by side in seconds.' },
    premium: { title: 'Qor AI Premium — Prices, Plans and Premium Features', description: 'Qor AI Premium unlocks deeper AI: AI chat, visual scanner, product and link analysis, subscription analysis, premium recommendations and extended price history.' },
    quiz: { title: 'Personal Quiz — Find the Tech Product That Fits You | Qor AI', description: 'Tell us your budget, use case and priorities; Qor AI recommends the phone, laptop or other tech product that fits your profile best — in a few quick questions.' },
    'ai-chat': { title: 'Qor AI Chat — AI Tech & Shopping Advisor', description: 'Phone, laptop, headphones or a subscription — ask your question and get instant, unbiased advice from the Qor AI assistant; weigh the alternatives together.' },
  },
};

// Per-language meta override for a static route. tr keeps the route's own seo.
function localizedRouteMeta(r, lang) {
  if (lang === 'tr') return {};
  if (LEGAL_META[r.dir]) {
    const m = LEGAL_META[r.dir]; const t = m[lang] || m.en;
    return t ? { title: t[0], description: t[1] } : {};
  }
  const o = (STATIC_SEO_I18N[lang] || {})[r.dir];
  return o ? { title: o.title, description: o.description } : {};
}

// ── main ────────────────────────────────────────────────────────
async function main() {
  if (!existsSync(templatePath)) {
    console.error('[seo] website/index.html not found — run vite build first');
    process.exit(1);
  }
  // The scheduled refresh runs seo.mjs WITHOUT a vite build, so website/index.html
  // — the "template" — is the PREVIOUS run's homepage output with the prerendered
  // body already baked inside #root. Left as-is, renderPage() never finds the
  // empty `<div id="root"></div>` marker, so EVERY generated page keeps the
  // homepage body: ~7.8k identical pages — the exact duplicate/"scaled content"
  // signal that got the whole site suppressed. Always strip #root back to empty
  // before rendering (a fresh vite template is a no-op), and refuse to run if the
  // shell doesn't look right rather than mass-produce broken pages.
  // Lookahead, #root kapanisi ile ilk <script> arasinda HTML YORUMU olmasina da
  // izin verir. Eskiden yalnizca bosluk kabul ediyordu: 2026-08-10 gecesi oraya
  // bir aciklama yorumu girdigi icin regex eslesmedi, sanitize basarisiz sayildi
  // ve 04:17 cron'u SESSIZCE iptal etti — o gece hicbir yeni urun SEO sayfasi
  // almadi ve tek belirti log'da bir satirdi. Koruma zayiflamiyor: asagidaki iki
  // sart (bos #root + seo isaretcileri) hala kosuluyor.
  const template = readFileSync(templatePath, 'utf8')
    .replace(/<div id="root">[\s\S]*?<\/div>(?=(?:\s|<!--[\s\S]*?-->)*<script)/, '<div id="root"></div>');
  if (!template.includes('<div id="root"></div>') || !/<!-- seo:start -->[\s\S]*?<!-- seo:end -->/.test(template)) {
    console.error('[seo] template sanitisation failed (no empty #root or seo markers) — aborting instead of regenerating every page from a dirty shell');
    process.exit(1);
  }

  // Buying guides drive the per-category landing pages AND the homepage's
  // internal-link grid, so load them up front (pure local file read, no network)
  // before the static shells are rendered.
  const guides = loadGuides();
  if (guides.size) {
    // Mirror guides into the served website/guides/ too. vite copies public/ on a
    // full build, but the scheduled cron runs seo.mjs alone — this keeps the SPA's
    // /guides/<cat>.json fetch in sync without a vite build.
    const gOut = join(site, 'guides');
    mkdirSync(gOut, { recursive: true });
    for (const [cat, g] of guides) writeTextFile(join(gOut, `${cat}.json`), JSON.stringify(g));
    console.log(`[seo] loaded + mirrored ${guides.size} buying guides`);
  }

  // 1) static route shells. The homepage + every legal/policy page ALSO get a
  //    real, crawlable #root body; the rest carry per-route meta only (category /
  //    product / blog get their rich bodies in later steps). This is the fix for
  //    the empty <div id="root"></div> that the AdSense reviewer kept rejecting.
  for (const r of STATIC_ROUTES) {
    const multilang = isMultilangRoute(r);
    // Tek dilli rotalar VARSAYILAN dile yazılır (kök adres). Burada 'tr'
    // sabitken varsayılan İngilizceye çevrilince /product yer tutucusu
    // /tr/product'a kaymış ve kökteki eski (indexlenebilir) kopya kalmıştı —
    // seo-audit bunu yakaladı.
    const locales = multilang ? SEO_LOCALES : [SEO_DEFAULT_LOCALE];
    for (const lang of locales) {
      let body = '';
      if (r.dir === '') body = homeBody(guides, lang);
      else if (LEGAL_META[r.dir]) body = legalBody(r.dir, lang);
      else if (LANDING[r.dir]) body = landingBody(r.dir, guides, lang);
      body = localizeBodyLinks(body, lang);
      const prefix = localePrefix(lang);
      const dir = `${prefix}${r.path}`.replace(/^\//, '');
      writeHtml(dir, renderPage(template, {
        ...r.seo, ...localizedRouteMeta(r, lang),
        url: `${SITE}${prefix}${r.path}`,
        lang,
        // Kabuktaki hero metni yalnizca ana sayfada kalsin (bkz. renderPage).
        isHome: r.dir === '',
        routeKey: r.dir,
        alternates: multilang ? hreflangAlts(r.path) : null,
      }, body));
    }
  }
  // 404 shell — noindex, keeps deep-link fallback working
  writeTextFile(
    join(site, '404.html'),
    renderPage(template, {
      // Kök adresin dili İngilizce; 404 kabuğu da öyle olmalı (metin SABİT
      // TÜRKÇEYDİ, üstelik `<html lang="en">` ile birlikte servis ediliyordu).
      title: 'Page not found — Qor AI', description: 'The page you are looking for may have moved.',
      url: `${SITE}/404`, lang: SEO_DEFAULT_LOCALE, noindex: true,
    }),
  );

  // 2) catalogue fetch — drives both the per-category landing shells and the
  //    curated per-product prerender below (step 2c). We bake a bounded,
  //    de-duplicated subset of top products (not all 106k), so the sitemap and
  //    the prerendered HTML stay in lock-step and Google gets real pages.
  let products = [];
  try {
    products = await fetchAllProducts();
    console.log(`[seo] fetched ${products.length} products from Typesense`);
  } catch (err) {
    if (process.env.SEO_ALLOW_EMPTY_CATALOG === '1') {
      console.warn(`[seo] product fetch failed (${err.message}) — sitemap will list routes only because SEO_ALLOW_EMPTY_CATALOG=1`);
    } else {
      throw new Error(`product fetch failed; refusing to publish a stripped sitemap (${err.message})`);
    }
  }

  // ANALIZLER KURASYONDAN ONCE cekilir, iki is icin:
  //  1) Analizi olan urun kurasyona MUTLAKA girer (asagida). Olculdu: analizi
  //     yayinlanan S23 Ultra 1TB, model-anahtari tekillestirmesinde 512GB
  //     kardesine "kopya" diye eleniyordu; sitenin OZGUN icerik uretilmis tek
  //     urunu ciplak SPA kabugu olarak kaliyordu (#root govdesi 0 karakter).
  //  2) Urun sayfasi analize LINK verir. Onsuz /analiz/<slug> site icinde
  //     hicbir yerden baglantisi olmayan bir ada: yalniz sitemap'ten kesfedilir.
  const analyses = await fetchAnalyses();
  const analizBySlug = new Map();
  for (const a of analyses) {
    if (!a.slug || !a.productSlug) continue;
    // Dile gore ayri: bir dilde raporu olmayan analize O DILDE link verirsek
    // okuyucuyu uretilmemis bir kabuga gonderiyoruz.
    const diller = analysisRenderLangs(a, SEO_DEFAULT_LOCALE).filter((l) => SEO_LOCALES.includes(l));
    if (!diller.length) continue;
    analizBySlug.set(a.productSlug, { slug: a.slug, diller });
  }

  // 2b) curated selection — pick the top-N de-duplicated, image-bearing models
  //     per category UP FRONT. This one list drives both the category landing
  //     page internal links (2c) and the per-product shells (2d). We bake a
  //     bounded, quality subset (not all 106k): a 100k-file dump of thin,
  //     near-duplicate scraped-spec SKUs is exactly the "scaled content" Google
  //     penalises, and a new domain's crawl budget can't absorb it anyway. The
  //     long tail stays reachable via the SPA but is kept out of the sitemap.
  const MAX_PRODUCTS = Number(process.env.SEO_MAX_PRODUCTS || 12000);
  const byCategory = new Map();
  for (const d of products) {
    const cat = String(d?.category || '').trim().toLowerCase();
    if (!cat) continue;
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(d);
  }
  // ── SIRALAMA: techScore DEĞİL, TALEP ────────────────────────────────────
  //
  // 2026-08-21 ÖLÇÜMÜ. Kürasyon `techScore:desc` ile yapılıyordu ve
  // `trendScore` harmanı kâğıt üzerinde bunu dengeliyordu. Ama:
  // **`trendScore` 107.449 dokümanın TAMAMINDA 0** — alan fiilen ölü.
  // Sebebi `scripts/compute_trending.mjs`: skoru `recently_viewed`den,
  // yani YALNIZ GİRİŞ YAPMIŞ kullanıcı görüntülemelerinden üretiyor. Sitenin
  // günlük kullanıcısı tek haneli olduğu için tablo boş. Bu döngüsel bir
  // tuzak: talebi bilmek için trafik, trafik için talep gerekiyor.
  //
  // Yani talep sinyali DIŞARIDAN gelmek zorunda. Denenip ELENEN adaylar:
  //   · `pricedOfferCount` (kaç mağaza satıyor) — ölçüldü, tavanı ~4:
  //     scraper Epey'den yalnız EN UCUZ 3 mağazayı alıyor. Talep değil,
  //     scraper tasarımının sınırı.
  //   · `priceTR>0`u SERT KAPI yapmak — ölçüldü, en değerli kategoriyi
  //     keserdi: telefonların yalnız %4'ünde TR fiyatı var (196/4.852),
  //     laptoplarda %46 (4.708/10.273). Fiyat artık kapı değil, ARTI.
  //
  // Geriye ölçeklenebilir tek dürüst kaynak kalıyor: KATEGORİ ve MARKA
  // düzeyinde editoryal talep bilgisi. İkisi de ÜRÜN SAYISIYLA BÜYÜMEYEN
  // sabit listeler (46 kategori, ~60 marka) — 107k ürün için tek tek karar
  // vermek imkânsızken, 46 kategori için bir kez karar vermek mümkün.
  //
  // `trendScore` terimi formülde BİLEREK duruyor: bugün 0, ama
  // compute_trending.mjs anlamlı veriyle yeniden koşarsa kendiliğinden
  // devreye girer ve editoryal katsayıları ezmeye başlar.
  const TREND_W = Number(process.env.SEO_TREND_WEIGHT || 60);

  // Kategori kotaları. Eskiden 46 kategorinin HEPSİ 150 kontenjan alıyordu:
  // `cpu_coolers` ile `smartphones` eşit sayılıyordu. `desktops` kataloğun en
  // kalabalık kategorisi (12.924) ama tekil SKU olarak aranmıyor — Turbox /
  // Dragos / Casper hazır sistem varyantları.
  const KOTA = { A: 250, B: 120, C: 60, D: 25 };
  const KATEGORI_TIER = {
    // A — arama hacminin ezici çoğunluğu
    smartphones: 'A', laptops: 'A', tvs: 'A', headphones: 'A', smartwatches: 'A', tablets: 'A',
    // B — güçlü ikinci halka
    graphics_cards: 'B', cpus: 'B', monitors: 'B', gaming_consoles: 'B', ssd: 'B',
    robot_vacuums: 'B', printers: 'B', drones: 'B', audio_systems: 'B',
    // C — bileşen ve çevre birimi
    keyboards: 'C', mice: 'C', ram: 'C', motherboards: 'C', pc_cases: 'C', psu: 'C',
    routers: 'C', powerbanks: 'C', projectors: 'C', camera_lenses: 'C', microphones: 'C',
    e_readers: 'C', ip_cameras: 'C', chargers: 'C',
    // D — uzun kuyruk (listede olmayan her kategori de D'ye düşer)
  };
  // `SEO_PRODUCTS_PER_CATEGORY` eskiden TEK kotaydı. Kaldırıp yok saymak, onu
  // ayarlayan bir çağıranın (ör. Hetzner cron'u) sessizce etkisiz kalması
  // demekti; sessiz no-op env değişkeni teşhis edilmesi en zor şeylerden biri.
  // Ayarlıysa TÜM kategoriler için kotayı ezer — eski davranışa dönüş kapısı.
  const KOTA_EZME = Number(process.env.SEO_PRODUCTS_PER_CATEGORY || 0);
  if (KOTA_EZME > 0) console.log(`[seo] SEO_PRODUCTS_PER_CATEGORY=${KOTA_EZME} — kategori kotaları eziliyor (tier tablosu devre dışı)`);
  const kategoriKotasi = (cat) => (KOTA_EZME > 0 ? KOTA_EZME : KOTA[KATEGORI_TIER[cat] || 'D']);

  // "X vs Y" sayfası ÜRETİLEN kategoriler. Burada tanımlı çünkü kategori
  // sayfaları (2c) karşılaştırma sayfalarından (2e) ÖNCE üretiliyor ve
  // kategori gövdesi bu bilgiye ihtiyaç duyuyor — aksi halde var olmayan
  // adrese link verir. Gerekçe için bkz. 2e.
  const COMPARE_TIERS = new Set(['A', 'B']);

  // Bilinen markalar. Ölçüldü: katalogtaki en kalabalık markaların önemli bir
  // kısmı isimsiz aksesuar üreticisi (Turbox 1.595, Dragos 1.501, Rampage 873,
  // Everest 639, Ramtech 594, Torima 526, Hadron 461, Frisby 454, Platoon 414).
  // Bunlar spec tablosu dolu olduğu için techScore sıralamasında ÜSTE çıkıyordu.
  const BILINEN_MARKALAR = new Set([
    'apple', 'samsung', 'xiaomi', 'sony', 'lg', 'asus', 'lenovo', 'hp', 'dell', 'acer',
    'msi', 'huawei', 'google', 'oneplus', 'nothing', 'oppo', 'vivo', 'realme', 'honor',
    'nvidia', 'amd', 'intel', 'logitech', 'razer', 'jbl', 'bose', 'sennheiser', 'anker',
    'corsair', 'gigabyte', 'tp-link', 'canon', 'nikon', 'philips', 'panasonic', 'beko',
    'arçelik', 'arcelik', 'vestel', 'grundig', 'casper', 'monster', 'kingston', 'wd',
    'seagate', 'crucial', 'hyperx', 'cooler master', 'thermaltake', 'epson', 'brother',
    'hikvision', 'xerox', 'netgear', 'garmin', 'gopro', 'dji', 'ecovacs', 'roborock',
    'dyson', 'tcl', 'hisense', 'nintendo', 'microsoft', 'steelseries', 'jabra', 'marshall',
    'baseus', 'ttec', 'viewsonic', 'benq', 'aoc', 'toshiba', 'western digital', 'adata',
    'xpg', 'g.skill', 'be quiet!', 'nzxt', 'fractal design', 'lexar', 'sandisk',
  ]);
  const markaBilinir = (d) => BILINEN_MARKALAR.has(String(d?.brand || '').trim().toLowerCase());
  // Sayfanın kendi pazarında fiyatı olması "bu ürün gerçekten satılıyor"
  // demek — kapı değil ama güçlü bir artı.
  const fiyatiVar = (d) => (Number(d?.priceTR) || 0) > 0
    || (Number(d?.priceDE) || 0) > 0 || (Number(d?.priceUS) || 0) > 0
    || (Number(d?.lowestPriceUSD) || 0) > 0;

  // Marka > fiyat > teknik skor. Katsayılar bilerek ayrık: bilinen markalı bir
  // ürün, spec tablosu daha dolu isimsiz bir üründen HER ZAMAN önce gelir.
  const talepSkoru = (d) => (markaBilinir(d) ? 300 : 0)
    + (fiyatiVar(d) ? 80 : 0)
    + (Number(d.trendScore) || 0) * TREND_W
    + (Number(d.techScore) || 0);
  for (const arr of byCategory.values()) arr.sort((a, b) => talepSkoru(b) - talepSkoru(a));

  const curatedByCat = new Map();
  let curatedTotal = 0;
  const SPEC_ESIK = Number(process.env.SEO_MIN_SPECS || 12);
  const elenen = { gorsel: 0, spec: 0, kopya: 0 };
  for (const [cat, items] of byCategory) {
    if (curatedTotal >= MAX_PRODUCTS) break;
    const seen = new Set();
    const picked = [];
    const kota = kategoriKotasi(cat);
    for (const d of items) {
      if (picked.length >= kota || curatedTotal >= MAX_PRODUCTS) break;
      if (!d?.id || !d?.name) continue;
      if (!/^https?:\/\//i.test(d.imageUrl || '')) { elenen.gorsel += 1; continue; }
      // İnce sayfa kapısı: spec tablosu zayıf ürün, ne kullanıcıya ne Google'a
      // bir şey söylüyor. Fiyat kapı DEĞİL (yukarıdaki gerekçe), spec kapı.
      if ((Number(d.specsCount) || 0) < SPEC_ESIK) { elenen.spec += 1; continue; }
      const key = modelKey(d.name);
      if (key && seen.has(key)) { elenen.kopya += 1; continue; }
      if (key) seen.add(key);
      picked.push(d);
      curatedTotal += 1;
    }
    if (picked.length) curatedByCat.set(cat, picked);
  }

  // ANALIZI OLAN URUN HER HALUKARDA KURASYONDA. Kota, spec esigi ve
  // model-anahtari tekillestirmesi genel katalog icin dogru filtreler, ama
  // analizi yayinlanmis urun tanimi geregi ince sayfa DEGIL: sitenin baska
  // hicbir yerinde olmayan ozgun icerik ONA isaret ediyor. Elenirse hem o
  // sayfa ciplak kabuk kalir hem de analize giden ic link hic uretilmez.
  let zorunlu = 0;
  if (analizBySlug.size) {
    const kuratedeVar = new Set();
    for (const p of curatedByCat.values()) for (const d of p) if (d?.slug) kuratedeVar.add(d.slug);
    for (const d of products) {
      if (!d?.slug || !analizBySlug.has(d.slug) || kuratedeVar.has(d.slug)) continue;
      if (!d.id || !d.name) continue;
      const cat = String(d.category || '').trim().toLowerCase();
      if (!cat) continue;
      if (!curatedByCat.has(cat)) curatedByCat.set(cat, []);
      curatedByCat.get(cat).push(d);
      kuratedeVar.add(d.slug);
      curatedTotal += 1;
      zorunlu += 1;
    }
    if (zorunlu) console.log(`[seo] kürasyona zorunlu eklenen (analizi olan ürün): ${zorunlu}`);
  }
  {
    const tumu = [...curatedByCat.values()].flat();
    const markali = tumu.filter(markaBilinir).length;
    const fiyatli = tumu.filter(fiyatiVar).length;
    console.log(
      `[seo] kürasyon: ${curatedTotal} ürün / ${curatedByCat.size} kategori · `
      + `bilinen marka ${markali} (%${((markali / Math.max(1, curatedTotal)) * 100).toFixed(1)}) · `
      + `fiyatlı ${fiyatli} (%${((fiyatli / Math.max(1, curatedTotal)) * 100).toFixed(1)}) · `
      + `elenen: görselsiz ${elenen.gorsel}, spec<${SPEC_ESIK} ${elenen.spec}, kopya ${elenen.kopya}`,
    );
  }

  // Temiz etiketli key-specs'i (ve ürün adının ÇEVİRİLERİNİ) yalnız seçilmiş
  // küme için `_raw`'dan çekiyoruz. Bu adım kategori sayfalarından ÖNCE olmak
  // zorunda: `localizedName` sözlüğü burada doluyor ve kategori sayfalarındaki
  // ürün linkleri de dile göre adlandırılıyor (önce aşağıda, ürün sayfalarından
  // hemen önce yapılıyordu → kategori sayfaları Türkçe adlarla kalıyordu).
  const curatedIds = [];
  for (const picked of curatedByCat.values()) {
    for (const d of picked) if (d?.id) curatedIds.push(d.id);
  }
  let detailById = new Map();
  try {
    detailById = await fetchKeySpecsByIds(curatedIds);
    const fiyatli = [...detailById.values()].filter((x) => x && x.prices && Object.keys(x.prices).length).length;
    console.log(`[seo] fetched key-specs for ${detailById.size}/${curatedIds.length} curated products · ${nameById.size} translated names · ${fiyatli} with prices`);
  } catch (err) {
    console.warn(`[seo] key-specs fetch failed (${err.message}) — product shells fall back to lean fields`);
  }

  // KATEGORI KABUKLARINI DIL DIL SIL — kurasyondan DUSEN kategori hayalet
  // sayfa birakmasin.
  //
  // 2026-08-22'de olculdu: `case_fans` spec>=12 kapisini gecen urunu kalmayinca
  // kurasyondan dustu; sayfasi yeniden URETILMEDI ama ESKISI yerinde kaldi ve
  // sitemap'te olmadigi halde hala `hreflang="de"` basiyordu — Almanca siteden
  // kaldirilalim uzun sure sonra. prebuild'in `wipe` listesi bunu cozemez,
  // cunku orada dil onekli karsilik (`website/tr/category`) kapsanmiyor.
  for (const lang of SEO_LOCALES) {
    const catRoot = join(site, ...(localePrefix(lang) ? [lang] : []), 'category');
    if (!existsSync(catRoot)) continue;
    for (const entry of readdirSync(catRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        try { rmSync(join(catRoot, entry.name), { recursive: true, force: true }); } catch (_) {}
      }
    }
  }

  // 2c) per-category landing shells — content-rich hubs: keyword title +
  //     ItemList JSON-LD + a crawlable <a> grid (categoryBody) to every curated
  //     product, so Google reaches product pages via internal links (home →
  //     category → product, ≤3 clicks) and the page isn't a thin head-only shell.
  // Per-language <title>/<description> for the category landings.
  const CAT_SEO_TEXT = {
    tr: { title: (l) => `${l} Karşılaştırma — Fiyat & Özellik | Qor AI`, desc: (l) => `${l} modellerini Qor AI ile karşılaştır: yapay zekâ teknik skoru, özellikler ve güncel fiyatlar bir arada. En iyi ${l} modellerini keşfet, filtrele ve sana en uygununu saniyeler içinde seç.` },
    en: { title: (l) => `${l} Comparison — Price & Specs | Qor AI`, desc: (l) => `Compare ${l} models with Qor AI: AI tech score, features and current prices together. Discover the best ${l} models, filter and pick the one that fits you in seconds.` },
  };
  let categoryShells = 0;
  // Capraz kategori linkleri: her kategori sayfasi digerlerine baglanir, boylece
  // kategoriler kopuk ada olmaktan cikar (olculdu: onceki halinde kategori
  // sayfalarinda BASKA kategoriye giden link sayisi 0'di).
  const tumKategoriler = [...curatedByCat.keys()];
  const digerKategoriler = (cat) => tumKategoriler.filter((c) => c !== cat).slice(0, 14);
  for (const [cat, picked] of curatedByCat) {
    const path = categoryPath(cat);
    if (!path) continue;
    const guide = guides.get(cat);
    const top = picked.slice(0, 24);
    const heroImg = String(top[0]?.imageUrl || '');
    // Category landings are the prime "best <X>" English query targets, so
    // generate them in all three languages with hreflang. Products in the JSON-LD
    // itemList stay on their tr-canonical URLs (there is one product page per model).
    for (const lang of SEO_LOCALES) {
      const label = categoryLabel(cat, lang);
      const prefix = localePrefix(lang);
      const url = `${SITE}${prefix}${path}`;
      const faqLd = lang === 'tr' ? guideFaqLd(guide, url) : null; // guide FAQ is tr-only copy
      const itemList = {
        '@type': 'ItemList', '@id': `${url}#itemlist`, name: `${label} — Qor AI`,
        numberOfItems: top.length,
        itemListElement: top.map((d, i) => ({ '@type': 'ListItem', position: i + 1, url: `${SITE}${prefix}${productPath(d)}`, name: localizedName(d, lang) })),
      };
      const collection = {
        '@type': 'CollectionPage', '@id': `${url}#webpage`, url, name: `${label} — Qor AI`,
        isPartOf: { '@id': `${SITE}/#website` }, mainEntity: { '@id': `${url}#itemlist` },
      };
      const breadcrumb = {
        '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Qor AI', item: `${SITE}${prefix}/` },
          { '@type': 'ListItem', position: 2, name: label, item: url },
        ],
      };
      const tx = CAT_SEO_TEXT[lang] || CAT_SEO_TEXT.tr;
      writeHtml(`${prefix}${path}`.replace(/^\//, ''), renderPage(template, {
        title: truncate(tx.title(label), 68),
        description: truncate(tx.desc(label)),
        url,
        lang,
        image: /^https?:\/\//i.test(heroImg) ? heroImg : DEFAULT_IMG,
        preloadImage: lcpVariant(heroImg, 'card'),
        routeKey: 'category',
        // Kabuktaki hero her dilde kendi kategori adini gostersin.
        bootExtra: { labels: Object.fromEntries(SEO_LOCALES.map((l) => [l, categoryLabel(cat, l)])) },
        type: 'website',
        alternates: hreflangAlts(path),
        jsonLd: { '@context': 'https://schema.org', '@graph': [collection, itemList, breadcrumb, ...(faqLd ? [faqLd] : [])] },
      // Karşılaştırma bölümü YALNIZ o kategoride compare sayfası üretiliyorsa
      // basılır; aksi halde kategori sayfası 404'e link verir (bkz. 2e).
      }, localizeBodyLinks(categoryBody(label, url, picked, guide, lang, digerKategoriler(cat), COMPARE_TIERS.has(KATEGORI_TIER[cat] || 'D')), lang)));
      categoryShells += 1;
    }
  }
  console.log(`[seo] wrote ${categoryShells} per-category landing shells (en/tr, with internal product links)`);

  // 2d) curated per-product prerender — real static HTML per model: unique <head>
  //     (title/description/canonical + Product/Breadcrumb JSON-LD) + a content
  //     body with sibling-product links. Wipe stale product subdirs first so
  //     website/product/ never accumulates orphans. Keep product/index.html.
  for (const lang of SEO_LOCALES) {
    const productRoot = join(site, ...(localePrefix(lang) ? [lang] : []), 'product');
    if (!existsSync(productRoot)) continue;
    for (const entry of readdirSync(productRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        try { rmSync(join(productRoot, entry.name), { recursive: true, force: true }); } catch (_) {}
      }
    }
  }
  // ÜRÜN SAYFALARI ARTIK ÜÇ DİLDE (2026-08-06). Öncesinde yalnız kök adreste
  // (varsayılan dil) üretiliyor ve HİÇ hreflang taşımıyorlardı: sitede üç dil
  // desteklenmesine rağmen Google'da bir ürünü hangi dilde ararsa arasın herkes
  // TEK dildeki başlığı görüyordu (önce Türkçe, 08-05'ten sonra İngilizce).
  // Adresler değişmedi — `/product/<slug>` hâlâ İngilizce; yanına `/tr/product/…`
  // ve `/tr/product/…` eklendi ve ikisi hreflang ile birbirine bağlandı, böylece
  // arama motoru ziyaretçinin diline uygun olanı gösterir. Ziyaretçinin gerçek
  // dili HÂLÂ tarayıcıdan belirlenir; önek yalnız ön-render HTML'in dilini sabitler.
  const prerendered = [];
  for (const [cat, picked] of curatedByCat) {
    const categoryPathStr = categoryPath(cat);
    picked.forEach((d, i) => {
      const path = productPath(d);
      if (!path) return;
      const detail = detailById.get(d.id) || null;
      const alternates = hreflangAlts(path);
      for (const lang of SEO_LOCALES) {
        const prefix = localePrefix(lang);
        const ks = (detail && detail.ks && detail.ks[lang]) || null;
        // Sayfanın KENDİ ülkesinin fiyatı — yoksa fiyat yok. Başka ülkenin
        // fiyatını göstermek yasak (aynı kural app ve sitede de geçerli).
        const price = priceForLang(detail && detail.prices, lang);
        const label = categoryLabel(cat, lang);
        const categoryUrl = `${SITE}${prefix}${categoryPathStr}`;
        const related = [];
        for (let k = 1; k <= 8 && k < picked.length; k += 1) {
          const r = picked[(i + k) % picked.length];
          // Benzer ürün linkleri de kendi dil ağacında kalsın (aksi halde
          // /tr/ ve kök ürün sayfaları arası hiç iç link olmuyor).
          related.push({ name: localizedName(r, lang), path: `${prefix}${productPath(r)}` });
        }
        // Analiz linki YALNIZ o dilde raporu varsa: aksi halde uretilmemis bir
        // kabuga link vermis olurduk.
        const an = analizBySlug.get(d.slug);
        const analiz = an && an.diller.includes(lang)
          ? {
            href: `${SITE}${prefix}/analiz/${an.slug}`,
            text: lang === 'tr' ? `${localizedName(d, lang)} yapay zekâ analizini oku` : `Read the AI analysis of ${localizedName(d, lang)}`,
          }
          : null;
        writeHtml(
          `${prefix}${path}`.replace(/^\//, ''),
          renderPage(
            template,
            { ...productSeo(d, label, ks, lang, price), alternates, preloadImage: lcpVariant(d.imageUrl, 'full'), routeKey: 'product' },
            localizeBodyLinks(productBody(d, label, categoryUrl, related, ks, lang, price, analiz), lang),
          ),
        );
      }
      prerendered.push({ d, path });
    });
  }
  console.log(`[seo] wrote ${prerendered.length} curated products × ${SEO_LOCALES.length} languages = ${prerendered.length * SEO_LOCALES.length} product shells (talep sıralı, kategori kotalı, deduped, image-gated, hreflang-linked)`);

  // 2e) comparison ("X vs Y") pages — the highest-intent queries for a compare
  //     site. For each category we pair the top-K blended products (flagships +
  //     trending models), one static page per pair with a real side-by-side
  //     table + links to both products. The SPA's /compare/:pair route seeds the
  //     pool from the URL so the same page also renders live.
  //     We wipe website/compare here (not only in prebuild) so this step is
  //     self-sufficient when the scheduled CI job runs seo.mjs on its own.
  for (const lang of SEO_LOCALES) {
    const compareRoot = join(site, ...(localePrefix(lang) ? [lang] : []), 'compare');
    if (!existsSync(compareRoot)) continue;
    for (const entry of readdirSync(compareRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        try { rmSync(join(compareRoot, entry.name), { recursive: true, force: true }); } catch (_) {}
      }
    }
  }
  // ── HANGİ KATEGORİDE karşılaştırma sayfası üretilir ──────────────────────
  //
  // Eskiden 46 kategorinin HEPSİNDE top-8'in tüm ikili kombinasyonu (28 çift)
  // üretiliyordu: 1.288 çift. Ama "X vs Y" kalıbı yalnız birkaç kategoride
  // gerçekten aranıyor — kimse "APC UPS 650VA vs Tunçmatik 850VA" ya da
  // "Frisby flash bellek vs Hadron flash bellek" diye aramıyor. O sayfalar
  // taranıyor, hiç tıklanmıyor ve siteyi "üretilmiş sayfa yığını" gösteriyor.
  //
  // Artık yalnız A ve B kategorileri (telefon, laptop, TV, kulaklık, saat,
  // tablet, ekran kartı, işlemci, monitör, konsol, SSD, robot süpürge, yazıcı,
  // drone, ses sistemi). C ve D karşılaştırma sayfası ALMAZ — ürün ve kategori
  // sayfaları onlar için zaten yeterli.
  //
  // Top-8 yerine top-6: C(8,2)=28 çiftin kuyruğu (7. ile 8. sıradaki ürün)
  // zaten aranmıyordu. C(6,2)=15 çift, hepsi üst sıradan.
  const COMPARE_TOP = Number(process.env.SEO_COMPARE_TOP || 6);
  const compares = [];
  for (const [cat, picked] of curatedByCat) {
    if (!COMPARE_TIERS.has(KATEGORI_TIER[cat] || 'D')) continue;
    const categoryPathStr = categoryPath(cat);
    // Distinct MODELS only for pairing — never "Watch Ultra 3 vs Watch Ultra 3
    // Milano Loop". modelKey collapses cosmetic colour/strap/storage variants.
    const topK = [];
    const seenModels = new Set();
    for (const d of picked) {
      if (topK.length >= COMPARE_TOP) break;
      const k = modelKey(d.name);
      if (k && seenModels.has(k)) continue;
      if (k) seenModels.add(k);
      topK.push(d);
    }
    for (let i = 0; i < topK.length; i += 1) {
      for (let j = i + 1; j < topK.length; j += 1) {
        const a = topK[i]; const b = topK[j];
        const path = comparePath(a, b);
        const alternates = hreflangAlts(path);
        const detA = detailById.get(a.id) || null;
        const detB = detailById.get(b.id) || null;
        // "X vs Y" en yüksek niyetli sorgu; ürün sayfalarıyla aynı gerekçeyle
        // üç dilde üretilir ve hreflang ile bağlanır.
        for (const lang of SEO_LOCALES) {
          const prefix = localePrefix(lang);
          const ksA = (detA && detA.ks && detA.ks[lang]) || null;
          const ksB = (detB && detB.ks && detB.ks[lang]) || null;
          const fiyatA = priceForLang(detA && detA.prices, lang);
          const fiyatB = priceForLang(detB && detB.prices, lang);
          const label = categoryLabel(cat, lang);
          const categoryUrl = `${SITE}${prefix}${categoryPathStr}`;
          writeHtml(
            `${prefix}${path}`.replace(/^\//, ''),
            renderPage(
              template,
              // routeKey ATLANMISTI: 3.864 karsilastirma sayfasi ne rota
              // on-yuklemesi ne de rota bicimli iskelet aliyordu — urun
              // sayfasindaki ayni hatanin ikizi.
              { ...compareSeo(a, b, label, lang), alternates, routeKey: 'compare' },
              localizeBodyLinks(compareBody(a, b, label, categoryUrl, ksA, ksB, lang, fiyatA, fiyatB), lang),
            ),
          );
        }
        compares.push({ a, b, path });
      }
    }
  }
  console.log(`[seo] wrote ${compares.length} comparisons × ${SEO_LOCALES.length} languages = ${compares.length * SEO_LOCALES.length} pages (top-${COMPARE_TOP}/category, distinct models, hreflang-linked)`);

  // 2f) blog — prerender /blog listing + /blog/<slug> articles from PB so they're
  //     crawlable HTML (the SPA also renders them live from PB). Wipe stale dirs.
  const articles = await fetchArticles();
  // Live prices for every product referenced by any article — looked up now (the
  // nightly cron runs this after the 03:10 price refresh), so blog prices track
  // the current Amazon price instead of a value frozen at article-write time.
  const blogProductIds = [];
  for (const a of articles) {
    for (const p of (Array.isArray(a.products) ? a.products : [])) {
      if (p && p.id && (p.kind || 'product') === 'product') blogProductIds.push(p.id);
    }
  }
  const blogPriceMap = await fetchBlogPrices(blogProductIds);
  console.log(`[seo] fetched live prices for ${blogPriceMap.size}/${new Set(blogProductIds).size} blog products`);
  const blogRoot = join(site, 'blog');
  if (existsSync(blogRoot)) {
    for (const entry of readdirSync(blogRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) { try { rmSync(join(blogRoot, entry.name), { recursive: true, force: true }); } catch (_) {} }
    }
  }
  // BLOG LİSTESİ ÜÇ DİLDE (2026-08-06). Öncesinde yalnız `/blog` vardı ve metni
  // SABİT TÜRKÇEYDİ — üstelik kök adres İngilizceye döndüğü için sayfa
  // `<html lang="en">` deyip Türkçe başlık basıyordu. Daha kötüsü, `/tr/` veya
  // `/tr/` önekindeki bir ziyaretçi menüden Blog'a tıkladığında SPA `/tr/blog`
  // adresine gidiyor ve orada ön-render bulunmadığı için 404 kabuğu (noindex,
  // canonical → /404) servis ediliyordu.
  const BLOG_LIST_TEXT = {
    en: { title: 'Buying Guides & Blog — Qor AI', desc: '2026 buying guides for phones, laptops, headphones, TVs and more — scored and compared by Qor AI.' },
    tr: { title: 'Alım Rehberleri & Blog — Qor AI', desc: 'Telefon, laptop, kulaklık, TV ve daha fazlası için 2026 alım rehberleri — Qor AI ile puanlandı ve karşılaştırıldı.' },
  };
  const blogUrls = [];
  if (articles.length) {
    const blogListLastmod = lastmodAtLeastVersion(articles[0]?.updated);
    for (const lang of SEO_LOCALES) {
      const prefix = localePrefix(lang);
      const tx = BLOG_LIST_TEXT[lang] || BLOG_LIST_TEXT[SEO_DEFAULT_LOCALE];
      const url = `${SITE}${prefix}/blog`;
      writeHtml(`${prefix}/blog`.replace(/^\//, ''), renderPage(template, {
        title: tx.title, description: tx.desc, url, lang, type: 'website',
        routeKey: 'blog',
        alternates: hreflangAlts('/blog'),
        jsonLd: { '@context': 'https://schema.org', '@type': 'Blog', '@id': `${url}#blog`, name: 'Qor AI Blog', url },
      }, localizeBodyLinks(blogListBody(articles), lang)));
      blogUrls.push({
        loc: url, lastmod: blogListLastmod, changefreq: 'daily',
        priority: lang === SEO_DEFAULT_LOCALE ? '0.7' : '0.6',
      });
    }
    const BLOG_LANGS = ['tr', 'en'];
    for (const a of articles) {
      if (!a.slug) continue;
      const cover = articleCoverUrl(a) || DEFAULT_IMG;
      const slugs = { tr: a.slug_tr || a.slug, en: a.slug_en || a.slug, };
      // hreflang map (+ x-default → VARSAYILAN dil, artık EN) so a TR/EN/DE searcher lands on the
      // matching-language URL and Google treats them as one translated article.
      const alternates = BLOG_LANGS.map((l) => ({ hreflang: l, href: `${SITE}/blog/${slugs[l]}` }));
      alternates.push({ hreflang: 'x-default', href: `${SITE}/blog/${slugs[SEO_DEFAULT_LOCALE] || slugs.tr}` });
      const written = new Set();
      for (const lang of BLOG_LANGS) {
        const s = slugs[lang];
        if (!s || written.has(s)) continue; // skip when a language reuses the canonical slug
        written.add(s);
        const url = `${SITE}/blog/${s}`;
        const t = (f) => a[`${f}_${lang}`] || a[`${f}_tr`] || a[`${f}_en`] || '';
        const authorName = (a.author || '').trim() || 'Qor AI';
        const metaT = (a[`metaTitle_${lang}`] || a.metaTitle_tr || a.metaTitle || '').trim();
        const metaD = (a[`metaDescription_${lang}`] || a.metaDescription_tr || a.metaDescription || '').trim();
        const kw = (a[`tags_${lang}`] || a.tags_tr || a.tags || '').trim();
        const articleLd = {
          '@type': 'Article', '@id': `${url}#article`, headline: t('title'), description: metaD || t('lead'),
          image: [cover], datePublished: a.publishedAt || a.created, dateModified: a.updated,
          inLanguage: lang,
          ...(kw ? { keywords: kw } : {}),
          author: { '@type': 'Organization', name: authorName },
          publisher: { '@type': 'Organization', name: 'Qor AI', logo: { '@type': 'ImageObject', url: DEFAULT_IMG } },
          mainEntityOfPage: url,
        };
        writeHtml(`blog/${s}`, renderPage(template, {
          title: metaT || truncate(`${t('title')} | Qor AI`, 70), description: truncate(metaD || t('lead')),
          url, image: cover, imageAlt: t('title'), type: 'article', alternates,
          routeKey: 'blogpost',
          // <html lang> bu sayfanin GERCEK dili olsun: JS calistirmayan bir
          // tarayici/tarayici-botu Ingilizce govdeyi lang="tr" altinda
          // gormesin (2026-07-27: uc dil de lang="tr" ile yayindaydi).
          lang,
          jsonLd: { '@context': 'https://schema.org', '@graph': [articleLd] },
        }, blogArticleBody(a, lang, blogPriceMap)));
        blogUrls.push({ loc: url, lastmod: lastmodAtLeastVersion(a.updated || a.publishedAt), changefreq: 'weekly', priority: '0.7' });
      }
    }
  }
  console.log(`[seo] wrote ${Math.max(0, blogUrls.length - 1)} blog article shells`);

  // 2g) ANALIZLER — /analiz listesi + /analiz/<slug>.
  //
  // Sayfa Article + FAQPage semasi tasir. FAQ, admin panelinde elle duzenlenen
  // ve insanlarin arama kutusuna GERCEKTEN yazdigi sorulari hedefleyen
  // bloklardan gelir ("batarya omru nasil", "oyun icin uygun mu") — sayfa
  // basliklarinin tekrari degil. Uzun kuyruk trafigin girisi burasi.
  // `analyses` YUKARIDA cekildi (urun kabuklari ona link verdigi icin) —
  // burada ikinci kez cekmek ayni veriyi iki kez indirmek olurdu.
  const analizUrls = [];
  // ANALIZ KABUKLARINI DIL DIL SIL. Uretilmeyen agac kendiliginden SILINMEZ:
  // yayindan kaldirilan ya da bir dilde raporu olmayan analizin eski kabugu
  // yerinde kalir, sitemap'ten dusse bile adres 200 dondurmeye devam eder ve
  // Google onu "artik hicbir yerden linklenmemis, guncellenmeyen sayfa" olarak
  // gorur. `analiz` prebuild'in wipe listesinde OLAMAZ — dil onekli karsiligi
  // (`website/tr/analiz`) orada temizlenemezdi; kategori/compare ile ayni
  // gerekce ve ayni yer.
  for (const lang of SEO_LOCALES) {
    const analizRoot = join(site, localePrefix(lang).replace(/^\//, ''), 'analiz');
    if (!existsSync(analizRoot)) continue;
    for (const entry of readdirSync(analizRoot, { withFileTypes: true })) {
      if (entry.isDirectory()) { try { rmSync(join(analizRoot, entry.name), { recursive: true, force: true }); } catch (_) {} }
    }
  }
  if (analyses.length) {
    const listLastmod = lastmodAtLeastVersion(analyses[0]?.updated);
    for (const lang of SEO_LOCALES) {
      const prefix = localePrefix(lang);
      const tx = ANALIZ_LISTE_TEXT[lang] || ANALIZ_LISTE_TEXT[SEO_DEFAULT_LOCALE];
      const url = `${SITE}${prefix}/analiz`;
      writeHtml(`${prefix}/analiz`.replace(/^\//, ''), renderPage(template, {
        title: tx.title, description: tx.desc, url, lang, type: 'website',
        routeKey: 'blog',
        alternates: hreflangAlts('/analiz'),
        jsonLd: {
          '@context': 'https://schema.org', '@type': 'CollectionPage',
          '@id': `${url}#page`, url, name: tx.h1,
        },
        headExtra: analizTohumBlogu(analyses),
      }, localizeBodyLinks(analizListeBody(analyses, lang), lang)));
      analizUrls.push({
        loc: url, lastmod: listLastmod, changefreq: 'weekly',
        priority: lang === SEO_DEFAULT_LOCALE ? '0.7' : '0.6',
      });
    }
    // Analiz artik DIL BASINA AYRI ADRESTE: `/analiz/<slug>` (EN) ve
    // `/tr/analiz/<slug>`. Onceden tek adres vardi ve hreflang kumesi iki dili
    // de AYNI adrese isaret ediyordu — yani "alternatif" diye gosterilen sey
    // sayfanin kendisiydi, Google icin bilgi tasimayan bir dongu.
    //
    // Kayit iki raporu birden tasir (report_tr / report_en). Bir dilde rapor
    // YOKSA o dilin sayfasi da URETILMEZ ve hreflang'e girmez: var olmayan
    // alternatif uydurmak, tek adrese isaret etmekten daha kotu.
    for (const a of analyses) {
      if (!a.slug) continue;
      // DIKKAT: analysisReport() oteki dile DUSER; burada duserse Ingilizce
      // sayfaya Turkce metin basip onu hreflang ile alternatif diye gosteririz.
      const diller = analysisRenderLangs(a, SEO_DEFAULT_LOCALE).filter((l) => SEO_LOCALES.includes(l));
      if (!diller.length) continue;
      const img = /^https?:\/\//i.test(a.productImage || '') ? a.productImage : DEFAULT_IMG;
      const alternates = diller.map((l) => ({ hreflang: l, href: `${SITE}${localePrefix(l)}/analiz/${a.slug}` }));
      alternates.push({
        hreflang: 'x-default',
        href: `${SITE}${localePrefix(diller.includes(SEO_DEFAULT_LOCALE) ? SEO_DEFAULT_LOCALE : diller[0])}/analiz/${a.slug}`,
      });
      for (const lang of diller) {
        const prefix = localePrefix(lang);
        const url = `${SITE}${prefix}/analiz/${a.slug}`;
        // Baslik/aciklama sayfayi cizen bilesenle AYNI fonksiyondan gelir
        // (lib/analysisRecord.js) — admin metaTitle/metaDescription yazdiysa
        // onlar, yazmadiysa rapordan turetilenler.
        const anBaslik = analysisMetaTitle(a, lang);
        const anOzet = analysisMetaDescription(a, lang);
        const faq = analysisFaq(a, lang).slice(0, 8);
        const graph = [{
          '@type': 'Article', '@id': `${url}#article`,
          headline: analysisTitle(a, lang), description: truncate(anOzet),
          image: [img], datePublished: a.publishedAt || a.created, dateModified: a.updated,
          inLanguage: lang,
          author: { '@type': 'Organization', name: (a.author || '').trim() || 'Qor AI' },
          publisher: { '@type': 'Organization', name: 'Qor AI', logo: { '@type': 'ImageObject', url: DEFAULT_IMG } },
          mainEntityOfPage: url,
        }];
        if (faq.length) {
          graph.push({
            '@type': 'FAQPage', '@id': `${url}#faq`,
            mainEntity: faq.map((f) => ({
              '@type': 'Question', name: f.q,
              acceptedAnswer: { '@type': 'Answer', text: f.a },
            })),
          });
        }
        const listeTx = ANALIZ_LISTE_TEXT[lang] || ANALIZ_LISTE_TEXT[SEO_DEFAULT_LOCALE];
        graph.push({
          '@type': 'BreadcrumbList', '@id': `${url}#breadcrumb`,
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'Qor AI', item: `${SITE}${prefix || '/'}` },
            { '@type': 'ListItem', position: 2, name: listeTx.h1, item: `${SITE}${prefix}/analiz` },
            { '@type': 'ListItem', position: 3, name: analysisTitle(a, lang), item: url },
          ],
        });
        writeHtml(`${prefix}/analiz/${a.slug}`.replace(/^\//, ''), renderPage(template, {
          title: fitTitle(anBaslik, [' | Qor AI'], 68),
          description: truncate(anOzet),
          url, image: img, imageAlt: analysisSubject(a, lang) || anBaslik, type: 'article',
          alternates, routeKey: 'blogpost', lang,
          jsonLd: { '@context': 'https://schema.org', '@graph': graph },
        }, localizeBodyLinks(analizBody(a, lang), lang)));
        analizUrls.push({
          loc: url, lastmod: lastmodAtLeastVersion(a.updated || a.publishedAt),
          changefreq: 'monthly', priority: lang === SEO_DEFAULT_LOCALE ? '0.8' : '0.7',
        });
      }
    }
  }
  console.log(`[seo] wrote ${analizUrls.length} analiz adresi (${analyses.length} kayit x dil + ${SEO_LOCALES.length} liste kabugu)`);

  // 3) sitemap — chunked into <=45k-URL files (sitemaps cap at 50k) with a
  //    sitemap index. A single 106k-URL sitemap is invalid per the spec.
  const CHUNK = 45000;
  const routeUrls = [];
  for (const r of STATIC_ROUTES.filter((x) => x.sitemap !== false && !x.noindex && !x.seo?.noindex)) {
    routeUrls.push({ loc: `${SITE}${r.path}`, lastmod: SEO_CONTENT_VERSION, changefreq: r.changefreq, priority: r.priority });
    // Mirror the tr variants we actually prerendered (isMultilangRoute) so the
    // language pages get crawled, not just discovered via hreflang.
    if (isMultilangRoute(r)) {
      for (const l of SEO_LOCALES.filter((x) => x !== SEO_DEFAULT_LOCALE)) {
        routeUrls.push({ loc: `${SITE}/${l}${r.path}`, lastmod: SEO_CONTENT_VERSION, changefreq: r.changefreq, priority: r.priority });
      }
    }
  }
  // Only categories we actually generated a content shell for (curatedByCat),
  // including the tr variants we now prerender alongside the root. lastmod = the
  // newest product in the category — a real change signal, not the build date.
  const categoryUrls = [];
  const prodTs = (d) => Number(d.updatedAtTs || d.scrapedAtTs) || 0;
  for (const [cat, picked] of [...curatedByCat.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const p = categoryPath(cat);
    if (!p) continue;
    const lastmod = lastmodFromTs(Math.max(0, ...picked.map(prodTs)));
    categoryUrls.push({ loc: `${SITE}${p}`, lastmod, changefreq: 'weekly', priority: '0.8' });
    for (const l of SEO_LOCALES.filter((x) => x !== SEO_DEFAULT_LOCALE)) categoryUrls.push({ loc: `${SITE}/${l}${p}`, lastmod, changefreq: 'weekly', priority: '0.8' });
  }
  // Only the curated, prerendered products go in the sitemap. Listing all 106k
  // (which serve the generic SPA shell with no per-product HTML) is exactly what
  // wasted crawl budget and produced the duplicate signal that blocked indexing.
  // Üç dilin de ön-render'ı üretildiği için üçü de sitemap'e girer — aksi halde
  // dil varyantları yalnız hreflang üzerinden keşfedilir ve taranmaları gecikir.
  const productUrls = prerendered.flatMap(({ d, path }) => {
    const lastmod = lastmodFromTs(d.updatedAtTs || d.scrapedAtTs);
    return SEO_LOCALES.map((l) => ({
      loc: `${SITE}${localePrefix(l)}${path}`, lastmod, changefreq: 'weekly',
      priority: l === SEO_DEFAULT_LOCALE ? '0.6' : '0.5',
    }));
  });
  const compareUrls = compares.flatMap(({ a, b, path }) => {
    const lastmod = lastmodFromTs(Math.max(prodTs(a), prodTs(b)));
    return SEO_LOCALES.map((l) => ({
      loc: `${SITE}${localePrefix(l)}${path}`, lastmod, changefreq: 'monthly',
      priority: l === SEO_DEFAULT_LOCALE ? '0.5' : '0.4',
    }));
  });
  const allUrls = [...routeUrls, ...categoryUrls, ...productUrls, ...compareUrls, ...blogUrls, ...analizUrls];

  const renderUrlset = (items) =>
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + items.map((u) =>
      `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}`
      + `<changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`,
    ).join('\n')
    + '\n</urlset>\n';

  for (const file of readdirSync(site).filter((name) => /^sitemap-\d+\.xml$/.test(name))) {
    try { rmSync(join(site, file), { force: true }); } catch (_) {}
  }

  const chunks = [];
  for (let i = 0; i < allUrls.length; i += CHUNK) chunks.push(allUrls.slice(i, i + CHUNK));
  let sitemapFiles = 1;
  if (chunks.length <= 1) {
    writeTextFile(join(site, 'sitemap.xml'), renderUrlset(chunks[0] || []), { optional: true });
  } else {
    chunks.forEach((c, i) => {
      writeTextFile(join(site, `sitemap-${i + 1}.xml`), renderUrlset(c), { optional: true });
    });
    const index =
      '<?xml version="1.0" encoding="UTF-8"?>\n'
      + '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
      + chunks.map((_, i) =>
        `  <sitemap><loc>${SITE}/sitemap-${i + 1}.xml</loc></sitemap>`,
      ).join('\n')
      + '\n</sitemapindex>\n';
    writeTextFile(join(site, 'sitemap.xml'), index, { optional: true });
    sitemapFiles = chunks.length + 1;
  }

  // 4) robots.txt
  writeTextFile(
    join(site, 'robots.txt'),
    [
      'User-agent: *',
      'Allow: /',
      'Disallow: /go',
      '',
      `Sitemap: ${SITE}/sitemap.xml`,
      '',
    ].join('\n'),
  );

  // 5) llms.txt — llmstxt.org convention: a concise machine-readable site guide
  //    for AI answer engines (ChatGPT, Perplexity, Copilot, Claude). They already
  //    crawl the site (robots allows *); this tells them what Qor AI is and where
  //    the high-value pages live, improving citation/mention odds in AI answers.
  writeTextFile(join(site, 'llms.txt'), [
    '# Qor AI',
    '',
    '> Qor AI (qorai.net), teknoloji ürünlerini ve dijital abonelikleri yapay zekâ ile analiz eden,',
    '> karşılaştıran ve kişiye özel öneren ürün karar asistanıdır. AI product & subscription advisor:',
    '> compare tech products side by side, paste any product link for an instant AI analysis, and get',
    '> an AI tech score (0-100). Languages: English (/), Turkish (/tr). Also on Android.',
    '',
    '## Ana bölümler / Main sections',
    `- [Kategoriler / Categories](${SITE}/category): ${curatedByCat.size} teknoloji kategorisinde AI puanlı ürünler`,
    `- [Abonelik Karşılaştırma / Subscriptions](${SITE}/subscriptions): Netflix, Spotify, YouTube Premium, ChatGPT Plus…`,
    `- [Link Analizi / Link Analysis](${SITE}/link-analysis): ürün linki yapıştır, AI analiz etsin`,
    `- [Qor AI Sohbet / AI Chat](${SITE}/ai-chat)`,
    `- [Blog & Alım Rehberleri / Buying guides](${SITE}/blog)`,
    '',
    '## Veri / Data',
    `- [Sitemap](${SITE}/sitemap.xml): ${allUrls.length} sayfa — ürün (/product/<slug>-<id>), karşılaştırma (/compare/<a>-vs-<b>), kategori, rehber`,
    '- Her ürün sayfası: teknik özellik tablosu + Qor AI teknik skoru + benzer model linkleri',
    '',
    '## Politikalar / Policies',
    `- [Hakkında / About](${SITE}/about), [Gizlilik / Privacy](${SITE}/privacy), [Koşullar / Terms](${SITE}/terms), [İletişim / Contact](${SITE}/contact)`,
    '',
  ].join('\n'));

  // 6) IndexNow key file (served at https://qorai.net/<key>.txt) — proves
  //    ownership so the scheduled refresh can push changed URLs to IndexNow.
  writeTextFile(join(site, `${INDEXNOW_KEY}.txt`), `${INDEXNOW_KEY}\n`);

  // 7) 403 SÜPÜRMESİ — kendi index.html'i olmayan HER ara dizine kabuk yaz.
  //
  // nginx bir dizin isteğini `/dir/`ye 301'ler; dizinde index.html yoksa
  // (dizin listeleme kapalı) **403 Forbidden** döner. `website/compare/`
  // 1288 ön-render sayfa tutuyordu ama kendi index.html'i yoktu → karşılaştırma
  // ekranında SAYFA YENİLEMEK her seferinde 403 veriyordu. Aynı durum
  // `/tr/product/` ve `/tr/compare/` için de
  // geçerliydi: tek dilli rota kabukları yalnız varsayılan dile yazılıyor ama
  // ürün/karşılaştırma sayfaları her dile yazılıyor.
  //
  // Tek tek rota eklemek yerine çıktı ağacını tarayıp eksik olanı dolduruyoruz;
  // ileride yeni bir ön-render kökü eklenirse kendiliğinden kapsanır.
  {
    let patched = 0;
    const skip = new Set(['spa', 'assets']);
    const sweep = (dir) => {
      const entries = readdirSync(dir, { withFileTypes: true });
      const subdirs = entries.filter((e) => e.isDirectory() && !skip.has(e.name));
      const hasIndex = entries.some((e) => e.isFile() && e.name === 'index.html');
      // KOK DIZIN BU SUPURMENIN KONUSU DEGIL. Buraya yazilan kabuk BOS GOVDELI
      // ve `noindex`; ana sayfa icin bu felaket olurdu ve sessizce olurdu.
      // Olculdu 2026-08-29: `writeTextFile` hedefi once `rmSync` ile siliyor,
      // sonra `rename` ediyor — Windows'ta o dosyada kilit hatasi gorulmustu
      // (`UNKNOWN: unknown error, open 'website/index.html'`). Dosya o kisa
      // pencerede yoksa supurme ana sayfayi bos noindex kabukla EZIYOR;
      // seo-audit "homepage #root prerender body is missing" diye build'i
      // durdurdu. Ana sayfa 1. adimda yaziliyor; yoksa bu bir HATA'dir,
      // ustunu ortmek degil gormek gerekir.
      if (dir === site) {
        if (!hasIndex) throw new Error('[seo] website/index.html kayboldu — ana sayfa kabugu yazilamadi');
        for (const s of subdirs) sweep(join(dir, s.name));
        return;
      }
      if (subdirs.length && !hasIndex) {
        const rel = dir.slice(site.length).replace(/\\/g, '/').replace(/^\//, '');
        const lang = SEO_LOCALES.find((l) => rel === l || rel.startsWith(`${l}/`)) || SEO_DEFAULT_LOCALE;
        writeHtml(rel, renderPage(template, {
          title: 'Qor AI', description: 'Qor AI', noindex: true,
          url: `${SITE}/${rel}`, lang,
        }, ''));
        patched += 1;
      }
      for (const s of subdirs) sweep(join(dir, s.name));
    };
    sweep(site);
    if (patched) console.log(`[seo] 403-süpürmesi: ${patched} dizine eksik index.html yazıldı`);
  }

  console.log(`[seo] wrote ${STATIC_ROUTES.length} route shells, ${prerendered.length} product shells, ${sitemapFiles} sitemap file(s) for ${allUrls.length} urls, robots.txt, indexnow key`);
}

main().catch((err) => {
  console.error('[seo] fatal:', err);
  process.exit(1);
});
