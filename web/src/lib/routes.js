// Rota yardimcilari.
//
// slugifyProduct / productSlug / productPath BURADA TANIMLI DEGIL — kaynaklari
// admin/js/qor_ai_prompts.js (TEK KOPYA). Admin paneli de prompt'a giden urun
// adresini ayni fonksiyondan uretiyor; iki ayri slug uygulamasi tutmak
// on-render dosya yolu ile runtime canonical'i ayristirir.
export { slugifyProduct, productSlug, productPath } from './aiPrompts.js';
import { productSlug } from './aiPrompts.js';

// NOT: burada `extractProductId()` vardi — "sondaki 15 karakteri id say".
// Kaldirildi (2026-08-22): tek kullanicisi parseComparePair() idi, o da artik
// parseProductToken() kullaniyor. Varsayim zaten TEK BASINA YANLISTI — 462
// urunun slug'i o kalipla biten bir sonek tasiyor.

// NOT: `/product/<slug>` bicimi (sondaki id KALDIRILDI, 2026-08-19) ve onu
// ureten productPath() artik admin/js/qor_ai_prompts.js icinde — yukaridaki
// re-export ile geliyor. Gerekce ve olcum orada.

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
// (slug_tr/slug_en). Links use the language-appropriate slug so the URL
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

// BLOG YAZISI LINKI `<Link>` ILE VERILEMEZ — DIL ONEKI YAPISTIRIR.
//
// main.jsx `/tr` altinda BrowserRouter'i `basename="/tr"` ile kuruyor, yani
// her `<Link to="/blog/x">` tarayiciya `href="/tr/blog/x"` olarak cikiyor.
// Blog i18n'i ONEK degil SLUG tabanli (slug_tr / slug_en), bu yuzden seo.mjs
// yazilari YALNIZ `/blog/<slug>` altina on-render ediyor. Sonuc olculdu
// 2026-08-29, GSC "URL Google'da yok":
//   GET /tr/blog/okula-donus-2026-en-iyi-ogrenci-laptoplari
//     -> HTTP 200, <title>Page not found</title>, robots: noindex, follow
// Yani yumusak 404. Googlebot JS'i calistirinca /tr/blog listesinde bu
// linkleri buluyor, izliyor ve her Turkce yaziyi "noindex" diye isaretliyor —
// sitedeki TEK uzun-form ozgun icerik indeks disi kaliyor.
//
// Cozum: yazi linkleri router'in DISINDA, mutlak yol olarak verilir. Tam sayfa
// yuklemesi olur (10 yazi icin kabul edilebilir bedel) ama tarayici da,
// Googlebot da her zaman on-render edilmis kanonik adrese gider.
// Halihazirda indekste duran /tr/blog/* adresleri icin nginx'te 301 var
// (docs/nginx_website.conf).

// Karsilastirma adresi: /compare/<slugA>-vs-<slugB>.
//
// 2026-08-22: kayit ID'leri adresten CIKARILDI. Urun adresinde ayni temizlik
// `e64350a` ile yapilmisti, compare unutulmustu ve sitemap boyle goruniyordu:
//   /compare/ecovacs-deebot-t50s-pro-omni-qw4jn21yemj0wez
//            -vs-mamibot-ultra-m10-6fnbz3dy8fzjesx
// Kimse bunu yazmaz, kimse boyle bir linki paylasmaz ve arama sonucunda
// okunmaz. Slug 40 karakterle SINIRLI kalir: build `website/compare/<token>/`
// dizinini yaziyor ve iki tam slug Windows'un 260 karakter yol sinirini asiyor.
//
// compareToken() (web/scripts/seo.mjs) ile BIREBIR ayni olmak zorunda; aksi
// halde runtime canonical ile on-render dosya yolu/sitemap ayrisir.
export function compareToken(p) {
  if (!p) return '';
  if (typeof p === 'string') return p;
  const slug = productSlug(p).slice(0, 40).replace(/-+$/, '');
  return slug || String(p.id || '');
}

export function comparePath(a, b) {
  return `/compare/${compareToken(a)}-vs-${compareToken(b)}`;
}

// Cifti ADRESTEN cozer. Iki bicim de kabul edilir:
//   yeni: <slugA>-vs-<slugB>              (id yok)
//   eski: <slugA>-<idA>-vs-<slugB>-<idB>  (indekste/paylasimlarda duruyor)
// Donen sey ID DEGIL, parseProductToken() jetonu: `{id, slug, slugKisa}`.
// Cagiran taraf resolveProduct() ile cozer — "sondaki 15 karakter id'dir"
// varsayimi TEK BASINA YANLIS (462 urunun slug'i zaten o kalipla bitiyor),
// bu yuzden once tam slug denenir.
export function parseComparePair(pair) {
  const s = String(pair || '');
  const i = s.indexOf('-vs-');
  if (i < 0) return [];
  const a = parseProductToken(s.slice(0, i));
  const b = parseProductToken(s.slice(i + 4));
  const bos = (t) => !t || (!t.id && !t.slug);
  if (bos(a) || bos(b)) return [];
  return [a, b];
}
