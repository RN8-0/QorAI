// Product data layer for qorai.net.
//
// Keep this boring on purpose: the public website reads products directly from
// the Typesense search-only key. PocketBase remains for auth, reviews and AI,
// but catalog listing/search/detail no longer depends on PB hooks being live.

import { productImageList } from './imageUrl';
import { cardKeySpecs, invalidateCardChips } from './categoryFilters';

const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
// Search-only scoped key (actions: documents:search,get on `products` only).
// NEVER embed the Typesense bootstrap/admin key in client code — it allows
// writes, deletes and key management. This key can only run searches.
const TS_KEY = 'BFc7h2MZhq5yct2GxzkClzQtzzCglKIb';
const COLLECTION = 'products';
const SEARCH_PATH = `/collections/${COLLECTION}/documents/search`;
// Ülke-bazlı sortable fiyat alanı olan pazarlar (ts_backfill `price{ÜLKE}` yazar).
// Fiyat sıralaması bu ülkelerde GÖSTERİLEN yerli fiyata göre yapılır.
const PRICE_SORT_COUNTRIES = new Set(['TR', 'US', 'DE', 'GB', 'FR', 'IT', 'ES', 'NL']);
const LIST_FIELD_NAMES = [
  'id', 'name', 'imageUrl', 'category', 'subcategory', 'brand', 'slug',
  'techScore', 'trendScore', 'price_segment', 'lowestPriceUSD',
  'pricesByCountry', 'bestOfferExpiresAt',
  'keySpecsText', 'filterTokens', 'screenSizeValue', 'batteryCapacityValue',
  'weightValueKg', 'scrapedAtTs', 'updatedAtTs',
];
// `_raw` carries the ENTIRE PocketBase record (tens of KB per doc) — docToProduct
// needs it for prices/offers/rich specs on detail-grade surfaces. But it dominates
// payload, and the home feed over-fetches ~1200 docs across its rails. So list
// surfaces that only render cards use LIST_FIELDS_LEAN (no `_raw`): the card draws
// image/name/brand/score/spec-chips from indexed fields, and the country price
// comes from the compact `pricesByCountry` + `bestOfferExpiresAt` stored fields
// (backfilled by scripts/ts_backfill_lowest_price.js). Detail reads the full doc.
const LIST_FIELDS = [...LIST_FIELD_NAMES, '_raw'].join(',');
const LIST_FIELDS_LEAN = LIST_FIELD_NAMES.join(',');

// Each of these gets its OWN titled section on the home page (3×2 = 6 products,
// highest-scored first). Separate rails — not one merged "popular" list.
const HOME_SECTION_CATEGORIES = ['smartphones', 'tablets', 'laptops', 'monitors', 'tvs', 'graphics_cards'];

// Home showcase rails never surface low-tech-score products (the catalog's
// "60 altı" tier). Recently-viewed is the user's own history and is exempt.
const HOME_MIN_SCORE = 60;

// Mainstream consumer electronics for the home sections. Desktops and bare PC
// components are intentionally NOT here — full towers/boards read as "boxes" on
// the home page and crowd out the products people actually browse; they stay
// fully available via the Categories menu and search.
const HOME_FEATURE_CATEGORIES = [
  'smartphones', 'tablets', 'laptops', 'monitors', 'tvs',
  'graphics_cards', 'smartwatches', 'headphones', 'gaming_consoles',
];

const HOME_TREND_CATEGORIES = [
  'smartphones', 'tablets', 'laptops', 'monitors', 'tvs',
  'graphics_cards', 'headphones', 'smartwatches', 'gaming_consoles',
];

// Categories kept OFF the homepage feed / popular-categories rail: low daily
// relevance, accessory/B2B, or heavily region-dependent SKUs. They stay fully
// browsable via the Categories menu — this only curates the home surface so it
// leads with mainstream consumer electronics (phones, watches, tablets,
// monitors, TVs, PC components) instead of niche items like cases or smart rings.
const HOME_LOW_SIGNAL_CATEGORIES = new Set([
  // accessories / components-accessories
  'flash_drives', 'chargers', 'powerbanks', 'case_fans', 'cpu_coolers',
  'laptop_coolers', 'pc_cases', 'ups', 'psu',
  // niche / low daily relevance
  'smart_rings', 'hardware_wallets', 'vr_headsets', 'e_readers', '3d_printers',
  'robot_vacuums', 'modem_routers',
  // niche photo & video (catalog only has lenses + specialty cameras here)
  'camera_lenses', 'ip_cameras', 'dashcams', 'gimbals', 'drones',
  // niche audio/video gear
  'av_receivers', 'audio_systems', 'media_players', 'projectors',
  'microphones', 'webcams',
]);

function lit(v) {
  return `\`${String(v || '').replace(/`/g, '')}\``;
}

