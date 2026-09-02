// ═══════════════════════════════════════════════════════════════════════════
//  PARAGRAF DUYGUSU — SAF CEKIRDEK (JSX YOK)
//
//  JSX ICERMEZ ve bu BILEREK: `scripts/sentiment_backfill.mjs` ile
//  `web/scripts/seo.mjs` bunu Node'dan dogrudan import eder. Anahtar
//  uretimi (paragraphKey) goc ile on yuzde BIREBIR AYNI olmak zorunda;
//  iki kopya tutmak onlarin ayrismasi demekti.
//  React baglami ve kanca: lib/sentiment.jsx
//
//  KURAL: ON YUZ DUYGU TAHMIN ETMEZ. Burada hicbir kelime sozlugu, kok
//  listesi ya da puanlama yoktur. Etiket metinle birlikte KAYITTA gelir;
//  bu dosya yalnizca onu okur.
//
//  NEDEN. Onceki surum `POS_KOK` / `NEG_KOK` kok listeleriyle tahmin
//  ediyordu ve gercek cumlelerde tutarsizdi:
//     "…impacting the perceived smoothness"  -> 'smooth' kokuyle YESIL
//     "no problems reported"                 -> 'problem' kokuyle KIRMIZI
//     "While efficient, it conflicts with…"  -> 'efficient' kokuyle YESIL
//  Sozluge kelime eklemek bunu duzeltmez: sorun sozlugun eksikligi degil,
//  YONTEMIN kendisi. Ayni olcum sozluk tabanli surumde 8 gercek cumlede
//  3 hata veriyordu ve eksiklikleri OVGU gibi boyuyordu.
//
//  URETIM: yeni analizlerde etiketi AI raporla birlikte yazar
//  (admin/js/qor_ai_prompts.js -> paragraphSentiment). Eski kayitlar
//  `scripts/sentiment_backfill.mjs` ile bir kez etiketlenir. Iki yol da
//  AYNI siniflandirici sozlesmesini kullanir (scripts/sentiment_lib.mjs).
//
//  ETIKET YOKSA NOTR. Geriye donuk kelime tahmini YAPILMAZ — yanlis renk,
//  renksizlikten kotudur.
// ═══════════════════════════════════════════════════════════════════════════

export const POSITIVE = 'positive';
export const NEGATIVE = 'negative';
export const NEUTRAL = 'neutral';

/**
 * Paragrafin ANAHTARI: ilk cumlenin normalize hâli.
 *
 * Neden ilk cumle: etiket zaten ilk cumleye gore veriliyor, ve paragrafin
 * geri kalani duzenlenirse (kirpma, kod temizligi) anahtar bozulmasin.
 * Normalizasyon: kucuk harf, tum bosluklar tek boslu, noktalama atilir.
 * Uzunluk 90 karakterle sinirli — daha uzunu ayirt edicilige katki yapmiyor
 * ama kayit boyutunu buyutuyor.
 *
 * BU FONKSIYON GOC BETIGIYLE BIREBIR AYNI OLMAK ZORUNDA
 * (scripts/sentiment_backfill.mjs bunu import eder).
 */
export function paragraphKey(text) {
  const t = String(text || '').trim();
  if (!t) return '';
  const ilkCumle = t.split(/(?<=[.!?])\s+/)[0] || t;
  return ilkCumle
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

/** Kayittaki duygu haritasini normalize et: {anahtar: 'positive'|…}. */
export function sentimentIndex(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = new Map();
  for (const [k, v] of Object.entries(raw)) {
    const d = String(v || '').toLowerCase();
    if (d === POSITIVE || d === NEGATIVE) out.set(String(k), d);
    // 'neutral' SAKLANMAZ: varsayilan zaten notr, haritayi sisirmenin anlami yok.
  }
  return out.size ? out : null;
}


/** Duygu -> CSS sinif eki. Renk karari JSX icinde HESAPLANMAZ. */
export function sentimentClass(duygu) {
  return duygu === POSITIVE ? ' pos' : duygu === NEGATIVE ? ' neg' : '';
}

/**
 * TEK SINIFLANDIRICI. Butun analiz turleri (urun, karsilastirma, ozellik,
 * topluluk, alim tavsiyesi, fiyat, alternatifler) bunu cagirir — tur basina
 * ayri `analysisSentiment` / `comparisonSentiment` fonksiyonu YOKTUR.
 *
 * Salt okuma: metadata varsa etiketi, yoksa 'neutral'. TAHMIN YOK.
 */
export function classifyParagraphSentiment(text, index) {
  if (!index) return NEUTRAL;
  const k = paragraphKey(text);
  if (!k) return NEUTRAL;
  return (index instanceof Map ? index.get(k) : index[k]) || NEUTRAL;
}
