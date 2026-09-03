// ═══════════════════════════════════════════════════════════════════════════
//  ANALIZ KURALLARI — GERILEME TESTI
//
//  Kosum:  node scripts/analiz_kural_testi.mjs
//
//  NEDEN VAR: bu dosyadaki her kural bir kez CANLIDA kirildi ve kullanici
//  bildirdi. `node --check` hicbirini yakalamaz (sozdizimi dogru, DAVRANIS
//  yanlis). Prompt'u gercekten uretip icine bakan tek sey bu.
//
//  Kapsanan kurallar:
//    1. QUIZ    cevap yokken prompt'a quiz blogu girmemeli, quizInsights bos
//    2. FIYAT   kur cevirme / yabanci pazar / uyari listesi yasaklari DORT
//               akista da bulunmali
//    3. KAYNAK  prompt'a giden fiyat KURESEL EN UCUZ degil PAZAR fiyati
//    4. KAPI    enforcePriceDiscipline modelden cikan metni duzeltmeli ve
//               fiyatla ilgisiz icerigi SILMEMELI
//    5. RENK    nesirParagraflari her rapor seklinde paragraf bulmali
// ═══════════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import '../admin/js/qor_ai_prompts.js';

const P = globalThis.QorAiPrompts;
let hata = 0;
const yaz = (ok, ad, not = '') => {
  if (!ok) hata += 1;
  console.log(`  ${ok ? 'OK  ' : 'HATA'}  ${ad.padEnd(44)}${not}`);
};
const baslik = (t) => console.log(`\n${t}\n`);

// ── ortak kurgu ────────────────────────────────────────────────────────────
const taze = new Date(Date.now() + 7 * 864e5).toISOString();
// GERCEK katalog kaydinin sekli: `lowestPrice` KURESEL EN UCUZ (Ingiltere),
// `prices` ise ulke ulke. Olculdu 2026-09-03.
const iphone = {
  id: 'p1', name: 'Apple iPhone 17 Pro Max (512 GB)', brand: 'Apple', category: 'smartphones',
  techScore: 100, lowestPrice: 1189, lowestPriceCurrency: 'GBP',
  prices: { DE: 1499, GB: 1189, TR: 127949 }, lowestPriceUSD: 1510.03,
  bestOfferExpiresAt: taze, priceUpdatedAt: new Date().toISOString(),
  keySpecs: { Ekran: '6.9 inch', RAM: '12 GB' },
};
const samsung = {
  ...iphone, id: 'p2', name: 'Samsung Galaxy S26 Ultra (12 GB / 512 GB)', brand: 'Samsung',
  techScore: 99, lowestPrice: 88968.45, lowestPriceCurrency: 'TRY', prices: { TR: 88968.45 },
};
const eksen = P.compareFactorAxis([iphone, samsung], 'tr');
const bos = { quizAnswers: [], factorAxis: eksen };
const cevapli = { quizAnswers: [{ question: 'Kamera mı pil mi?', answer: 'Kamera' }], factorAxis: eksen };

const promptlar = {
  'ürün · rapor': P.buildFullPrompt(iphone, 'tr', {}, { ...bos, factorAxis: P.compareFactorAxis(iphone, 'tr') }),
  'ürün · araştırma': P.buildProductResearchPrompt(iphone, 'tr', { ...bos, factorAxis: P.compareFactorAxis(iphone, 'tr') }),
  'karşılaştırma · araştırma': P.buildCompareResearchPrompt([iphone, samsung], 'tr', bos),
  'karşılaştırma · ürün': P.buildCompareProductPrompt(iphone, 'tr', {}, { ...bos, peerNames: [samsung.name] }),
  'karşılaştırma · hüküm': P.buildCompareVerdictPrompt([iphone, samsung], [{ name: iphone.name }, { name: samsung.name }], 'tr', {}, bos),
  'karşılaştırma · tek çağrı': P.buildComparePrompt([iphone, samsung], 'tr', {}, bos),
};