function toQuery(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== '' && v != null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

async function tsGet(path, params = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const qs = toQuery(params);
    const res = await fetch(`${TS_URL}${path}${qs ? `?${qs}` : ''}`, {
      headers: { 'X-TYPESENSE-API-KEY': TS_KEY },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`typesense ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Batch many searches into ONE HTTP round-trip via Typesense /multi_search.
// The home feed used to fire ~25 separate requests; over HTTP/1.1 the browser
// only opens 6 connections per host, so against the self-hosted instance those
// queued in waves and the whole feed sat on skeletons for seconds. One request
// removes that head-of-line blocking. Returns the `results` array in the same
// order as `searches`; a sub-search that errors comes back without `hits`, so
// docs() yields [] for it (graceful per-rail degradation).
async function multiSearch(searches) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${TS_URL}/multi_search`, {
      method: 'POST',
      headers: { 'X-TYPESENSE-API-KEY': TS_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ searches: searches.map((s) => ({ collection: COLLECTION, ...s })) }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`typesense multi ${res.status}`);
    const data = await res.json();
    return (data && data.results) || [];
  } finally {
    clearTimeout(timeout);
  }
}

// Search params for one category's "balanced" rail — mirrors the over-fetch
// math in categoryBalancedProducts so the multi_search path returns the same
// docs. Reduction (dedupe + slice) happens in reduceBalanced.
function balancedSearchParams(category, perCategory, sortBy, minScore = 0) {
  // AŞIRI ÇEKME ÖLÇÜLDÜ (2026-08-06): çarpan 10 idi, yani 6 kart için 60 doküman.
  // Ana sayfa ~20 ray × 40-60 doküman = 1000-1500 doc indiriyordu ve Typesense
  // çağrısı 1111 ms sürüyordu — ürün kartlarını bekleten tek darboğaz buydu.
  // Gerçek ihtiyaç ölçüldü (techScore:desc sırasında 6 FARKLI model için gereken
  // ilk N): smartphones 16, laptops 11, monitors 6. Yani 10 kat fazlasıyla
  // gereksiz. 4 kat + taban 30 en kötü durumu (16) neredeyse iki kat marjla
  // karşılıyor; ray içeriği değişmez, yalnız indirilen ham doküman azalır.
  const fetchN = Math.min(Math.max(perCategory * 4, 30), 60);
  const parts = [`category:=${lit(category)}`];
  if (minScore > 0) parts.push(`techScore:>=${minScore}`);
  return {
    q: '*',
    query_by: 'name',
    sort_by: sortBy,
    filter_by: parts.join(' && '),
    per_page: fetchN,
    include_fields: LIST_FIELDS_LEAN,
  };
}

// Reduce per-category multi_search results the same way categoryBalancedProducts
// does: dedupe each category to distinct models, keep `perCategory`, then merge
// and keep `limit` distinct models overall.
function reduceBalanced(results, perCategory, limit, opts = {}) {
  const perCat = (results || []).map((res) => dedupeVariants(
    docs(res).map(docToProduct).filter((product) => homeQualityFilter(product, opts)),
  ).slice(0, perCategory));
  return dedupeVariants(uniqueProducts(perCat.flat())).slice(0, limit);
}

function docs(result) {
  return ((result && result.hits) || []).map((hit) => hit.document);
}

function uniqueProducts(items) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function homeQualityFilter(product, { allowLowSignal = false } = {}) {
  if (!product?.id || !product?.name) return false;
  if (!allowLowSignal && HOME_LOW_SIGNAL_CATEGORIES.has(String(product.category || '').toLowerCase())) return false;
  return true;
}

function topFacetCategories(counts, limit = 10) {
  return (counts || [])
    .map((c) => ({ value: String(c.value || '').toLowerCase(), count: Number(c.count) || 0 }))
    .filter((c) => c.value && !HOME_LOW_SIGNAL_CATEGORIES.has(c.value))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((c) => c.value);
}

// A coarse MODEL key so the home page shows different models — not the same
// model in different sizes/chips/storage. "iPad Pro 11\" (M5)" and "iPad Pro 13\"
// (M5)" collapse to one; so do "MacBook Pro 14\" M5 Pro" and "MacBook Pro 16\"
// M5 Max". Size, Apple M-chip, storage/RAM, Wi-Fi/Cellular and parentheticals
// are stripped; brand + the remaining model words form the key.
function baseModelKey(p) {
  const name = String(p?.name || '').toLowerCase()
    .replace(/\([^)]*\)/g, ' ')                                  // (M5), (12 GB / 256 GB), (18CPU/20GPU)
    .replace(/\bm\d+\s*(pro|max|ultra)?\b/g, ' ')                // Apple M5 / M5 Pro / M5 Max
    .replace(/\bwi[\s-]?fi\b/g, ' ')                              // before the SKU strip eats "wi-fi"
    .replace(/\b[a-z0-9]*\d[a-z0-9]*(?:-[a-z0-9]+)+\b/g, ' ')     // dashed SKU codes: a2xwjg-620, g835lx-sa152w, 32ud-10
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:inç|inch|")/g, ' ')         // 11", 16.2"
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:gb|tb)\b/g, ' ')            // 256 GB, 1 TB
    .replace(/\b(?:cellular|tablet|laptop|notebook|5g|lte)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  if (name) return name;
  return p?.variantGroup ? `g:${p.variantGroup}` : `id:${p?.id}`;
}

// Collapse same-model entries to ONE card. Products are assumed pre-sorted by
// score, so the FIRST (highest-scored) variant of each model is the one kept.
function dedupeVariants(products) {
  const seen = new Set();
  const out = [];
  for (const p of products || []) {
    if (!p?.id) continue;
    const bk = baseModelKey(p);
    const vg = p.variantGroup ? `g:${p.variantGroup}` : '';
    if (seen.has(bk) || (vg && seen.has(vg))) continue;
    seen.add(bk);
    if (vg) seen.add(vg);
    out.push(p);
  }
  return out;
}

async function categoryBalancedProducts(categories, perCategory, sortBy, limit, opts = {}) {
  const minScore = Number(opts.minScore) || 0;
  // Over-fetch: model de-dup collapses whole product families, so pull more than
  // the rail shows. Carpan balancedSearchParams ile AYNI tutulur (olculdu
  // 2026-08-06: 6 farkli model icin gereken ilk N en kotu 16) — ikisi ayrisirsa
  // ayni ray iki yoldan farkli urun doldurur.
  const fetchN = Math.min(Math.max(perCategory * 4, 30), 60);
  const perCat = await Promise.all(categories.map((category) => {
    const parts = [`category:=${lit(category)}`];
    if (minScore > 0) parts.push(`techScore:>=${minScore}`);
    return searchDocs({
      q: '*',
      query_by: 'name',
      sort_by: sortBy,
      filter_by: parts.join(' && '),
      per_page: fetchN,
      include_fields: LIST_FIELDS,
    }).then((res) => dedupeVariants(
      docs(res).map(docToProduct).filter((product) => homeQualityFilter(product, opts)),
    ).slice(0, perCategory)).catch(() => []);
  }));
  return dedupeVariants(uniqueProducts(perCat.flat())).slice(0, limit);
}

