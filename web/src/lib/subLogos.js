// ═══════════════════════════════════════════════════════════════════════════
//  ABONELIK LOGO KOPRUSU — kaynak: admin/js/sub_logos.js (TEK KOPYA)
//
//  Tablo neden admin/ altinda: admin DERLENMEYEN statik bir site, tarayici
//  yalnizca kendi kok dizinindeki dosyayi cekebiliyor. Site ise derleme
//  aninda ice aktardigi icin calisma zamaninda admin'e BAGIMLI DEGIL.
//  Ayni kalip: lib/specI18n.js.
// ═══════════════════════════════════════════════════════════════════════════
import '../../../admin/js/sub_logos.js';

const API = globalThis.QorSubLogos;

if (!API) {
  console.error('[subLogos] admin/js/sub_logos.js yuklenemedi');
}

/** Abonelik adindan yerel logo DOSYA ADI ('netflix.svg') ya da ''. */
export function localLogoFor(name) {
  return API ? API.logoFile(name) : '';
}

/** Abonelik adindan yayindaki TAM adres ya da ''. */
export function logoUrlFor(name) {
  return API ? API.logoUrl(name) : '';
}
