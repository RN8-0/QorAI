// Image loading for qorai.net.
//
// GEÇMİŞ: epey.com ürün görsellerini Cross-Origin-Resource-Policy başlığıyla
// sunuyordu ve Chromium bunları qorai.net üzerinde render etmeyi reddediyordu
// (net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin). Bu yüzden wsrv.nl proxy'si ÖNCE
// denenip orijinal URL son çare olarak tutuluyordu.
//
// 2026-07-30 CANLIDA ÖLÇÜLDÜ (origin https://qorai.net):
//   • doğrudan resim.epey.com  → BAŞARILI (b_ 831 ms, m_ 786 ms)
//   • wsrv.nl proxy            → BAŞARISIZ (704 ms sonra hata)
// Yani engel kalkmış, proxy ise çalışmıyor. Eski sıralama her görselde önce
// ~700 ms boşa bekleyip hata alıyor, sonra doğrudan URL'e düşüyordu → toplam
// ~1,5 s. "Görseller geç geliyor" şikayetinin kaynağı buydu.
//
// ARTIK: doğrudan Epey URL'i ÖNCE (slota uygun BOYUT varyantıyla), wsrv.nl
// yalnızca son çare olarak kalır — Epey ileride yine CORP koyarsa site
// kendiliğinden proxy'ye döner.

const PROXY = 'https://wsrv.nl/?url=';

// Pixel widths per layout slot (a little above display size for retina).
//
// ÖLÇÜLDÜ (2026-07-30, canlı /category/smartphones): kart görselleri ekranda
// ~136px genişlikte gösterilirken proxy'den 900px + q=94 isteniyordu — yani
// ~6.6 kat fazla piksel. wsrv.nl istekleri 1.5-1.9 s sürüyordu ("görseller geç
// geliyor" şikayetinin ana kaynağı). Boyutlar gerçek slot genişliğinin retina
// (2x) karşılığına çekildi; kalite webp için gözle ayırt edilemeyen 80'e indi.
const SIZE_W = { thumb: 180, list: 300, card: 420, full: 1200 };
// Mobil basamağı: 375px ekranda kart görseli ~114px yer kaplıyor, dpr=2 ile
// ~228px yeterli. Bu basamak olmadan tarayıcı en küçük seçenek olarak 420'yi
// indiriyordu; 260 ile mobilde piksel yükü ~%60 azalıyor.
const SIZE_W_SM = { thumb: 120, list: 200, card: 260, full: 800 };
// Retina/2x srcset için ikinci basamak. `sizes` ile birlikte tarayıcı, cihaz
// piksel oranına ve gerçek slot genişliğine göre EN KÜÇÜK yeterli dosyayı seçer
// — mobilde masaüstü boyutunda görsel inmesi de böylece biter.
const SIZE_W_2X = { thumb: 360, list: 600, card: 840, full: 1600 };
// Proxy'nin kendi CDN cache'i: uzun maxage → tekrar ziyaretlerde anında gelir.
const PROXY_TAIL = 'output=webp&we&q=80&maxage=1y';
const EPEY_RE = /resim\.epey\.com|(^|\.)epey\.com/i;
const BAD_IMAGE_RE = /(^|[/?&=_-])(reklam|advert|ads?|banner|kampanya|sponsor|promosyon|tema|site-logo|logo|favicon|yildiz|profil|yukleniyor|loading|placeholder)([/?&=_-]|$)/i;

function uniq(items) {
  return [...new Set(items.filter(Boolean))];
}