async function topCategoryPicks(categoryCounts, limit = 10) {
  const cats = topFacetCategories(categoryCounts, limit * 2);
  const results = await Promise.all(cats.map((category) =>
    categoryBalancedProducts(
      [category],
      1,
      'techScore:desc,trendScore:desc,updatedAtTs:desc',
      1,
      { allowLowSignal: false },
    ).catch(() => []),
  ));
  return uniqueProducts(results.flat())
    .filter((product) => homeQualityFilter(product))
    .slice(0, limit);
}

function looksLikeLaptopCooler(product) {
  const text = [
    product?.name,
    product?.slug,
    product?.sourceUrl,
    product?.keySpecsText,
    product?._raw,
  ].filter(Boolean).join(' ').toLowerCase();
  return /laptop[\s-]*(soğutucu|sogutucu|cooler|cooling|stand|pad)/i.test(text)
    || /(soğutucu|sogutucu|cooler|cooling\s*pad|cooling\s*stand)[\s-]*laptop/i.test(text)
    || /\/laptop-sogutucu\//i.test(text);
}

export function productMatchesRequestedCategory(product, category) {
  const cat = String(category || '').toLowerCase();
  if (cat === 'laptops') return !looksLikeLaptopCooler(product);
  if (cat === 'laptop_coolers') {
    return String(product?.category || '').toLowerCase() === 'laptop_coolers'
      || looksLikeLaptopCooler(product);
  }
  return true;
}

// Lean list docs carry the country→price map as a compact JSON string in the
// indexed-but-stored `pricesByCountry` field (see ts_backfill_lowest_price.js).
// Parse defensively: any malformed value degrades to "no price", never throws.
function parsePricesByCountry(s) {
  if (!s || typeof s !== 'string') return {};
  try {
    const o = JSON.parse(s);
    return (o && typeof o === 'object') ? o : {};
  } catch {
    return {};
  }
}

// A Typesense doc carries the full PocketBase record as `_raw` only when the
// document endpoint is used. Search/list endpoints return lightweight fields.
export function docToProduct(doc) {
  let base = {};
  if (doc && doc._raw) {
    try { base = JSON.parse(doc._raw); } catch { base = {}; }
  }
  const cleanImages = productImageList({
    imageUrl: base.imageUrl || base.imageURL || doc.imageUrl || '',
    imageURL: base.imageURL,
    images: base.images,
  });
  const imageUrl = cleanImages[0] || '';
  return {
    ...base,
    id: doc.id,
    name: base.name || doc.name || '',
    brand: base.brand || doc.brand || '',
    // Prefer the indexed doc.category (authoritative) over the _raw snapshot —
    // a category re-tag updates the indexed field, but the embedded _raw can lag.
    category: doc.category || base.category || '',
    subcategory: base.subcategory || doc.subcategory || '',
    imageUrl,
    images: cleanImages,
    techScore: base.techScore != null ? base.techScore : doc.techScore || 0,
    trendScore: base.trendScore != null ? base.trendScore : doc.trendScore || 0,
    price_segment: base.price_segment || doc.price_segment || '',
    lowestPriceUSD: doc.lowestPriceUSD || base.lowestPriceUSD || 0,
    lowestPrice: base.lowestPrice || 0,
    lowestPriceCurrency: base.lowestPriceCurrency || '',
    lowestOfferUrl: base.lowestOfferUrl || '',
    lowestOfferStore: base.lowestOfferStore || '',
    offerCount: base.offerCount || 0,
    pricedOfferCount: base.pricedOfferCount || 0,
    bestOfferId: base.bestOfferId || '',
    bestOfferCheckedAt: base.bestOfferCheckedAt || '',
    // Price ROLLUP: prefer the INDEXED fields (doc.*) over the `_raw` snapshot.
    // The offers pipeline refreshes pricesByCountry + bestOfferExpiresAt via
    // partial upserts WITHOUT regenerating `_raw`, so `_raw.prices` /
    // `_raw.bestOfferExpiresAt` are frozen at the last full upsert and go stale
    // (often already expired) — which made rollupPriceIsFresh() fail on every
    // surface that fetches `_raw` (product detail, compare, AI chat) while the
    // lean-doc cards showed the correct fresh price. The indexed fields are the
    // authoritative, most-recent rollup, so they win; `_raw` is only a fallback.
    bestOfferExpiresAt: doc.bestOfferExpiresAt || base.bestOfferExpiresAt || '',
    prices: (() => {
      const indexed = parsePricesByCountry(doc.pricesByCountry);
      if (Object.keys(indexed).length) return indexed;
      return (base.prices && typeof base.prices === 'object') ? base.prices : {};
    })(),
    affiliateLinksByCountry: base.affiliateLinksByCountry || {},
    source: base.source || doc.source || '',
    sourceUrl: base.sourceUrl || '',
    gtin: base.gtin || '',
    mpn: base.mpn || '',
    icecatId: base.icecatId || 0,
    description: base.description || '',
    variantGroup: base.variantGroup || '',
    variantCount: base.variantCount || 0,
    variantPrimary: base.variantPrimary,
    created: base.created || '',
    updated: base.updated || '',
    createdAt: base.createdAt || base.created || '',
    lastUpdated: base.lastUpdated || base.updated || '',
    slug: base.slug || doc.slug || '',
    keySpecsText: doc.keySpecsText || '',
    filterTokens: Array.isArray(doc.filterTokens) ? doc.filterTokens : [],
    screenSizeValue: doc.screenSizeValue || 0,
    batteryCapacityValue: doc.batteryCapacityValue || 0,
    weightValueKg: doc.weightValueKg || 0,
    scrapedAtTs: doc.scrapedAtTs || base.scrapedAtTs || 0,
    updatedAtTs: doc.updatedAtTs || base.updatedAtTs || 0,
  };
}

async function searchDocs(params) {
  return tsGet(SEARCH_PATH, params);
}