// ── 1) QUIZ KAPISI ─────────────────────────────────────────────────────────
baslik('1) QUIZ — cevap yokken quiz bloğu prompt\'a girmemeli');
const QUIZ_BLOK = /^(COMPARISON QUIZ ANSWERS|Comparison quiz answers|PRODUCT-SPECIFIC QUIZ ANSWERS|Product-specific quiz answers|Quiz Answers):/mi;
for (const [ad, m] of Object.entries(promptlar)) {
  yaz(!QUIZ_BLOK.test(m) && /NO QUIZ WAS ANSWERED/i.test(m), ad,
    QUIZ_BLOK.test(m) ? 'cevap bloğu VAR' : '');
}
// Cevap VARSA eski davranis korunmali (site quizi hala kullaniyor)
yaz(QUIZ_BLOK.test(P.buildCompareProductPrompt(iphone, 'tr', {}, { ...cevapli, peerNames: [samsung.name] })),
  'cevap varsa quiz bloğu KORUNUR (site akışı)');
// Cevap yoksa quizInsights BOS DIZI olmali
for (const [ad, m] of Object.entries(promptlar)) {
  if (!/"quizInsights"/.test(m)) continue;
  yaz(/quizInsights MUST be an empty array/i.test(m), `${ad} · quizInsights boş dizi kuralı`);
}

// ── 2) FIYAT KURALLARI ─────────────────────────────────────────────────────
baslik('2) FİYAT KURALLARI — dört akışta da bulunmalı');
for (const [ad, m] of Object.entries(promptlar)) {
  if (/araştırma/.test(ad)) continue;            // araştırma prompt'u rapor yazmaz
  const kur = /NEVER convert it to another currency/.test(m);
  const yabanci = /NEVER take a price from the research notes/.test(m);
  const sagduyu = /PRICE SANITY/.test(m);
  const uyari = /NEVER put a price figure in weaknesses/.test(m);
  yaz(kur && yabanci && sagduyu && uyari, ad,
    `kur:${kur ? '+' : 'YOK'} yabancı:${yabanci ? '+' : 'YOK'} sağduyu:${sagduyu ? '+' : 'YOK'} uyarı:${uyari ? '+' : 'YOK'}`);
}

/* ETIKETTE ULKE KODU YOK (2026-09-03). Onceden "127949 TRY (TR)" yaziliyordu
   ve model bunu metne tasiyordu ("the Turkish price of…"). Rapor kuresel
   okuyucuya gidiyor; fiyatin hangi pazardan okundugu modelin isine yaramiyor,
   yazmasi yasak olan tek sey de zaten o (bkz. geoRulesBlock). */
// ── 3) FIYAT KAYNAGI ───────────────────────────────────────────────────────
baslik('3) FİYAT KAYNAĞI — küresel en ucuz DEĞİL, pazar fiyatı');
yaz(P.productLine(iphone, 'tr').price === '127949 TRY',
  'productLine ülke fiyatını verir', P.productLine(iphone, 'tr').price);
yaz(P.segmentPriceLocal(iphone, 'tr').label === '127949 TRY',
  'segmentPriceLocal ülke fiyatını verir', P.segmentPriceLocal(iphone, 'tr').label);
yaz(P.segmentPriceLocal({ priceTR: 75699, pricesByCountry: '{"TR":75699}', lowestPriceUSD: 2164.99 }, 'tr').label === '75699 TRY',
  'Typesense belgesinde de pazar fiyatı');
yaz(P.segmentPriceLocal({ lowestPrice: 1189, lowestPriceCurrency: 'GBP', prices: { GB: 1189 } }, 'tr').label === '1189 GBP',
  'TR yoksa var olan pazar (uydurma yok)');
yaz(P.segmentPriceLocal({ lowestPriceUSD: 1510 }, 'tr').label === '',
  'hiç fiyat yoksa boş (çeviri YOK)');
