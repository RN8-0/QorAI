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

// ── /product/<slug> — SONDAKI ID KALDIRILDI (2026-08-19) ───────────────────
// Onceki bicim `/product/<slug>-<id>` idi. Kaldirmanin on kosulu slug'in TUM
// KATALOGDA benzersiz olmasi; olculdu (scripts/_slug_cakisma.mjs, PB uzerinden
// 107.449 urun): 107.449 benzersiz slug, 0 cakisma, slug'i bos kayit 0.
// URL'de kullanilan bicim (slugifyProduct + 90 karakter kirpma) uzerinden de
// AYRICA olculdu: 33 ham slug 90 karakteri asiyor ama kirpilmis halleri yine
// cakismiyor — 107.449 benzersiz.
//
// Eski adresler nginx'te 301 ile yeniye gider (bkz. scripts/_nginx_301.mjs).
// Cozumleyici hem slug'i hem 15 karakterlik id'yi kabul eder: eski link
// istemci tarafinda da (SPA ici gezinme, paylasilmis link) calisir.
export function productPath(productOrId) {
  const isProduct = productOrId && typeof productOrId === 'object';
  const id = String(isProduct ? productOrId.id : productOrId || '').trim();
  if (!id) return '/product';
  const slug = isProduct ? productSlug(productOrId) : '';
  // Slug yoksa (elde yalnizca id varsa) id'ye duseriz — cozumleyici 15
  // karakterlik jetonu id olarak taniyor.
  return slug ? `/product/${slug}` : `/product/${id}`;
}

// Adres cubugundaki jeton NE? Uc bicim de desteklenir:
//   <slug>            → yeni bicim
//   <slug>-<id>       → eski bicim (301 gelmediyse, ornegin SPA ici gezinme)
//   <id>              → slug'i olmayan kayit / eski ?id= linki
// Donen: { id, slug } — hangisi doluysa cozumleyici onu kullanir.
//
// DIKKAT: "sondaki 15 karakterlik jeton id'dir" varsayimi TEK BASINA YANLIS.
// Olculdu: 462 urunun slug'i ZATEN 15 karakterlik id kalibina benzeyen bir
// sonekle bitiyor (ornek: `lenovo-legion-pro-7-l83de002xtrwp25`). O yuzden
// once TAM jeton slug olarak denenir; ancak bulunamazsa sondaki id ayrilir.
export function parseProductToken(value) {
  const raw = String(value || '').trim().replace(/^\/+|\/+$/g, '');
  if (!raw) return { id: '', slug: '' };
  if (/^[a-z0-9]{15}$/i.test(raw)) return { id: raw, slug: '' };
  const m = raw.match(/^(.+)-([a-z0-9]{15})$/i);
  // Hem slug hem id adayi dondurulur; cozumleyici once slug'i dener.
  return m ? { id: m[2], slug: raw, slugKisa: m[1] } : { id: '', slug: raw };
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

// Arama sonuc sayfasi. Sonuclar ONCEDEN yalniz ana sayfada (`/?q=`) render
// ediliyordu; kullanici bir urun/kategori/blog sayfasindayken arayinca
// ANA SAYFAYA atiliyordu. Kendi rotasi olunca arama her sayfadan calisir,
// adres paylasilabilir ve geri tusu dogru calisir. Ana sayfadaki `?q=`
// destegi geriye donuk uyumluluk icin DURUYOR (JSON-LD SearchAction ve eski
// linkler oraya isaret ediyordu).
export function searchPath(query) {
  const s = String(query || '').trim();
  return s ? `/search?q=${encodeURIComponent(s)}` : '/search';
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