// Top product images per category, for the onboarding quiz circles. We use
// Typesense `group_by=category&group_limit=N` so EVERY requested category that
// has products returns its best products — a plain global sort starves
// low-volume categories (cpus, gpus, vr_headsets…) out of the first page.
// Returns several images per category so quiz steps whose app-categories share
// one Typesense category (cameras/lenses, speakers/soundbars, security/ip
// cameras…) can each show a DIFFERENT product instead of the same picture.
export async function getCategoryVisuals(categories = [], perCategory = 4) {
  const cats = [...new Set(
    (categories || []).map((cat) => String(cat || '').toLowerCase()).filter(Boolean),
  )];
  if (!cats.length) return {};
  try {
    const data = await searchDocs({
      q: '*',
      query_by: 'name',
      sort_by: 'techScore:desc,trendScore:desc,updatedAtTs:desc',
      filter_by: `category:[${cats.map(lit).join(',')}]`,
      group_by: 'category',
      group_limit: Math.max(1, Math.min(perCategory, 6)),
      per_page: Math.min(Math.max(cats.length, 30), 250),
      include_fields: LIST_FIELDS,
    });
    const out = {};
    const push = (cat, url) => {
      if (!cat || !url || !cats.includes(cat)) return;
      const list = (out[cat] = out[cat] || []);
      if (!list.includes(url)) list.push(url);
    };
    const groups = Array.isArray(data?.grouped_hits) ? data.grouped_hits : [];
    if (groups.length) {
      for (const group of groups) {
        for (const hit of group.hits || []) {
          if (!hit?.document) continue;
          const product = docToProduct(hit.document);
          const cat = String(product.category || '').toLowerCase();
          if (!productMatchesRequestedCategory(product, cat)) continue;
          push(cat, product.imageUrl);
        }
      }
      return out;
    }
    // Fallback (group_by unsupported): collect images per category from a flat list.
    for (const product of docs(data).map(docToProduct)) {
      const cat = String(product.category || '').toLowerCase();
      if (!productMatchesRequestedCategory(product, cat)) continue;
      push(cat, product.imageUrl);
    }
    return out;
  } catch (err) {
    console.warn('[catalog] quiz visuals failed', err);
    return {};
  }
}

// Merge rich `_raw` specs into any lean CARD product list whose items fall short
// of four key specs, so the SAME fixed four render on those cards as on
// category/detail cards. Only the thin ones are fetched (a couple dozen),
// keeping the extra payload small; best-effort — lean chips still show on error.
// Mutates the passed products in place and returns them. Used by the home feed
// AND the lean "Recently viewed" rail (localStorage snapshots carry no `_raw`).
export async function enrichThinCards(products) {
  const list = (products || []).filter((p) => p && p.id);
  const byId = new Map();
  for (const p of list) byId.set(p.id, p);
  // Önbellekten gelen kart etiketlerini HAZIR taşır (`__chips`); dört etiketi
  // zaten varsa onu yeniden zenginleştirmek boşuna ağ + boşuna zengin-spec
  // hesabıdır. Bu kapı olmadan tekrar ziyaretlerde 1620 ms'lik bir ana thread
  // bloğu ölçüldü (2026-08-06) — kartlar zaten dört etiketle ekrandayken.
  // DOLU etiket sayısı. Kart etiketleri artık kategori başına SABİT dört slot
  // döndürüyor ve doldurulamayan slot "—" olarak yerini koruyor; uzunluğa
  // bakmak bu yüzden her kartı "dolu" gösterip zenginleştirmeyi tamamen
  // durdurmuştu. Ölçüt boş olmayan slot sayısı.
  const filled = (chips) => (chips || []).filter((c) => c && c.value && c.value !== '—').length;
  const chipCount = (p) => (
    p.__chips && Array.isArray(p.__chips.chips) ? filled(p.__chips.chips) : filled(cardKeySpecs(p, 'en'))
  );
  const thin = [...byId.values()].filter(
    (p) => !p.keySpecs && !p.specs && !p.specSections && chipCount(p) < 4,
  );
  if (!thin.length) return products;
  const ids = thin.map((p) => p.id).slice(0, 150);
  try {
    const data = await searchDocs({
      q: '*',
      query_by: 'name',
      filter_by: `id:[${ids.map(lit).join(',')}]`,
      per_page: ids.length,
      include_fields: 'id,_raw',
    });
    const rich = new Map();
    for (const d of docs(data)) {
      let base = {};
      try { base = d._raw ? JSON.parse(d._raw) : {}; } catch { base = {}; }
      rich.set(d.id, base);
    }
    for (const p of thin) {
      const r = rich.get(p.id);
      if (!r) continue;
      if (r.keySpecs) p.keySpecs = r.keySpecs;
      if (r.specs) p.specs = r.specs;
      if (r.specsEn) p.specsEn = r.specsEn;
      if (r.specSections) p.specSections = r.specSections;
      if (r.multiLangSpecs) p.multiLangSpecs = r.multiLangSpecs;
      // Etiketler nesne kimliğinden önbelleğe alınıyor; yerinde zenginleştirme
      // kimliği değiştirmediği için eski (yalın) etiketler yapışıp kalırdı.
      invalidateCardChips(p);
    }
  } catch { /* best-effort: lean chips still render */ }
  return products;
}

// Enrich the feed's thin cards and return a NEW feed whose arrays give a fresh
// object reference ONLY to the cards that actually gained specs — every other
// card keeps its original reference. That's what lets memo(ProductCard) re-render
// just the handful of upgraded cards instead of all ~69 when the background
// enrichment lands (the re-render that used to jank scroll a couple seconds in).
async function enrichHomeCardsWithRichSpecs(feed) {
  const all = [
    ...feed.categorySections.flatMap((s) => s.products),
    ...feed.forYou,
    ...feed.trending,
    ...feed.newArrivals,
    ...(feed.heroPicks || []),
    ...(feed.spotlight ? [feed.spotlight] : []),
  ];
  const hadRich = (p) => Boolean(p && (p.keySpecs || p.specs || p.specsEn || p.specSections || p.multiLangSpecs));
  const before = new Map(all.map((p) => [p.id, hadRich(p)]));
  await enrichThinCards(all); // mutates matched thin cards in place
  const changed = new Set();
  for (const p of all) if (p && !before.get(p.id) && hadRich(p)) changed.add(p.id);
  if (!changed.size) return feed;
  const remap = (p) => (p && changed.has(p.id) ? { ...p } : p);
  return {
    ...feed,
    categorySections: feed.categorySections.map((s) => ({ ...s, products: s.products.map(remap) })),
    forYou: feed.forYou.map(remap),
    trending: feed.trending.map(remap),
    newArrivals: feed.newArrivals.map(remap),
    heroPicks: (feed.heroPicks || []).map(remap),
    spotlight: feed.spotlight ? remap(feed.spotlight) : feed.spotlight,
  };
}

