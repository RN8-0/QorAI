// Image loading for qorai.net.
//
// epey.com serves its product images with a Cross-Origin-Resource-Policy
// header, so Chromium browsers may refuse to render them when they're embedded
// on qorai.net (net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin). We use wsrv.nl
// first for Epey assets and keep the original URL only as a last fallback.

const PROXY = 'https://wsrv.nl/?url=';

// Pixel widths per layout slot (a little above display size for retina).
const SIZE_W = { thumb: 260, list: 360, card: 900, full: 1600 };
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
  key = key.replace(/-(?:k|s|m|t|c|l|n)\.(webp|jpe?g|png)$/i, '.$1');
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
  const high = clean
    .replace(/\/m_([^/?#]+)([?#].*)?$/i, '/b_$1$2')
    .replace(/\/s_([^/?#]+)([?#].*)?$/i, '/b_$1$2')
    .replace(/\/k_([^/?#]+)([?#].*)?$/i, '/b_$1$2');
  // Stored URLs are now the original master (no size prefix). Derive a medium
  // fallback so a missing master (404) still renders instead of breaking.
  const medium = clean.replace(/(\/\d+\/)([^/?#]+)$/i, (m, folder, file) =>
    /^[a-z]_/i.test(file) ? m : `${folder}m_${file}`);

  if (size === 'card' || size === 'full') variants.push(high);
  variants.push(clean);
  if (medium !== clean) variants.push(medium);
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
  return `${PROXY}ssl:${encodeURIComponent(noProto)}&w=${w}&output=webp&we&q=94`;
}

export function imageCandidates(url, size = 'card') {
  if (isBadProductImage(url)) return [];
  const variants = epeyVariants(url, size);
  const proxied = variants.map((src) => proxify(src, size));
  // Epey direct URLs are blocked cross-origin in modern Chromium, so proxy
  // candidates come first. Non-Epey URLs pass through unchanged.
  return uniq([...proxied, ...variants]);
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
