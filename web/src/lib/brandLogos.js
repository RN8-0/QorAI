// ═══════════════════════════════════════════════════════════════════════════
//  ELLE YÜKLENEN MARKA GÖRSELLERİ (PB `brand_logos`)
//
//  NEDEN VAR — ölçüldü 2026-08-28: abonelik karşılaştırmasında bazı servisler
//  logosuz çıkıyordu. Üç sebebi vardı; ikisi kodda düzeltildi (eşleme tablosu
//  `admin/js/sub_logos.js` içinde 40 addan 153 ada çıktı, `postbuild.mjs` artık
//  103 logo dosyasının tamamını yayına kopyalıyor). Üçüncüsü kodla
//  çözülemez: hiçbir tablonun tanımadığı yeni bir servis ya da ürün. Onun
//  için admin panelinden ADA bağlı görsel yüklenir ve bu katman onu okur.
//
//  Görsel ANALİZ KAYDINA DEĞİL ADA bağlıdır: "HBO" için bir kez yüklenen logo
//  her karşılaştırmada, abonelik kartında ve geçmişte geçerli olur.
//
//  Tek kaynak: çözümleme kuralları `admin/js/sub_logos.js` içinde yaşıyor
//  (aynı gerekçe: admin derlenmeyen statik bir site, site derleme anında
//  içe aktarıyor). Bu dosya yalnızca AĞ katmanı.
// ═══════════════════════════════════════════════════════════════════════════
import { pb, PB_URL } from './pocketbase';
import '../../../admin/js/sub_logos.js';

const API = globalThis.QorSubLogos;

// Mağaza ayarlarıyla aynı desen: oturum başına önbellek, 10 dakika.
const TTL_MS = 10 * 60 * 1000;
let cache = null;
let cachedAt = 0;
let inFlight = null;

/** PB'den ad→adres haritasını çeker ve paylaşılan çözümleyiciye yükler.
 *  Başarısız olursa SESSİZ kalır: geçersiz kılma bir ZENGİNLEŞTİRME katmanı,
 *  yerel tablo zaten çalışıyor. */
export async function loadBrandLogos() {
  const now = Date.now();
  if (cache && now - cachedAt < TTL_MS) return cache;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const harita = {};
    try {
      const rows = await pb.collection('brand_logos').getFullList({
        // `fields` ASLA undefined bırakılmaz: SDK yalnız `null`'ı atlar,
        // `fields=undefined` giderse PB boş nesne döndürür (destek kutusu dersi).
        fields: 'id,collectionId,key,image,imageUrl',
        $autoCancel: false,
      });
      for (const r of rows) {
        const url = API ? API.overrideUrlFromRecord(PB_URL, r) : '';
        if (r && r.key && url) harita[r.key] = url;
      }
    } catch { /* tablo yoksa ya da ağ yoksa yerel eşleme yeterli */ }
    if (API) API.setOverrides(harita);
    cache = harita;
    cachedAt = Date.now();
    inFlight = null;
    return harita;
  })();
  return inFlight;
}

/** Ada elle atanmış görselin adresi ya da ''. Harita yüklenmemişse '' döner. */
export function brandLogoOverride(name) {
  return API ? API.overrideFor(name) : '';
}

/** Yüklenen harita (test ve admin önizlemesi için). */
export function brandLogoMap() {
  return cache || {};
}