// ── ANA SAYFA AKIŞI ÖNBELLEĞİ (bayat-göster, arkada-yenile) ──────────────
// ÖLÇÜLDÜ (2026-08-06): ana sayfanın tek darboğazı Typesense multi_search'ü —
// ilk ölçümde 1111 ms, aşırı çekme düşürüldükten sonra 932 ms. Daha aşağı
// inmiyor çünkü TEK doküman isteyen minimal sorgu bile 280 ms sürüyor: bu,
// kendi barındırdığımız Typesense'in taban gecikmesi ve ~29 alt-sorgu onun
// üstüne biniyor. Yani "ürünler geç geliyor" ağ/sunucu kaynaklı, kod değil.
//
// Kullanıcı için ölçülebilir tek kazanç: AYNI akışı tekrar beklememek.
//
// TEK ÖNBELLEK. Eskiden İKİ tane vardı — burada sessionStorage, Home.jsx'te
// localStorage — ikisi de aynı anahtar adını kullanıyordu ve aynı akışı iki kez
// serileştiriyordu. Sahibi artık yalnız bu modül; Home.jsx senkron tohumu
// peekHomeFeed() ile alır.
//
// KRİTİK (2026-08-06 ölçümü): önbelleğe ZENGİN spec'li kartlar yazılıyordu
// (enrichment `keySpecs`/`specs`/`multiLangSpecs` ekliyor) → kayıt 733 KB'a
// çıkmıştı ve daha kötüsü, önbellekten dönen her kart cardKeySpecs'in PAHALI
// zengin-spec yolunu tetikliyordu: tekrar ziyarette ilk boyama 1795 ms ana
// thread kilidi (aynı akış yalın kartlarla 173 ms). Bu yüzden önbelleğe artık
// spec haritaları değil, HESAPLANMIŞ ETİKETLER (`__chips`) yazılıyor — kart
// ekranda birebir aynı görünür, kayıt ~89 KB'a düşer, açılış hesabı sıfırlanır.
// v3 (2026-08-06): typesense_sync hook'u JSON alanlarını bayt dizisi olarak
// yazıyordu; o dönemde önbelleğe alınan anlık görüntülerde etiketler "123 / 0"
// gibi DONMUŞ durumda. Kayıt id+fiyat imzasıyla tazelendiği ve etiket değişimi
// imzayı değiştirmediği için eski snapshot kendiliğinden düzelmezdi — anahtarı
// yükseltmek bozuk kaydı bir kerede düşürür.
const HOME_CACHE_KEY = 'qor.homeFeed.v3';
const HOME_CACHE_TTL_MS = 30 * 60 * 1000;
const CARD_RICH_FIELDS = ['keySpecs', 'specs', 'specsEn', 'specSections', 'multiLangSpecs', '_raw'];

// Aynı sayfa yüklemesinde önbelleği bir kereden fazla ayrıştırma (mount tohumu +
// revalidate etkisi arka arkaya okuyor).
let homeCacheMemo = null;

// v1 anahtarı (zengin spec'li, ölçümde 733 KB) hâlâ ziyaretçilerin tarayıcısında
// duruyor ve bir daha okunmayacak — yer kaplamasın diye ilk yüklemede düşürülür.
try {
  localStorage.removeItem('qor.homeFeed.v1');
  sessionStorage.removeItem('qor.homeFeed.v1');
  localStorage.removeItem('qor.homeFeed.v2'); // bozuk etiketli anlık görüntüler
} catch (_) { /* gizli mod */ }

function slimCardForCache(p, lang) {
  if (!p || typeof p !== 'object') return p;
  const chips = cardKeySpecs(p, lang);
  const out = { ...p, __chips: { lang, max: 4, chips } };
  for (const f of CARD_RICH_FIELDS) delete out[f];
  return out;
}

// Saf: ekrandaki akışa DOKUNMAZ, yalnız diske yazılacak hafif bir kopya üretir.
function slimFeedForCache(feed, lang) {
  const m = (p) => slimCardForCache(p, lang);
  return {
    ...feed,
    categorySections: (feed.categorySections || []).map((s) => ({ ...s, products: (s.products || []).map(m) })),
    forYou: (feed.forYou || []).map(m),
    trending: (feed.trending || []).map(m),
    newArrivals: (feed.newArrivals || []).map(m),
    heroPicks: (feed.heroPicks || []).map(m),
    spotlight: feed.spotlight ? m(feed.spotlight) : null,
  };
}

// Ucuz kimlik: kart id'leri + fiyatları. Taze akış görünenle aynıysa çağıran
// taraf setState'i atlayıp 66 kartlık tam yeniden render'dan kurtulur.
export function homeFeedSignature(feed) {
  if (!feed) return '';
  const ids = [];
  const push = (p) => { if (p && p.id) ids.push(`${p.id}:${p.lowestPriceUSD || ''}`); };
  (feed.categorySections || []).forEach((s) => (s.products || []).forEach(push));
  ['forYou', 'trending', 'newArrivals', 'heroPicks'].forEach((k) => (feed[k] || []).forEach(push));
  push(feed.spotlight);
  return ids.join(',');
}

