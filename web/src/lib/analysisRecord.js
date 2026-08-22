// ═══════════════════════════════════════════════════════════════════════════
//  `analyses` KAYDI -> EKRANA CIKACAK SEKIL
//
//  Uc akis (urun / link / abonelik) AYNI sablonu (components/AiReportView.jsx)
//  cizer ama depoda tuttuklari HAM sekil farkli:
//    product      -> `product_full_report` (report.product + report.community)
//    link         -> zaten ortak ("enhanced") sekil
//    subscription -> zaten ortak ("enhanced") sekil
//  Bu dosya farki TEK YERDE kapatir. Ayni mantik ON-RENDER'da da lazim
//  (web/scripts/seo.mjs), o yuzden JSX yok, saf ESM: Node dogrudan import eder.
//
//  DIL: kayit iki raporu birden tasir (report_tr / report_en). Okuma sirasi
//  daima "istenen dil -> oteki dil -> tek dilli eski `report` alani".
// ═══════════════════════════════════════════════════════════════════════════
import { productReportToUnified } from './reportAdapters.js';

export const ANALYSIS_KINDS = ['product', 'link', 'subscription'];

/** Turu dondurur; alan bos olan ESKI kayitlar urun analizidir. */
export function analysisKind(rec) {
  const k = String(rec?.kind || '').trim().toLowerCase();
  return ANALYSIS_KINDS.includes(k) ? k : 'product';
}

const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);

/** Istenen dildeki HAM rapor (yoksa oteki dil, yoksa eski tek dilli alan). */
export function analysisReport(rec, lang) {
  if (!rec) return null;
  const other = lang === 'tr' ? 'en' : 'tr';
  return obj(rec[`report_${lang}`]) || obj(rec[`report_${other}`]) || obj(rec.report);
}

/** Hangi dillerde gercek rapor var? (admin ve on-render ikisi de sorar) */
export function analysisLangs(rec) {
  return ['tr', 'en'].filter((l) => obj(rec?.[`report_${l}`]));
}

/**
 * ON-RENDER icin dil listesi — `analysisReport()` gibi OTEKI DILE DUSMEZ.
 *
 * NEDEN AYRI: `analysisReport()` bilerek toleransli; kullanici bir adrese
 * gelmisse eline bos sayfa degil, oteki dildeki rapor gecsin. Ama ON-RENDER'da
 * ayni tolerans, `<html lang="en">` diyen bir sayfaya Turkce metin basmak ve
 * onu hreflang ile "Ingilizce alternatif" diye Google'a gostermek demek —
 * yani var olmayan bir alternatif uydurmak.
 *
 * Hicbir dilde kendi raporu olmayan ESKI kayitlar (yalniz tek dilli `report`
 * alani) varsayilan dilde TEK sayfa uretir: adresleri zaten dizinde ve
 * ikinci bir dil sayfasi ayni metnin kopyasi olurdu.
 */
export function analysisRenderLangs(rec, defaultLocale = 'en') {
  const own = analysisLangs(rec);
  if (own.length) return own;
  return obj(rec?.report) ? [defaultLocale] : [];
}

/**
 * AiReportView'in bekledigi ORTAK sekil. Urun raporu adaptorden gecer;
 * link/abonelik raporu zaten ortak sekildedir.
 */
export function analysisUnified(rec, lang) {
  const raw = analysisReport(rec, lang);
  if (!raw) return null;
  if (analysisKind(rec) === 'product') {
    return raw.product ? productReportToUnified(raw) : null;
  }
  // Link/abonelik: `enhanced` objesi dogrudan cizilir.
  return raw.enhancedScore != null || raw.base ? raw : null;
}

/** Analizin KONUSU — urun adi, ya da link/abonelik icin konu adlari. */
export function analysisSubject(rec, lang) {
  if (!rec) return '';
  const names = Array.isArray(rec.subjectNames) ? rec.subjectNames.filter(Boolean) : [];
  if (names.length) return names.join(' · ');
  if (rec.productName) return rec.productName;
  const raw = analysisReport(rec, lang);
  if (!raw) return '';
  // Uc sekil, uc yer: ortak sekil `base.title`, urun raporu `product.name`,
  // abonelik `services[].name`, karsilastirma `products[].name`.
  const fromList = (list) => (Array.isArray(list) ? list.map((x) => x?.name).filter(Boolean).join(' · ') : '');
  return String(
    raw.base?.title || raw.product?.name || fromList(raw.services) || fromList(raw.products) || '',
  ).trim();
}

const KIND_LABEL = {
  product: { en: 'AI Analysis', tr: 'Yapay Zekâ Analizi' },
  link: { en: 'AI Link Analysis', tr: 'Yapay Zekâ Link Analizi' },
  subscription: { en: 'AI Subscription Analysis', tr: 'Yapay Zekâ Abonelik Analizi' },
};

/** Baslikta kullanilan UZUN tur adi ("Yapay Zeka Link Analizi"). */
export function analysisKindLabel(rec, lang) {
  const row = KIND_LABEL[analysisKind(rec)] || KIND_LABEL.product;
  return row[lang === 'tr' ? 'tr' : 'en'];
}