function imageIdentityKey(url) {
  let key = String(url || '').trim().toLowerCase();
  if (!key) return '';
  key = key.split(/[?#]/)[0].replace(/^https?:\/\//, '');
  key = key.replace(/(resim\.epey\.com\/[^/]+\/)[a-z]_/i, '$1');
  key = key.replace(/-(?:k|s|m|t|c|l|n)(\d*)\.(webp|jpe?g|png)$/i, '$1.$2');
  return key;
}

function uniqImages(items) {
  const out = [];
  const seen = new Set();
  for (const item of items.filter(Boolean)) {
    const key = imageIdentityKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function isBadProductImage(url) {
  if (!url || typeof url !== 'string') return true;
  const clean = url.trim();
  if (!clean) return true;
  if (clean.startsWith('data:') || clean.startsWith('/')) return false;
  return BAD_IMAGE_RE.test(decodeURIComponent(clean));
}

function epeyVariants(url, size) {
  const clean = String(url || '').trim();
  if (!EPEY_RE.test(clean)) return [clean];

  const variants = [];
  // Upgrade any small stored tier to the big one for large slots.
  // 2026-08-15 — SON `.replace` EKLENDİ. Öncekiler yalnızca m_/s_/k_ ÖNEKLİ
  // kayıtları b_'ye çeviriyordu; önek TAŞIMAYAN kayıtlarda `high === clean`
  // oluyor, yani "büyük varyant" aslında MASTER dosya oluyordu. Epey'de master
  // sıkıştırılmamış kaynak: ölçüldü (2026-08-15),
  //   samsung-z-fold8   master 905 KB (853x1842)  ·  b_  77 KB (278x600)
  //   1stplayer-cryo    master 320 KB (1000x1000) ·  b_ ...(600x600)
  // Ürün sayfasının hero'su bu yüzden 905 KB'a kadar dosya indiriyordu ve
  // yavaş 4G'de LCP görseli 4481 ms sürüyordu. Artık öneksiz dosya adına da
  // `b_` ekleniyor — Epey'in kendi ürün sayfasında kullandığı basamak bu.
  const high = clean
    .replace(/\/m_([^/?#]+)([?#].*)?$/i, '/b_$1$2')
    .replace(/\/s_([^/?#]+)([?#].*)?$/i, '/b_$1$2')
    .replace(/\/k_([^/?#]+)([?#].*)?$/i, '/b_$1$2')
    .replace(/(\/\d+\/)([^/?#]+)$/i, (m, folder, file) => (/^[a-z]_/i.test(file) ? m : `${folder}b_${file}`));
  // En küçük basamak (yükseklik 120 px). Galeri küçük resimleri ekranda 46x46
  // gösterilirken `m_` (320x320, 48 KB) iniyordu — 7 kat fazla piksel.
  const tiny = clean
    .replace(/\/[bmst]_([^/?#]+)([?#].*)?$/i, '/k_$1$2')
    .replace(/(\/\d+\/)([^/?#]+)$/i, (m, folder, file) => (/^[a-z]_/i.test(file) ? m : `${folder}k_${file}`));
  // Epey often exposes the master asset without the size prefix as well. When
  // older records stored m_/s_/k_ URLs, try that original candidate before the
  // medium fallback so the gallery is not locked to a low-res copy.
  const original = clean.replace(/\/[bmsk]_([^/?#]+)([?#].*)?$/i, '/$1$2');
  // Orta boy varyant. ÖNEMLİ: kayıtlı URL'lerin çoğu `b_...` (büyük) biçiminde
  // ve eski hali yalnızca prefix'SİZ dosya adına `m_` ekliyordu — yani `b_`
  // kayıtları için `m_` HİÇ üretilmiyordu. Kart görselleri bu yüzden 291x600
  // iniyordu. Artık her boyut öneki `m_`ye çevriliyor.
  const medium = clean
    .replace(/\/b_([^/?#]+)([?#].*)?$/i, '/m_$1$2')
    .replace(/\/s_([^/?#]+)([?#].*)?$/i, '/m_$1$2')
    .replace(/\/k_([^/?#]+)([?#].*)?$/i, '/m_$1$2')
    .replace(/(\/\d+\/)([^/?#]+)$/i, (m, folder, file) => (/^[a-z]_/i.test(file) ? m : `${folder}m_${file}`));

  // SLOTA UYGUN BOYUT ÖNCE. Kart/liste/thumb görselleri ekranda 40-140 px
  // gösteriliyor; oraya `b_` (ölçülen 291x600) göndermek boşa indirme demek —
  // `m_` (160x330) fazlasıyla yeterli ve belirgin ölçüde küçük. Yalnızca
  // galeri (`full`) büyük varyantı ister.
  if (size === 'full') {
    variants.push(high);
    // MASTER ARTIK `b_`DEN SONRA. Öncesinde `original` (öneksiz master) ikinci
    // sıradaydı ve `high === clean` olan kayıtlarda ilk aday oluyordu; bu da
    // hero'ya 900 KB'lık kaynak dosyayı çekiyordu. Master yalnızca `b_` 404
    // verirse devreye girer.
    variants.push(clean);
    if (original !== clean) variants.push(original);
    if (medium !== clean) variants.push(medium);
  } else if (size === 'thumb') {
    // Galeri/şerit küçük resimleri: 46-60 px slot, retina ile ~120-180 px.
    // `k_` (120 px) tam karşılığı; `m_` yedek kalır.
    if (tiny !== clean) variants.push(tiny);
    if (medium !== clean) variants.push(medium);
    variants.push(clean);
    variants.push(high);
  } else {
    if (medium !== clean) variants.push(medium);
    variants.push(clean);
    variants.push(high);
    // Prefix'siz "master" adayı EN SONA: ölçümde bu URL'ler 404 veriyor ve
    // sıranın başında olduğunda her görselde gereksiz bir başarısız istek +
    // bekleme üretiyordu (yüklenmeyen 22 görselin sebebi buydu).
    if (original !== clean) variants.push(original);
  }
  return uniq(variants);
}

// Wrap a remote URL in the image proxy. Local assets and data-URIs pass through
// untouched so the placeholder SVG and bundled assets keep working.
export function proxify(url, size = 'card') {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('data:') || url.startsWith('/') || url.includes('wsrv.nl')) return url;
  if (!EPEY_RE.test(url)) return url;
  const noProto = url.replace(/^https?:\/\//, '');
  const w = SIZE_W[size] || SIZE_W.card;
  return `${PROXY}ssl:${encodeURIComponent(noProto)}&w=${w}&${PROXY_TAIL}`;
}

/// Aynı görselin 2x basamağı — `srcset` için.
export function proxify2x(url, size = 'card') {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('data:') || url.startsWith('/') || url.includes('wsrv.nl')) return '';
  if (!EPEY_RE.test(url)) return '';
  const noProto = url.replace(/^https?:\/\//, '');
  const w = SIZE_W_2X[size] || SIZE_W_2X.card;
  return `${PROXY}ssl:${encodeURIComponent(noProto)}&w=${w}&${PROXY_TAIL}`;
}

/// `<img srcset>` değeri. Tarayıcı, cihaz piksel oranı + `sizes` ile birlikte
/// gereken EN KÜÇÜK dosyayı indirir. Proxy'den geçmeyen (Epey olmayan) veya
/// yerel görsellerde boş döner — o zaman sade `src` kullanılır.
export function imageSrcSet(url, size = 'card') {
  const one = proxify(url, size);
  const two = proxify2x(url, size);
  if (!two || one === two || !String(one).includes('wsrv.nl')) return '';
  const wSm = SIZE_W_SM[size] || SIZE_W_SM.card;
  const w1 = SIZE_W[size] || SIZE_W.card;
  const w2 = SIZE_W_2X[size] || SIZE_W_2X.card;
  const noProto = url.replace(/^https?:\/\//, '');
  const sm = `${PROXY}ssl:${encodeURIComponent(noProto)}&w=${wSm}&${PROXY_TAIL}`;
  return `${sm} ${wSm}w, ${one} ${w1}w, ${two} ${w2}w`;
}

export function imageCandidates(url, size = 'card') {
  if (isBadProductImage(url)) return [];
  const variants = epeyVariants(url, size);
  const proxied = variants.map((src) => proxify(src, size)).filter((s) => s && !variants.includes(s));
  // DOĞRUDAN URL'LER ÖNCE: canlı ölçümde doğrudan Epey çalışıyor, wsrv.nl
  // başarısız. Proxy önce denendiğinde her görsel ~700 ms boşa bekleyip hata
  // alıyordu. Proxy artık yalnızca son çare (Epey yine CORP koyarsa devreye
  // girer). Epey olmayan URL'ler zaten değişmeden geçer.
  return uniq([...variants, ...proxied]);
}

export function productImageList(product, size = 'card') {
  const raw = [
    product?.imageUrl,
    product?.imageURL,
    ...(Array.isArray(product?.images) ? product.images : []),
  ];
  return uniqImages(raw.filter((src) => !isBadProductImage(src)))
    .filter((src) => imageCandidates(src, size).length > 0);
}