function readHomeCache(sig) {
  if (homeCacheMemo && homeCacheMemo.sig === sig) return homeCacheMemo.feed;
  try {
    const raw = localStorage.getItem(HOME_CACHE_KEY);
    if (!raw) return null;
    const box = JSON.parse(raw);
    if (!box || box.sig !== sig || !box.feed) return null;
    if (Date.now() - Number(box.at || 0) > HOME_CACHE_TTL_MS) return null;
    homeCacheMemo = { sig, feed: box.feed };
    return box.feed;
  } catch (_) { return null; }
}
function writeHomeCache(sig, feed, lang) {
  // BOŞ akışı ASLA yazma: getHomeFeed hata durumunda boş bir akış döner (Typesense
  // anlık erişilemezse), onu önbelleğe almak ana sayfayı TTL boyunca boş bırakırdı.
  if (!feed || !homeFeedSignature(feed)) return;
  try {
    const slim = slimFeedForCache(feed, lang);
    homeCacheMemo = { sig, feed: slim };
    localStorage.setItem(HOME_CACHE_KEY, JSON.stringify({ sig, at: Date.now(), feed: slim }));
  } catch (_) { /* kota dolu / gizli mod — önbellek opsiyoneldir */ }
}

const homeSig = (prefCats, lang) => `${lang}|${(prefCats || []).join(',')}`;

// Senkron tohum: Home.jsx mount'ta bunu useState başlatıcısında kullanır, böylece
// kartlar İLK FRAME'de basılır. Aynı imza için tekrar çağrı bedavadır (memo).
export function peekHomeFeed(prefCats = [], lang = 'en') {
  return readHomeCache(homeSig(prefCats, lang));
}

// Önbellek varsa ONU DÖNER ve tazelemeyi arka planda yapar; yoksa normal akış.
// `onEnriched` zaten "sonradan gelen daha iyi veri" kanalı olduğu için taze
// akış da oradan teslim edilir — çağıran tarafta yeni bir sözleşme gerekmez.
export async function getHomeFeedCached(prefCats = [], { onEnriched, onFresh, lang = 'en' } = {}) {
  const sig = homeSig(prefCats, lang);
  const cached = readHomeCache(sig);
  if (cached) {
    // İKİ AYRI KANAL. Taze akış (`onFresh`) çağıran tarafta ucuz bir imza
    // kapısından geçer — içerik ekrandakiyle aynıysa hiç render edilmez.
    // Zenginleştirme (`onEnriched`) etiketleri değiştirir ama id/fiyat imzasını
    // değiştirmez, o yüzden kapısız uygulanmalıdır.
    getHomeFeed(prefCats, {
      onEnriched: (enriched) => {
        writeHomeCache(sig, enriched, lang);
        if (typeof onEnriched === 'function') onEnriched(enriched);
      },
    })
      .then((fresh) => {
        writeHomeCache(sig, fresh, lang);
        if (typeof onFresh === 'function') onFresh(fresh);
      })
      .catch(() => {});
    return cached;
  }
  const feed = await getHomeFeed(prefCats, {
    onEnriched: (enriched) => {
      writeHomeCache(sig, enriched, lang);
      if (typeof onEnriched === 'function') onEnriched(enriched);
    },
  });
  writeHomeCache(sig, feed, lang);
  return feed;
}

export async function getHomeFeed(prefCats = [], { onEnriched } = {}) {
  const preferred = (prefCats || [])
    .map((cat) => String(cat || '').toLowerCase())
    .filter((cat) => cat && !HOME_LOW_SIGNAL_CATEGORIES.has(cat));
  // Lead "For You" with mainstream consumer categories, THEN the user's quiz
  // preferences — so even a components-heavy profile still gets a useful, popular
  // home feed instead of a wall of motherboards/towers.
  const forYouCats = [...new Set([...HOME_FEATURE_CATEGORIES, ...preferred])].slice(0, 10);
  try {
    // Every rail's query is batched into ONE multi_search round-trip (was ~25
    // separate requests). Each rail is still de-duped to DISTINCT models on its
    // own (reduceBalanced → dedupeVariants by base model); rails are independent,
    // so a category's best product stays in its own rail even if it also leads
    // For You.
    const sectionSearches = HOME_SECTION_CATEGORIES.map((category) =>
      balancedSearchParams(category, 6, 'techScore:desc,trendScore:desc', HOME_MIN_SCORE));
    const trendSearches = HOME_TREND_CATEGORIES.map((category) =>
      balancedSearchParams(category, 2, 'trendScore:desc,updatedAtTs:desc,techScore:desc', HOME_MIN_SCORE));
    const forYouSearches = forYouCats.map((category) =>
      balancedSearchParams(category, 2, 'techScore:desc,trendScore:desc', HOME_MIN_SCORE));
    const tailSearches = [
      { // new arrivals
        q: '*', query_by: 'name',
        sort_by: 'updatedAtTs:desc,scrapedAtTs:desc,techScore:desc',
        filter_by: `techScore:>=${HOME_MIN_SCORE}`,
        per_page: 40, include_fields: LIST_FIELDS_LEAN, // 80'di: yeni gelenler rayi ~12 kart gosteriyor, 40 dedupe icin fazlasiyla yeter
      },
      { // spotlight — top-trending smartphone
        q: '*', query_by: 'name', sort_by: 'trendScore:desc,techScore:desc',
        per_page: 1, include_fields: LIST_FIELDS_LEAN,
        filter_by: `category:=${lit('smartphones')}`,
      },
      { // category facet counts
        q: '*', query_by: 'name', per_page: 1,
        facet_by: 'category', max_facet_values: 100,
      },
    ];

    const results = await multiSearch([
      ...sectionSearches, ...trendSearches, ...forYouSearches, ...tailSearches,
    ]);

    let cursor = 0;
    const sectionResults = results.slice(cursor, cursor += sectionSearches.length);
    const trendResults = results.slice(cursor, cursor += trendSearches.length);
    const forYouResults = results.slice(cursor, cursor += forYouSearches.length);
    const [newRes, spotlightRes, facetRes] = results.slice(cursor);

    const sectionLists = sectionResults.map((res) =>
      reduceBalanced([res], 6, 6, { minScore: HOME_MIN_SCORE }));
    const trending = reduceBalanced(trendResults, 2, 9, { minScore: HOME_MIN_SCORE });
    const forYou = reduceBalanced(forYouResults, 2, 9, { minScore: HOME_MIN_SCORE });

    const categoryFacet = ((facetRes && facetRes.facet_counts) || [])
      .find((facet) => facet.field_name === 'category');
    const categories = categoryFacet ? categoryFacet.counts : [];

    const categorySections = HOME_SECTION_CATEGORIES
      .map((category, i) => ({ category, products: sectionLists[i] || [] }))
      .filter((section) => section.products.length);
    const newArrivals = dedupeVariants(uniqueProducts(docs(newRes).map(docToProduct))
      .filter((product) => homeQualityFilter(product))).slice(0, 9);

    const feed = {
      categorySections,
      forYou,
      trending,
      newArrivals,
      spotlight: docs(spotlightRes).map(docToProduct)[0] || null,
      heroPicks: forYou.slice(0, 6),
      categories,
      total: Number(facetRes && facetRes.found) || 0,
    };
    // Make home cards identical to category/detail cards: pull the rich `_raw`
    // specs for the handful of displayed products that come up short of four
    // key specs on the lean payload (thin-token categories — GPUs, CPUs, SSDs,
    // headphones…), so the same fixed four show everywhere.
    //
    // Do this in the BACKGROUND, never on the critical path. The lean multi_search
    // above already fully fills every card (image/name/brand/score + its chips),
    // and the specs grid reserves two rows regardless of chip count, so a thin
    // card gaining its 3rd/4th chip a beat later causes NO layout shift. Awaiting
    // the enrich here used to fetch + JSON.parse ~2-3 MB of `_raw` before the feed
    // resolved — that delayed products by ~0.5 s and froze the main thread on the
    // parse ("kasma"). Callers pass onEnriched to receive the upgraded feed once
    // it's ready; getHomeFeed itself returns the paint-ready lean feed immediately.
    if (typeof onEnriched === 'function') {
      enrichHomeCardsWithRichSpecs(feed)
        .then((enrichedFeed) => onEnriched(enrichedFeed))
        .catch(() => {});
    }
    return feed;
  } catch (err) {
    console.warn('[catalog] home feed failed', err);
    return { categorySections: [], forYou: [], trending: [], newArrivals: [], spotlight: null, heroPicks: [], categories: [], total: 0 };
  }
}

