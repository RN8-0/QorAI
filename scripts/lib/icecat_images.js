'use strict';

function getImageUrl(img) {
  if (!img || typeof img !== 'object') return '';
  return img.Pic500x500 || img.Pic || img.HighPic || img.LowPic || img.ThumbPic || '';
}

function flattenText(value, out = []) {
  if (!value) return out;
  if (typeof value === 'string' || typeof value === 'number') {
    out.push(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) flattenText(item, out);
    return out;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) flattenText(item, out);
  }
  return out;
}

// Accept any ProductImage* / ProductDetailImage type. Icecat suffixes the
// camera angle onto the type ("ProductImageFront-Center", "ProductImageRear"…),
// so the old trailing \b wrongly rejected the real hero shots and left only
// the close-up "detail" images — which then became the card thumbnail.
const PRODUCT_TYPE_RE = /\b(?:product\s*image|product\s*detail|main\s*image)/i;
const BAD_TYPE_RE = /\b(?:brand\s*logo|brandlogo|productlogo|logo|award|badge|certificate|certification|energy\s*label|energylabel)\b/i;
const BAD_META_RE = /\b(?:epeat|energy\s*star|energylabel|energy-label|eprel|tco\s*certified|certificate|certification|compliance|award|badge|brand\s*logo|brandlogo|placeholder|no\s*image|default\s*image|icon|chipset|ai\s*illustration)\b/i;

function isBadIcecatImage(img, url = getImageUrl(img)) {
  const href = String(url || '').toLowerCase();
  if (!href) return true;
  if (/\/img\/(?:brand|logo|award|certificate|energy|placeholder)\//i.test(href)) return true;

  const type = String(img?.Type || '');
  if (BAD_TYPE_RE.test(type)) return true;

  const meta = `${flattenText(img).join(' ')} ${href}`;
  if (BAD_META_RE.test(meta)) return true;

  return false;
}

// Lower rank = used earlier; rank 0 becomes the card hero. The manufacturer's
// front-facing IsMain shot must win; angled shots follow; close-up "detail"
// images (keyboard macros, ports, thermal diagrams) rank last so they never
// land in the first slot.
function imageRank(img) {
  const type = String(img?.Type || '').toLowerCase();
  const isMain = String(img?.IsMain || '').toUpperCase() === 'Y';
  let r;
  if (/detail/.test(type))            r = 30;  // close-ups — never the hero
  else if (/front-?center/.test(type)) r = 0;
  else if (/front/.test(type))         r = 4;
  else if (/productimage/.test(type))  r = 8;  // rear / side / top / angle
  else if (type.includes('product'))   r = 12;
  else                                 r = 50;
  if (isMain) r -= 20;                          // IsMain wins inside its tier
  return r;
}

function collectIcecatImages(data = {}, generalInfo = {}, max = 4) {
  const gallery = []
    .concat(Array.isArray(data.Gallery) ? data.Gallery : [])
    .concat(Array.isArray(generalInfo.Gallery) ? generalInfo.Gallery : [])
    .filter(Boolean)
    .sort((a, b) => imageRank(a) - imageRank(b));

  const candidates = gallery.concat(data.Image || [], generalInfo.Image || []);
  const images = [];
  const seen = new Set();

  for (const img of candidates) {
    const url = getImageUrl(img);
    if (!url || seen.has(url) || isBadIcecatImage(img, url)) continue;
    const type = String(img?.Type || '');
    const meta = flattenText(img).join(' ');
    if (type && !PRODUCT_TYPE_RE.test(type) && !PRODUCT_TYPE_RE.test(meta)) continue;
    seen.add(url);
    images.push(url);
    if (images.length >= max) break;
  }

  return { imageUrl: images[0] || '', images };
}

module.exports = {
  collectIcecatImages,
  getImageUrl,
  isBadIcecatImage,
};
