// epey.com product images come in size variants encoded as a filename prefix:
//   k_ (small) · m_ (medium, what scrapers stored) · b_ (big) · <none> (original)
// The stored imageUrl is usually the m_ (medium) one → blurry when shown large.
// Build an ordered candidate list that prefers a sharper variant and degrades
// gracefully back to the known-good stored URL (never a broken image).
const EPEY_RE = /^(https?:\/\/resim\.epey\.com\/[^/]+\/)(k_|m_|b_)?(.+)$/;

export function imageCandidates(url, size = 'card') {
  if (!url) return [];
  const m = url.match(EPEY_RE);
  if (!m) return [url];
  const path = m[1];
  const file = m[3];
  const orig = path + file; // no prefix — sharpest (~7× medium)
  const big = `${path}b_${file}`; // ~3.5× medium
  const med = `${path}m_${file}`; // the reliable stored variant
  // Detail view wants maximum sharpness; cards balance size vs sharpness.
  const order = size === 'full' ? [orig, big, med] : [big, orig, med];
  return [...new Set([...order, url])];
}