export async function searchProducts(query, limit = 40) {
  const q = (query || '').trim();
  if (!q) return [];
  try {
    const data = await searchDocs({
      q,
      // Name carries almost all of the relevance signal. filterTokens
      // ("ram:8gb", "storage:256gb") were pulling in unrelated products on a
      // plain-name search, so they're dropped from the query; keySpecsText is
      // kept only as a faint tie-breaker.
      query_by: 'name,brand,category,keySpecsText',
      query_by_weights: '12,5,2,1',
      sort_by: '_text_match:desc,trendScore:desc,techScore:desc',
      per_page: Math.min(limit, 60),
      include_fields: LIST_FIELDS,
      prefix: 'true',
      // Tighter fuzziness: at most one typo, and only on tokens long enough that
      // a typo is plausible — keeps "iphone 15" from matching half the catalog.
      num_typos: '1,0,0,0',
      min_len_1typo: 5,
      min_len_2typo: 12,
      drop_tokens_threshold: 1,
      typo_tokens_threshold: 1,
      prioritize_exact_match: 'true',
      prioritize_token_position: 'true',
    });
    return uniqueProducts(docs(data).map(docToProduct));
  } catch (err) {
    console.warn('[catalog] search failed', err);
    return [];
  }
}

export async function getCategoryPage(opts = {}) {
  const perPage = Math.min(opts.perPage || 24, 40);
  const page = opts.page || 1;
  try {
    const isSearch = Boolean((opts.q || '').trim());
    const filters = [];
    if (opts.category) filters.push(`category:=${lit(String(opts.category).toLowerCase())}`);
    if (opts.brands && opts.brands.length) {
      filters.push(`brand:[${opts.brands.slice(0, 12).map(lit).join(',')}]`);
    }
    if (opts.segment) filters.push(`price_segment:=${lit(opts.segment)}`);
    const selectedTokens = [...new Set((opts.tokens || []).map((tk) => String(tk || '').trim()).filter(Boolean))];
    if (selectedTokens.length) {
      // Group tokens by prefix so it's OR within a group (RAM 8 or 16) and AND
      // across groups (RAM 8 AND Storage 256) — the expected filter behaviour.
      const byPrefix = {};
      selectedTokens.slice(0, 96).forEach((tk) => {
        const p = String(tk).split(':')[0];
        (byPrefix[p] = byPrefix[p] || []).push(tk);
      });
      Object.values(byPrefix).forEach((group) => {
        filters.push(`filterTokens:[${group.map(lit).join(',')}]`);
      });
    }
    if (opts.score === 'high') filters.push('techScore:>=80');
    else if (opts.score === 'mid') filters.push('techScore:[60..79]');
    else if (opts.score === 'low') filters.push('techScore:<60');

    // Fiyat sıralaması: `lowestPriceUSD` küresel EN UCUZ pazarı gösterir; oysa
    // kart ziyaretçinin ülkesinin YERLİ fiyatını gösterir. GB'de ucuz + TR'de
    // pahalı bir ürün USD'ye göre yanlış yere düşüyordu. `price{ÜLKE}` sortable
    // alanları (ts_backfill) ile server GÖSTERİLEN fiyata göre sıralar.
    const cc = String(opts.country || '').toUpperCase();
    const priceField = PRICE_SORT_COUNTRIES.has(cc) ? `price${cc}` : 'lowestPriceUSD';
    // Fiyatsızları DIŞLAMA — `_eval(price:>0):desc` ile o ülkede fiyatı OLANLAR
    // önce, fiyatsızlar EN SONA (kullanıcı: "filtre değil sıralama, tüm ürünler
    // görünsün"). 2 alan: arama sırasında `_text_match` ile birleşince Typesense
    // 3-sıra limitini aşmaz.
    const sortMap = {
      score: 'techScore:desc',
      trend: 'trendScore:desc',
      priceUp: `_eval(${priceField}:>0):desc,${priceField}:asc`,
      priceDown: `_eval(${priceField}:>0):desc,${priceField}:desc`,
      new: 'updatedAtTs:desc,scrapedAtTs:desc,techScore:desc',
    };
    const sort = sortMap[opts.sort] || sortMap.score;
    const data = await searchDocs({
      q: isSearch ? opts.q.trim() : '*',
      query_by: isSearch ? 'name,brand,keySpecsText,category,filterTokens' : 'name',
      query_by_weights: isSearch ? '8,4,2,2,1' : '',
      sort_by: isSearch ? `_text_match:desc,${sort}` : sort,
      filter_by: filters.join(' && '),
      page,
      per_page: perPage,
      include_fields: LIST_FIELDS,
      facet_by: opts.facets ? 'brand,price_segment,filterTokens' : '',
      max_facet_values: opts.facets ? 200 : '',
      prefix: isSearch ? 'true' : '',
      num_typos: isSearch ? '2,1,1,0,0' : '',
      drop_tokens_threshold: isSearch ? 1 : '',
      typo_tokens_threshold: isSearch ? 1 : '',
      prioritize_exact_match: isSearch ? 'true' : '',
    });
    const hits = docs(data)
      .map(docToProduct)
      .filter((p) => productMatchesRequestedCategory(p, opts.category));
    return {
      found: data.found || 0,
      page,
      hits,
      facets: data.facet_counts || [],
    };
  } catch (err) {
    console.warn('[catalog] category failed', err);
    return { found: 0, page, hits: [], facets: [] };
  }
}