for (const [ad, m] of Object.entries(promptlar)) {
  yaz(!/\b1[.,]?189\s*GBP/.test(m) && !/\b\d[\d.,]*\s*USD\b/.test(m), `${ad} · yabancı tutar sızmıyor`);
}

// ── 4) DETERMINISTIK KAPI ──────────────────────────────────────────────────
baslik('4) enforcePriceDiscipline — modelden çıkan metni düzeltir');
const rapor = {
  products: [
    {
      name: samsung.name,
      factors: [{ label: 'Fiyat/performans', score: 85, detail: '88968.45 TRY fiyat etiketiyle rekabetçi bir konumdadır.' }],
      priceForecast: { analysis: 'Qor kataloğunda 88968.45 TRY fiyatla yer almaktadır.', drivers: ['Küresel çip maliyetleri'] },
      cons: ['Ekranda kırmızı tonlar bildirilmiştir.'],
    },
    {
      name: iphone.name,
      cons: ['1189 GBP\'lik fiyat etiketiyle yüksek bir başlangıç maliyetine sahiptir.', 'Wi-Fi sorunları rapor edilmiştir.'],
      criticalPoints: [
        // GERCEK VAKA: fiyat rakami ILK cumlede, arkasindan GERI GONDERME.
        // Ilk cumle atilinca "Bu durum" havada kalir; madde komple dusmeli.
        { title: 'Yüksek Başlangıç Fiyatı', detail: 'Cihazın 1189 GBP\'lik fiyat etiketi yüksek bir yatırım gerektirir. Bu durum, bütçe odaklı kullanıcılar için bir engel teşkil edebilir.' },
        { title: 'Wi-Fi Sorunları', detail: 'Bağlantı kopmaları rapor edilmiştir.' },
      ],
      factors: [{ label: 'Fiyat/performans', score: 70, detail: '1189 GBP\'lik fiyat etiketiyle üst segmentte yer alır.' }],
      // SEKIL FARKI: bazi kayitlarda priceForecast KOKTE duruyor; kapi ad
      // uzerinden gezdigi icin ikisini de yakalamali.
      priceForecast: { analysis: 'Mevcut 1189 GBP fiyat konumunu yansıtır.', drivers: ['Yüksek talep', 'GBP kur dalgalanmaları'] },
    },
  ],
  comparison: {
    decisiveDifferences: ['Samsung 200 MP kamera sunar.', 'iPhone\'un 1189 GBP fiyatı 88968.45 TRY\'ye kıyasla yüksektir.'],
    recommendation: 'Karar önceliklerinize bağlıdır. iPhone\'un 1189 GBP etiketi daha yüksek yatırım ister. Sonuç olarak iPhone öne çıkar.',
  },
};
P.enforcePriceDiscipline(rapor, {
  [samsung.name]: { tutar: 88968.45, para: 'TRY' },
  [iphone.name]: { tutar: 127949, para: 'TRY' },
}, 'tr');
const j = JSON.stringify(rapor);
yaz(!/GBP/.test(j), 'hiçbir yerde GBP kalmadı');
yaz(!/88968\.45/.test(j), 'ham sayı biçimlendi');
yaz(/88\.968,45 TL/.test(rapor.products[0].priceForecast.analysis), 'TR biçimi uygulandı');
yaz(/127\.949 TL/.test(rapor.products[1].factors[0].detail), 'faktör detayı katalog fiyatına döndü');
yaz(rapor.products[1].cons.length === 1 && /Wi-Fi/.test(rapor.products[1].cons[0]), 'cons: yalnız fiyat maddesi düştü');
yaz(rapor.products[1].criticalPoints.length === 1, 'kritik nokta: fiyat maddesi düştü');
yaz(!JSON.stringify(rapor.products[1].criticalPoints).includes('Bu durum'),
  'askıda kalan geri gönderme bırakılmadı');
