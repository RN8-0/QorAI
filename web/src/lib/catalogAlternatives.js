// ═══════════════════════════════════════════════════════════════════════════
//  RAPORDAKI ALTERNATIFI KATALOGDA BULMA
//
//  AI bir alternatifin ADINI veriyor. O ad Qor katalogunda gercekten varsa
//  kart, katalogun kendi gorseli ve `/product/<slug>` adresiyle cizilmeli:
//  okuyucu tiklayip urune gidebilsin. Yoksa kart eskisi gibi gorselsiz ve
//  linksiz kalir — uydurma bir adrese baglamak, baglamamaktan kotudur.
//
//  Eslestirme kurali (`pickCatalogMatch`) admin ile ORTAK ve MUHAFAZAKAR:
//  AI adindaki TUM jetonlar katalog adinda gecmeli ve katalog adinda fazladan
//  bir model niteleyicisi ("Pro", "Ultra", "Max"...) olmamali. Yani
//  "Xiaomi 15" -> "Xiaomi 15 Ultra" ESLESMEZ.
//
//  Dort akis da (urun / karsilastirma / link / abonelik) bunu cagirir.
// ═══════════════════════════════════════════════════════════════════════════
import { resolveCatalogAlternatives } from './aiPrompts';

/**
 * @param {Array} alternatives  rapordaki alternatif listesi ({name|title, ...})
 * @param {string} category     hedef urunun kategorisi (bos ise kategori kapisi yok)
 * @param {string} lang         katalog adinin hangi dilde yazilacagi
 */
export async function attachCatalogAlternatives(alternatives, { category = '', lang = 'en' } = {}) {
  const list = Array.isArray(alternatives) ? alternatives : [];
  if (!list.length) return list;
  // Katalog katmani DINAMIK yuklenir: link ve abonelik analizleri urun
  // katalogunu baska hicbir sey icin cekmiyor, o rotalara 1 istek + modul
  // bagimliligi eklemek istemiyoruz.
  const { searchProductsLean } = await import('./typesense');
  return resolveCatalogAlternatives(list, {
    search: (name) => searchProductsLean(name, 8),
    category,
    lang,
  });
}