// Session product cache — makes opening a product feel instant. Cards warm this
// on hover/touch (prefetchProduct) so by the time the click navigates, the
// product detail is already in memory and renders with zero network wait.
// Catalog docs are static within a session, so a soft-capped Map is safe.
const _productCache = new Map();
const _productInflight = new Map();
const PRODUCT_CACHE_MAX = 250;

function cacheProduct(p) {
  if (!p || !p.id) return;
  if (_productCache.size >= PRODUCT_CACHE_MAX) {
    _productCache.delete(_productCache.keys().next().value);
  }
  _productCache.set(p.id, p);
}

export async function getProduct(id, { force = false } = {}) {
  if (!id) return null;
  if (!force && _productCache.has(id)) return _productCache.get(id);
  if (!force && _productInflight.has(id)) return _productInflight.get(id);
  const promise = (async () => {
    try {
      const doc = await tsGet(`/collections/${COLLECTION}/documents/${encodeURIComponent(id)}`);
      const p = docToProduct(doc);
      cacheProduct(p);
      return p;
    } catch (err) {
      console.warn('[catalog] product failed', err);
      return null;
    } finally {
      _productInflight.delete(id);
    }
  })();
  _productInflight.set(id, promise);
  return promise;
}

// Warm the cache ahead of navigation (called on card hover/touch). Fire-and-
// forget; never throws, never blocks.
export function prefetchProduct(id) {
  if (id && !_productCache.has(id)) getProduct(id).catch(() => {});
}

export async function getSimilar(category, _techScore, excludeId, limit = 12) {
  if (!category) return [];
  try {
    const data = await searchDocs({
      q: '*',
      query_by: 'name',
      filter_by: `category:=${lit(String(category).toLowerCase())}`,
      sort_by: 'techScore:desc',
      per_page: Math.max(limit + 4, 16),
      include_fields: LIST_FIELDS,
    });
    return docs(data)
      .map(docToProduct)
      .filter((p) => p.id !== excludeId)
      .filter((p) => productMatchesRequestedCategory(p, category))
      .slice(0, limit)
  } catch (err) {
    console.warn('[catalog] similar failed', err);
    return [];
  }
}

// Sibling SKUs in the same product family (different storage/RAM), used by the
// product page "Variants" strip. variantGroup isn't indexed in Typesense, so we
// read it straight from PocketBase. Returns [] when the group is unknown.
export async function getVariants(variantGroup, excludeId, limit = 24) {
  if (!variantGroup) return [];
  try {
    const { pb } = await import('./pocketbase');
    const res = await pb.collection('products').getList(1, limit, {
      filter: `variantGroup="${String(variantGroup).replace(/"/g, '\\"')}"`,
      fields: 'id,slug,name,brand,category,imageUrl,images,keySpecs,variantGroup,techScore',
      sort: '-techScore',
      $autoCancel: false,
    });
    return (res.items || []).filter((p) => p.id && p.id !== excludeId);
  } catch (err) {
    console.warn('[catalog] variants failed', err);
    return [];
  }
}

export async function popularProducts(limit = 12, opts = {}) {
  try {
    const category = String(opts.category || '').toLowerCase();
    if (category) {
      const data = await searchDocs({
        q: '*',
        query_by: 'name',
        sort_by: 'trendScore:desc,techScore:desc,updatedAtTs:desc',
        filter_by: `category:=${lit(category)}`,
        per_page: Math.min(Math.max(limit + 8, 16), 250),
        include_fields: LIST_FIELDS,
      });
      return docs(data)
        .map(docToProduct)
        .filter((p) => productMatchesRequestedCategory(p, category))
        .slice(0, limit);
    }

    const preferredCategories = [...new Set([...HOME_FEATURE_CATEGORIES, ...HOME_TREND_CATEGORIES])]
      .filter((cat) => !HOME_LOW_SIGNAL_CATEGORIES.has(cat));
    const data = await searchDocs({
      q: '*',
      query_by: 'name',
      sort_by: 'trendScore:desc,techScore:desc,updatedAtTs:desc',
      filter_by: `category:[${preferredCategories.map(lit).join(',')}]`,
      per_page: Math.min(Math.max(limit + 8, 18), 250),
      include_fields: LIST_FIELDS,
    });
    const ranked = uniqueProducts(docs(data).map(docToProduct))
      .filter((product) => homeQualityFilter(product))
      .slice(0, limit);
    if (ranked.length) return ranked;

    const feed = await getHomeFeed();
    const pool = feed.forYou.length ? feed.forYou : feed.trending;
    return pool.slice(0, limit);
  } catch {
    return [];
  }
}
