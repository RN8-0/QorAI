// ═══════════════════════════════════════════════════════════════════════════
//  SPEC I18N KOPRUSU — kaynak: admin/js/spec_i18n.js (TEK KOPYA)
//
//  Urun ozelliklerinin etiket/deger cevirisi burada YENIDEN YAZILMAZ. Admin
//  paneli ile sitenin ayni metni gostermesinin tek garantisi ayni DOSYAYI
//  calistirmaktir; ikinci bir kopya kacinilmaz olarak ayrisir (olculdu:
//  admin "Drop-resistance class" gosterirken site "Dusme Direnci Sinifi"
//  gosteriyordu — web tarafi cevrilemeyen etiketi ASCII'ye katlayip sahte
//  Ingilizce uretiyordu).
//
//  Dosya neden admin/ altinda: admin DERLENMEYEN statik bir site, tarayici
//  yalnizca kendi kok dizinindeki dosyayi cekebiliyor. Site ise derleme
//  aninda ice aktardigi icin calisma zamaninda admin'e BAGIMLI DEGIL.
// ═══════════════════════════════════════════════════════════════════════════
import '../../../admin/js/spec_i18n.js';

const API = globalThis.QorAiSpecI18n;

if (!API) {
  // Sessizce yanlis metin basmaktansa gurultu cikar: bu import bozulursa
  // sayfa Turkce/Ingilizce karisik render eder ve kimse fark etmez.
  console.error('[specI18n] admin/js/spec_i18n.js yuklenemedi');
}

/**
 * Bir urun kaydini + gorunum dilini alir, ekrana basilacak YERELLESTIRILMIS
 * modeli dondurur: { name, sections, flat, keySpecs, valueLines, resolve }.
 * Admin modali BIREBIR ayni fonksiyonu cagirir.
 */
export function localizeProduct(product, lang, options) {
  return API.localizeProduct(product, lang, options || {});
}

/** Tek bir metni (etiket ya da deger) yerellestirir. */
export function createSpecLocalizer(options) {
  return API.createSpecLocalizer(options || {});
}

/** Bir spec degerini gorunecek satirlara boler (admin fmtSpecVal ile ayni). */
export function splitSpecValueLines(value) {
  return API.splitSpecValueLines(value);
}

export default API;
