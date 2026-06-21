const ID_RE = /[a-z0-9]{15}$/i;

export function slugifyProduct(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
}

export function productSlug(product) {
  if (!product || typeof product !== 'object') return '';
  return slugifyProduct(product.slug || product.name || '');
}

export function extractProductId(value) {
  const clean = String(value || '').trim();
  if (!clean) return '';
  const exact = clean.match(/^[a-z0-9]{15}$/i);
  if (exact) return clean;
  const tail = clean.match(ID_RE);
  return tail ? tail[0] : clean;
}

export function productPath(productOrId) {
  const isProduct = productOrId && typeof productOrId === 'object';
  const id = String(isProduct ? productOrId.id : productOrId || '').trim();
  if (!id) return '/product';
  const slug = isProduct ? productSlug(productOrId) : '';
  // Clean, path-based URL: /product/<slug>-<id>. The id is the trailing
  // 15-char token, so extractProductId() recovers it from the path (the '-'
  // separator stops the id regex from grabbing slug characters). The SPA also
  // still reads ?id= as a fallback, so old query-string links keep working.
  return slug ? `/product/${slug}-${id}` : `/product/${id}`;
}

// Clean, path-based category URL (e.g. /category/smartphones). Category ids are
// already URL-safe lowercase tokens ("graphics_cards", "3d_printers"); empty cat
// falls back to the all-categories index. The SPA serves these via the
// /category/:cat route and seo.mjs bakes a per-category landing shell at the
// matching folder, so the same URL is both crawlable HTML and an SPA route.
export function categoryPath(category) {
  const cat = String(category || '').trim().toLowerCase();
  return cat ? `/category/${cat}` : '/category';
}

// A blog article carries a canonical `slug` plus optional per-language slugs
// (slug_tr/slug_en/slug_de). Links use the language-appropriate slug so the URL
// matches the content language, while BlogPost still resolves any of them to the
// same article. Falls back to the canonical slug when a language slug is empty.
export function articleSlug(article, lang) {
  if (!article) return '';
  return article[`slug_${lang}`] || article.slug || '';
}
export function articlePath(article, lang) {
  const s = articleSlug(article, lang);
  return s ? `/blog/${s}` : '/blog';
}

// Clean comparison URL: /compare/<slugA>-<idA>-vs-<slugB>-<idB>. Mirrors
// comparePath() in web/scripts/seo.mjs so the prerendered file, its canonical
// and the runtime canonical all agree. parseComparePair() recovers both 15-char
// ids (split on the first "-vs-", take the trailing id of each side).
export function comparePath(a, b) {
  const tok = (p) => {
    if (!p) return '';
    if (typeof p === 'string') return p;
    // Cap slug to 40 — must match compareToken() in web/scripts/seo.mjs so the
    // runtime canonical equals the prerendered file path / sitemap loc.
    const slug = productSlug(p).slice(0, 40).replace(/-+$/, '');
    return slug ? `${slug}-${p.id}` : String(p.id || '');
  };
  return `/compare/${tok(a)}-vs-${tok(b)}`;
}

export function parseComparePair(pair) {
  const s = String(pair || '');
  const i = s.indexOf('-vs-');
  if (i < 0) return [];
  const a = extractProductId(s.slice(0, i));
  const b = extractProductId(s.slice(i + 4));
  return a && b && a !== b ? [a, b] : [];
}