yaz(!rapor.products[1].priceForecast.drivers.some((d) => /GBP/.test(d)), 'yabancı para etkeni düştü');
yaz(rapor.comparison.decisiveDifferences.length === 1, 'decisiveDifferences: fiyat maddesi düştü');
yaz(/200 MP/.test(rapor.comparison.decisiveDifferences[0]), 'fiyatsız fark KORUNDU');
yaz(!/1189/.test(rapor.comparison.recommendation) && /öne çıkar/.test(rapor.comparison.recommendation),
  'hüküm: yabancı tutarlı cümle atıldı, gerisi kaldı');

// ── 5) PARAGRAF RENGI KAPSAMI ──────────────────────────────────────────────
baslik('5) RENK — nesirParagraflari her rapor şeklinde paragraf bulmalı');
const runSrc = fs.readFileSync(new URL('../admin/js/qor_ai_run.js', import.meta.url), 'utf8');
const b0 = runSrc.indexOf('var NESIR_ALANLARI = [');
const s0 = runSrc.indexOf('/**', runSrc.indexOf('function nesirParagraflari'));
// eslint-disable-next-line no-new-func
const nesirParagraflari = new Function('P', `${runSrc.slice(b0, s0)}\nreturn nesirParagraflari;`)(P);
const par = (k) => `${k} bu bölümün ilk cümlesi ve hüküm taşıyor. İkinci cümle ayrıntıyı verir.`;
const sekiller = {
  ürün: { product: { analysis: par('A'), community: { summary: par('B') }, priceForecast: { analysis: par('C') }, bestFor: par('D') } },
  karşılaştırma: {
    products: [{ name: 'X', analysis: par('E'), community: { summary: par('F') } }],
    comparison: { headToHead: par('G'), headToHeadByProduct: [{ name: 'X', case: par('H'), against: par('I') }], recommendation: par('J') },
  },
  abonelik: { services: [{ name: 'N', analysis: par('K') }], winner: { reason: par('L') }, detailed: { fit: par('M'), ux: par('O') } },
};
for (const [ad, r] of Object.entries(sekiller)) {
  const bulunan = nesirParagraflari(r);
  const hepsi = new Set();
  (function gez(d) {
    if (typeof d === 'string') { if (d.length >= 40) hepsi.add(d); return; }
    if (Array.isArray(d)) { d.forEach(gez); return; }
    if (d && typeof d === 'object') Object.values(d).forEach(gez);
  }(r));
  const kacan = [...hepsi].filter((x) => !bulunan.some((b) => x.includes(b)));
  yaz(kacan.length === 0, `${ad} · ${bulunan.length}/${hepsi.size} paragraf`,
    kacan.length ? `KAÇAN: ${kacan.map((x) => x.slice(0, 10)).join(', ')}` : '');
}


// ── 6) COGRAFI NOTRLUK ─────────────────────────────────────────────────────
//  Site kuresel, rapor TEK KEZ uretilip herkese ayni gosteriliyor: metindeki
//  "launched in Turkey" cumlesini Fransa'dan giren okuyucu da goruyor.
//  Olcum (2026-09-03, canli 44 analiz): 35 kayitta ulke/milliyet adi vardi.
baslik('6) COĞRAFİ NÖTRLÜK — ülke/milliyet adı rapor metnine girmez');

// 6a. PROMPT: rapor yollarinin HEPSI kurali gormeli (bkz. "DÖRT prompt yolu"
//     dersi: buildFullPrompt'a eklenen kural yalnizca URUNDE gecerliydi).
for (const [ad, m] of Object.entries(promptlar)) {
  if (ad.includes('araştırma')) continue;       // arastirma cok dilli kalir
  yaz(/GEOGRAPHIC NEUTRALITY/.test(m), `${ad} · geo kuralı prompt'ta`);
}