const KIND_SHORT = {
  product: { en: 'Product', tr: 'Ürün' },
  link: { en: 'Link', tr: 'Link' },
  subscription: { en: 'Subscription', tr: 'Abonelik' },
};

/**
 * ROZET metni — uzun adin kisasi. Rozet, basligin altinda tek satirlik bir
 * kunye satirinda duruyor; uzun ad orada dort satira sariyor ve satiri
 * kartin en dikkat ceken ogesi yapiyordu. Rozetin isi turu ayirt etmek,
 * basligi tekrar etmek degil.
 */
export function analysisKindShort(rec, lang) {
  const row = KIND_SHORT[analysisKind(rec)] || KIND_SHORT.product;
  return row[lang === 'tr' ? 'tr' : 'en'];
}

/**
 * Sayfa basligi. Admin dil basina bir baslik URETIR (title_tr/title_en);
 * yoksa konu + tur etiketinden turetilir. Ayni dilde iki analizin ayni
 * basligi tasimamasi seo-audit kapisiyla korunur.
 */
export function analysisTitle(rec, lang) {
  const stored = String(rec?.[`title_${lang}`] || '').trim();
  if (stored) return stored;
  const subject = analysisSubject(rec, lang);
  const label = analysisKindLabel(rec, lang);
  return subject ? `${subject} — ${label}` : label;
}

/**
 * Liste ozeti / meta description kaynagi.
 *
 * Admin bir ozet yazdiysa DAIMA o kullanilir. Yazmadiysa rapordan turetilir —
 * ve turetme her sekilde AYRI bir alandan gelir: ortak sekilde `headline`,
 * abonelikte kazananin gerekcesi, karsilastirmada oneri metni.
 */
export function analysisLead(rec, lang) {
  const stored = String(rec?.[`lead_${lang}`] || '').trim();
  if (stored) return stored;
  const raw = analysisReport(rec, lang);
  if (!raw) return '';
  if (Array.isArray(raw.services)) {
    return String(raw.winner?.reason || raw.winner?.recommendation || raw.recommendation || '').trim();
  }
  if (Array.isArray(raw.products)) {
    const cmp = raw.comparison || {};
    return String(cmp.recommendation || cmp.headToHead || '').trim().split(/(?<=[.!?])\s+/)[0] || '';
  }
  const u = analysisUnified(rec, lang);
  return String(u?.headline || u?.overallVerdict || '').trim();
}

/** <title> — admin metaTitle yazdiysa o, yoksa sayfa basligi. */
export function analysisMetaTitle(rec, lang) {
  return String(rec?.[`metaTitle_${lang}`] || '').trim() || analysisTitle(rec, lang);
}

/** meta description — admin yazdiysa o, yoksa ozet. */
export function analysisMetaDescription(rec, lang) {
  return String(rec?.[`metaDescription_${lang}`] || '').trim() || analysisLead(rec, lang);
}

/**
 * ANALIZI URETEN QUIZ — soru + secilen cevap (+ puana etkisi).
 *
 * Yayinlanan sayfanin okuyucusu quizi COZMEDI. "92/100 uyum" cumlesi, kimin
 * uyumu oldugu soylenmeden anlamsiz; o yuzden sayfa raporun USTUNDE bu
 * varsayimlari gosteriyor. Rapor govdesindeki "cevaplarin neyi degistirdi"
 * blogu AYRI bir soruyu yanitliyor (her cevap puani ne kadar oynatti).
 *
 * Kaynak DILE GORE rapordur, `quiz` alani degil: `quiz` adminde quizin
 * yanitlandigi dilde (Turkce) duruyor, rapor ise her dilde kendi metnini
 * tasiyor. Ikisi ayrisirsa Ingilizce sayfada Turkce soru cikar — bu tam
 * olarak bir kez yasandi.
 */
export function analysisQuiz(rec, lang) {
  const raw = analysisReport(rec, lang);
  if (!raw) return [];
  // Urun raporunda `product` altinda, link/abonelik raporunda ust seviyede.
  const list = Array.isArray(raw.product?.quizInsights)
    ? raw.product.quizInsights
    : (Array.isArray(raw.quizInsights) ? raw.quizInsights : []);
  return list
    .map((q) => ({
      soru: String(q?.topic || '').trim(),
      cevap: String(q?.answer || '').trim(),
      not: String(q?.note || '').trim(),
      etki: Number.isFinite(Number(q?.impact)) ? Number(q.impact) : null,
    }))
    .filter((q) => q.soru || q.cevap);
}

/** FAQ blogu — dil yoksa oteki dile duser (SSS bos kalmasin). */
export function analysisFaq(rec, lang) {
  const pick = (v) => (Array.isArray(v) ? v.filter((f) => f && f.q && f.a) : []);
  const own = pick(rec?.[`faq_${lang}`]);
  if (own.length) return own;
  return pick(rec?.[`faq_${lang === 'tr' ? 'en' : 'tr'}`]);
}

/** Analiz adresi. Dil oneki EN icin yok, TR icin `/tr`. */
export function analysisPath(rec, lang) {
  const slug = String(rec?.slug || '').trim();
  const prefix = lang === 'tr' ? '/tr' : '';
  return slug ? `${prefix}/analiz/${slug}` : `${prefix}/analiz`;
}
