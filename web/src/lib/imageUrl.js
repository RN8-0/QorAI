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
  const noProto = url.replace(/^https?:\/\//, '');
  const w = SIZE_W[size] || SIZE_W.card;
  return `${PROXY}ssl:${encodeURIComponent(noProto)}&w=${w}&output=webp&we&q=82`;
}

// epey.com product images come in size variants encoded as a filename prefix:
//   k_/s_/t_/c_ (small), m_ (medium), b_ (big), or no prefix.
// The stored imageUrl is usually the m_ (medium) one, which is blurry when
// shown large. Build an ordered candidate list that prefers a sharper variant
// and degrades gracefully back to the known-good stored URL — every candidate
// is routed through the proxy so none of them can be CORP-blocked.
const EPEY_RE = /^(https?:\/\/resim\.epey\.com\/[^/]+\/)(k_|s_|t_|c_|m_|b_)?(.+)$/;

export function imageCandidates(url, size = 'card') {
  if (!url) return [];
  const m = url.match(EPEY_RE);
  if (!m) return [proxify(url, size)];
  const path = m[1];
  const file = m[3];
  const orig = path + file; // no prefix, useful if b_ is missing
  const big = `${path}b_${file}`; // sharpest reliable browser variant
  const med = `${path}m_${file}`; // the reliable stored variant
  const order = [big, orig, med, url];
  return [...new Set(order)].map((u) => proxify(u, size));
}
