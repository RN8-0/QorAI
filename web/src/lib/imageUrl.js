// epey.com product images come in size variants encoded as a filename prefix:
//   k_/s_/t_/c_ (small), m_ (medium), b_ (big), or no prefix.
// The stored imageUrl is usually the m_ (medium) one, which is blurry when
// shown large.
// Build an ordered candidate list that prefers a sharper variant and degrades
// gracefully back to the known-good stored URL (never a broken image).
const EPEY_RE = /^(https?:\/\/resim\.epey\.com\/[^/]+\/)(k_|s_|t_|c_|m_|b_)?(.+)$/;

export function imageCandidates(url, size = 'card') {
  if (!url) return [];
  const m = url.match(EPEY_RE);
  if (!m) return [url];
  const path = m[1];
  const file = m[3];
  const orig = path + file; // no prefix, useful if b_ is missing
  const big = `${path}b_${file}`; // sharpest reliable browser variant
  const med = `${path}m_${file}`; // the reliable stored variant
  const order = [big, orig, med];
  return [...new Set([...order, url])];
}
