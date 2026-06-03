// Image loading for qorai.net.
//
// epey.com serves its product images with a Cross-Origin-Resource-Policy
// header, so Chromium browsers refuse to render them when they're embedded on
// qorai.net (net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin) — every product image
// was falling back to the grey placeholder. We therefore route every remote
// image through wsrv.nl, a CORP/CORS-friendly image proxy that re-serves the
// file with `Cross-Origin-Resource-Policy: cross-origin`, re-encodes it to webp
// and resizes it to roughly the displayed width (much smaller payloads too).

const PROXY = 'https://wsrv.nl/?url=';

// Pixel widths per layout slot (a little above display size for retina).
const SIZE_W = { thumb: 140, list: 160, card: 440, full: 820 };

// Wrap a remote URL in the image proxy. Local assets and data-URIs pass through
// untouched so the placeholder SVG and bundled assets keep working.
export function proxify(url, size = 'card') {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('data:') || url.startsWith('/') || url.includes('wsrv.nl')) return url;
  if (!/resim\.epey\.com|(^|\.)epey\.com/i.test(url)) return url;
  const noProto = url.replace(/^https?:\/\//, '');
  const w = SIZE_W[size] || SIZE_W.card;
  return `${PROXY}ssl:${encodeURIComponent(noProto)}&w=${w}&output=webp&we&q=82`;
}

export function imageCandidates(url, size = 'card') {
  if (!url) return [];
  // Preserve the exact image URL stored on the product. Earlier builds tried
  // to swap Epey filename prefixes for a larger variant, but some of those
  // variants are cropped differently and cut phones in half. The proxy still
  // makes the remote image embeddable; it no longer changes the source image.
  return [proxify(url, size)];
}