// 6b. KOD KAPISI: prompt olasiliksal, kod kesin.
const geoVaka = (metin, lang) => { const r = { x: metin }; P.enforceGeoNeutrality(r, lang); return r.x; };
const geoVakalar = [
  ['en', 'The X was launched in Turkey in July 2026.', 'The X was launched in July 2026.'],
  ['en', 'Turkish users report battery drain.', 'Users report battery drain.'],
  ['en', 'The device is sold with Samsung Turkey’s official warranty.', 'The device is sold with Samsung’s official warranty.'],
  ['tr', 'Cihaz Türkiye pazarına Temmuz 2026’da sunuldu.', 'Cihaz Temmuz 2026’da sunuldu.'],
  ['tr', '65.449 TL fiyatıyla Türkiye’deki üst segmentte yer alır.', '65.449 TL fiyatıyla üst segmentte yer alır.'],
  ['tr', 'Fiyatların Türkiye gibi pazarlarda değişken olması beklenir.', 'Fiyatların pazarlarda değişken olması beklenir.'],
  // MENSE BILGISI KORUNUR: urun olgusu, okuyucunun konumu hakkinda varsayim degil.
  ['en', 'The device is built by a Chinese manufacturer.', 'The device is built by a Chinese manufacturer.'],
  ['tr', '6800 mAh (Çin) veya 6000 mAh (global) batarya taşır.', '6800 mAh (Çin) veya 6000 mAh (global) batarya taşır.'],
];
for (const [dil, giris, beklenen] of geoVakalar) {
  const c = geoVaka(giris, dil);
  yaz(c === beklenen, `${dil} · ${giris.slice(0, 32)}…`, c === beklenen ? '' : `ÇIKTI: ${c}`);
}

// 6c. DIL KAPISI: Ingilizce rapor kuresel okuyucuya gider, TL yazamaz.
yaz(geoVaka('Its price of 88,968.45 TRY is high. The camera is great.', 'en') === 'The camera is great.',
  'en · TRY tutarı taşıyan cümle düşer');
yaz(geoVaka('Fiyatı 68.999 TL seviyesindedir.', 'tr') === 'Fiyatı 68.999 TL seviyesindedir.',
  'tr · TL korunur (okuyucu bu pazarda)');
yaz(P.segmentPriceLocal({ prices: { TR: 90999 } }, 'en').label === '',
  'en · prompt’a TR fiyatı gitmez');
yaz(P.segmentPriceLocal({ prices: { TR: 90999 } }, 'tr').label === '90999 TRY',
  'tr · prompt’a TR fiyatı gider');

// 6d. DOKUNULMAZ ALANLAR. Bir surumde bas harf buyutmesi HER dizeye
//     uygulaniyordu: "qor_catalog" -> "Qor_catalog", "https://…" -> "Https://…".
const geoDokunma = {
  alternatives: [{ name: 'Xiaomi 17 Ultra', url: '/product/xiaomi-17', imageUrl: 'https://resim.epey.com/1.png', source: 'qor_catalog' }],
  community: { themes: [{ label: 'kamera', sentiment: 'positive', detail: 'Kamera iyi bulunuyor.' }] },
};
const geoOncesi = JSON.stringify(geoDokunma);
P.enforceGeoNeutrality(geoDokunma, 'tr');
yaz(JSON.stringify(geoDokunma) === geoOncesi, 'coğrafi ifade yoksa hiçbir alan değişmez');

// 6e. PARAGRAF RENKLERI TASINIR (anahtar = paragrafın ilk cümlesi).
const geoRenkli = {
  product: { analysis: 'Cihaz Türkiye’de çıktı. Ekran parlaktır.\n\nPil ömrü uzundur.' },
  paragraphSentiment: { 'Cihaz Türkiye’de çıktı.': 'positive', 'Pil ömrü uzundur.': 'positive' },
};
P.enforceGeoNeutrality(geoRenkli, 'tr');
yaz(geoRenkli.paragraphSentiment['Cihaz çıktı.'] === 'positive'
  && geoRenkli.paragraphSentiment['Pil ömrü uzundur.'] === 'positive',
'paragraf rengi yeni metne taşındı', JSON.stringify(geoRenkli.paragraphSentiment));

console.log(hata ? `\n${hata} HATA\n` : '\nHEPSİ GEÇTİ\n');
process.exit(hata ? 1 : 0);
