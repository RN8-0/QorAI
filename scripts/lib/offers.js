/**
 * Qor AI — offers writer
 *
 * The single, source-agnostic entry point for writing retailer offers.
 * The Epey scraper, Amazon/Awin connectors — any
 * price source — calls upsertOffer() and the `offers` collection plus the
 * product's price rollup (lowestPrice* / offerCount) stay consistent.
 *
 * A product is matched by explicit productId, else by gtin, else by
 * mpn+brand — the keys Icecat already fills on every product.
 */
'use strict';

const { req } = require('../../migration/pb');
const { FX_TO_USD } = require('../fx_rates');
const { isPlausibleUsd } = require('./price_sanity');

const esc = v => String(v || '').replace(/"/g, '\\"');
const nowIso = () => new Date().toISOString();

const PRICE_TTL_MINUTES = {
  TR: 45,
  DE: 120,
  GB: 120,
  UK: 120,
  US: 180,
  DEFAULT: 180,
};

// Affiliate product feeds (Awin, Admitad…) are snapshots refreshed roughly
// daily, not live-scraped prices. A 2 h freshness window made a feed price
// vanish into "see price" the same afternoon it was imported. Give feed-sourced
// offers a 48 h window so the price stays visible until the next feed refresh.
const FEED_NETWORKS = new Set([
  'awin', 'admitad', 'kelkoo', 'tradedoubler', 'daisycon', 'webgains', 'belboon',
  'cj', 'rakuten', 'partnerize', 'impact', 'tradetracker', 'effiliation',
]);
const FEED_TTL_MINUTES = 48 * 60;

function ttlMinutesFor(offer) {
  if (FEED_NETWORKS.has(String(offer && offer.network || '').toLowerCase())) return FEED_TTL_MINUTES;
  return ttlMinutesForCountry(offer && offer.country);
}

/** Convert a price to USD using the shared FX table; 0 when not convertible. */
function toUsd(price, currency) {
  const rate = FX_TO_USD[String(currency || '').toUpperCase()];
  return (rate && price > 0) ? Math.round(price * rate * 100) / 100 : 0;
}

function ttlMinutesForCountry(country) {
  const key = String(country || '').toUpperCase();
  return PRICE_TTL_MINUTES[key] || PRICE_TTL_MINUTES.DEFAULT;
}

function expiryForOffer(offer, checkedAt = Date.now()) {
  if (offer.expiresAt) return offer.expiresAt;
  const price = Number(offer.totalPrice || offer.price) || 0;
  if (offer.priceUnknown || price <= 0) return '';
  const base = Number.isFinite(checkedAt) ? checkedAt : Date.now();
  return new Date(base + ttlMinutesFor(offer) * 60 * 1000).toISOString();
}

function isFreshPricedOffer(offer, at = Date.now()) {
  const price = Number(offer.totalPrice || offer.price) || 0;
  if (!offer || offer.priceUnknown || price <= 0 || offer.inStock === false) return false;
  if (String(offer.condition || 'new').toLowerCase() === 'used') return false;
  const availability = String(offer.availability || '').toLowerCase();
  if (availability && availability !== 'in_stock' && availability !== 'available') return false;
  const expiry = Date.parse(offer.expiresAt || '');
  if (Number.isFinite(expiry)) return expiry > at;
  const checked = Date.parse(offer.lastCheckedAt || offer.priceUpdatedAt || offer.scrapedAt || offer.updated || '');
  if (!Number.isFinite(checked)) return false;
  return at - checked <= ttlMinutesFor(offer) * 60 * 1000;
}

function effectivePrice(offer) {
  const total = Number(offer.totalPrice) || 0;
  if (total > 0) return total;
  const price = Number(offer.price) || 0;
  const shipping = Number(offer.shipping) || 0;
  return price > 0 ? Math.round((price + shipping) * 100) / 100 : 0;
}

/** Resolve the PocketBase product id for an offer (productId | gtin | mpn+brand). */
async function resolveProductId(offer) {
  if (offer.productId) return offer.productId;
  const filters = [];
  if (offer.gtin) filters.push(`gtin="${esc(offer.gtin)}"`);
  if (offer.mpn && offer.brand) filters.push(`mpn="${esc(offer.mpn)}" && brand="${esc(offer.brand)}"`);
  if (!filters.length) return null;
  const r = await req('GET',
    `/api/collections/products/records?perPage=1&fields=id&filter=${encodeURIComponent(filters.join(' || '))}`);
  return (r.status === 200 && r.body.items && r.body.items[0]) ? r.body.items[0].id : null;
}

/** Recompute lowestPrice* / offerCount on a product from its in-stock offers. */
async function refreshProductRollup(productId, categoryHint = null) {
  // Ürün kategorisi — aksesuar-fiyatı uyumsuzluğunu (ör. ₺200 telefon) rollup'a
  // sokmamak için taban kontrolünde kullanılır (scripts/lib/price_sanity.js).
  // Çağıran (sync_offers) kategoriyi zaten elinde tutuyor → hint ile ekstra
  // GET'ten kaçınırız; hint yoksa fallback olarak çekilir.
  let category = categoryHint || '';
  if (!category) {
    try {
      const pr0 = await req('GET', `/api/collections/products/records/${esc(productId)}?fields=category`);
      if (pr0.status === 200 && pr0.body) category = pr0.body.category || '';
    } catch (_) { /* kategori alınamazsa taban kontrolü sessizce atlanır */ }
  }
  const r = await req('GET',
    `/api/collections/offers/records?perPage=200&fields=id,price,totalPrice,shipping,currency,inStock,availability,condition,priceUnknown,affiliateUrl,url,store,country,lastCheckedAt,priceUpdatedAt,expiresAt,scrapedAt,updated` +
    `&filter=${encodeURIComponent(`productId="${esc(productId)}"`)}`);
  const offers = (r.status === 200 && r.body.items) ? r.body.items : [];
  const live = offers.filter(o => {
    if (o.inStock === false) return false;
    if (String(o.condition || 'new').toLowerCase() === 'used') return false;
    const availability = String(o.availability || '').toLowerCase();
    return !availability || availability === 'in_stock' || availability === 'available';
  });
  const pricedLive = live.filter(o => isFreshPricedOffer(o));
  let best = null, bestUsd = Infinity;
  // Per-country price + affiliate links so the Flutter app can show the price
  // in the visitor's own country/currency and a buy link for it.
  const prices = {};
  const affiliateLinksByCountry = {};
  const putLink = (country, store, link) => {
    const c = String(country || '').toUpperCase();
    if (!c || !link) return;
    const bucket = (affiliateLinksByCountry[c] = affiliateLinksByCountry[c] || {});
    if (!bucket[store]) bucket[store] = link;
  };
  const mirrorFallbackLinks = (o, sourceCountry, link) => {
    const store = o.store || 'Store';
    const label = `${store} ${sourceCountry}`;
    const mirrors = {
      DE: ['TR', 'RU'],
      GB: ['TR', 'RU', 'PT'],
      ES: ['PT'],
      FR: ['BE'],
      BE: ['FR'],
      US: ['BR', 'CA', 'MX'],
    }[sourceCountry] || [];
    for (const target of mirrors) putLink(target, label, link);
  };

  for (const o of pricedLive) {
    const price = effectivePrice(o);
    const usd = toUsd(price, o.currency);
    // Kategori taban kontrolü: pahalı bir üründe aksesuar fiyatı (₺200 telefon
    // gibi) hem lowestPrice'a hem ülke fiyatına girmesin. usd=0 (dönüştürülemeyen)
    // teklifler eskisi gibi geçer — muhafazakâr.
    if (usd > 0 && !isPlausibleUsd(category, usd)) continue;
    if (usd > 0 && usd < bestUsd) { bestUsd = usd; best = o; }
    const c = String(o.country || '').toUpperCase();
    const pr = price;
    if (c && pr > 0 && (prices[c] === undefined || pr < prices[c])) prices[c] = pr;
  }

  for (const o of live) {
    const c = String(o.country || '').toUpperCase();
    const link = o.affiliateUrl || o.url || '';
    putLink(c, o.store || 'Store', link);
    mirrorFallbackLinks(o, c, link);
  }
  // Stash the cheapest offer's store + affiliate link on the product so the
  // catalog list can show a price and a buy link without querying offers.
  const payload = best
    ? {
        lowestPrice: effectivePrice(best), lowestPriceCurrency: best.currency, lowestPriceUSD: bestUsd,
        offerCount: live.length, pricedOfferCount: pricedLive.length,
        bestOfferId: best.id || '', bestOfferCheckedAt: best.lastCheckedAt || best.priceUpdatedAt || best.scrapedAt || '',
        bestOfferExpiresAt: best.expiresAt || '',
        lowestOfferUrl: best.affiliateUrl || best.url || '',
        lowestOfferStore: best.store || '',
        prices, affiliateLinksByCountry,
      }
    : {
        lowestPrice: 0, lowestPriceCurrency: '', lowestPriceUSD: 0,
        offerCount: live.length, pricedOfferCount: 0,
        // Stamp the scan time even when nothing priced was found — the price
        // cron sorts by bestOfferCheckedAt (oldest first), and an empty value
        // here would make no-offer products hog every nightly window forever.
        bestOfferId: '', bestOfferCheckedAt: nowIso(), bestOfferExpiresAt: '',
        lowestOfferUrl: '', lowestOfferStore: '',
        prices: {}, affiliateLinksByCountry,
      };
  await req('PATCH', `/api/collections/products/records/${productId}`, payload);
}

async function writePriceSnapshot(offerId, rec) {
  const price = effectivePrice(rec);
  if (!offerId || price <= 0 || rec.priceUnknown) return;
  const payload = {
    offerId,
    productId: rec.productId || '',
    store: rec.store || '',
    network: rec.network || '',
    country: rec.country || '',
    price: Number(rec.price) || 0,
    shipping: Number(rec.shipping) || 0,
    totalPrice: price,
    currency: rec.currency || '',
    availability: rec.availability || '',
    condition: rec.condition || 'new',
    source: rec.source || '',
    checkedAt: rec.lastCheckedAt || rec.scrapedAt || nowIso(),
  };
  const res = await req('POST', '/api/collections/price_snapshots/records', payload);
  // Older deployments may not have the optional history collection yet. The
  // live offer still matters more than the history point, so do not fail sync.
  if (![200, 201, 404].includes(res.status)) {
    throw new Error(`price snapshot failed: ${JSON.stringify(res.body).slice(0, 200)}`);
  }
}

/**
 * Upsert one retailer offer and refresh the product rollup.
 * offer = { productId?|gtin?|mpn?+brand?, store, network, country, price,
 *           currency, priceText?, url, affiliateUrl?, condition?, inStock?, source }
 * Returns { ok, productId } or { skipped:'no-product' }.
 */
async function upsertOffer(offer) {
  const productId = await resolveProductId(offer);
  if (!productId) return { skipped: 'no-product' };

  const rec = {
    productId,
    gtin: offer.gtin || '', mpn: offer.mpn || '',
    merchantProductId: offer.merchantProductId || offer.itemId || '',
    title: String(offer.title || offer.rawTitle || '').slice(0, 500),
    store: offer.store || '', network: offer.network || '',
    country: String(offer.country || '').toUpperCase(),
    price: Number(offer.price) || 0,
    shipping: Number(offer.shipping) || 0,
    totalPrice: Number(offer.totalPrice) || effectivePrice(offer),
    currency: String(offer.currency || '').toUpperCase(),
    priceText: String(offer.priceText || '').slice(0, 60),
    url: offer.url || '', affiliateUrl: offer.affiliateUrl || '',
    condition: offer.condition || 'new',
    inStock: offer.inStock !== false,
    availability: offer.availability || (offer.inStock === false ? 'out_of_stock' : 'in_stock'),
    priceUnknown: offer.priceUnknown === true || !(Number(offer.totalPrice || offer.price) > 0),
    matchConfidence: Number(offer.matchConfidence) || (offer.gtin ? 1 : offer.mpn ? 0.85 : 0.65),
    offerKey: offer.offerKey || '',
    lastCheckedAt: offer.lastCheckedAt || offer.checkedAt || nowIso(),
    priceUpdatedAt: offer.priceUpdatedAt || offer.checkedAt || nowIso(),
    source: offer.source || '',
    scrapedAt: nowIso(),
  };
  rec.expiresAt = expiryForOffer({ ...offer, ...rec }, Date.parse(rec.lastCheckedAt));
  if (!rec.offerKey) {
    const dedupeTail = rec.merchantProductId || rec.gtin || rec.mpn || rec.store;
    rec.offerKey = [productId, rec.network, rec.country, rec.store, dedupeTail].map(v => String(v || '').toLowerCase()).join('|').slice(0, 255);
  }

  // One offer per product + store + country — refresh it in place.
  const filter = rec.offerKey
    ? `offerKey="${esc(rec.offerKey)}"`
    : `productId="${esc(productId)}" && store="${esc(rec.store)}" && country="${esc(rec.country)}"`;
  const found = await req('GET',
    `/api/collections/offers/records?perPage=1&fields=id&filter=${encodeURIComponent(filter)}`);
  let res;
  if (found.status === 200 && found.body.items && found.body.items[0]) {
    res = await req('PATCH', `/api/collections/offers/records/${found.body.items[0].id}`, rec);
  } else {
    res = await req('POST', '/api/collections/offers/records', rec);
  }
  if (![200, 201].includes(res.status)) {
    throw new Error(`offer upsert failed: ${JSON.stringify(res.body).slice(0, 200)}`);
  }
  await writePriceSnapshot(res.body.id, rec);
  await refreshProductRollup(productId, offer.category || null);
  return { ok: true, productId };
}

async function deleteOffersForProductNetwork(productId, network, opts = {}) {
  const pid = String(productId || '').trim();
  const net = String(network || '').trim();
  if (!pid || !net) return { deleted: 0 };
  const filter = `productId="${esc(pid)}" && network="${esc(net)}"`;
  const found = await req('GET',
    `/api/collections/offers/records?perPage=200&fields=id&filter=${encodeURIComponent(filter)}`);
  if (found.status !== 200) {
    throw new Error(`offer cleanup failed: ${JSON.stringify(found.body).slice(0, 200)}`);
  }
  const items = found.body.items || [];
  let deleted = 0;
  for (const item of items) {
    const res = await req('DELETE', `/api/collections/offers/records/${item.id}`);
    if ([200, 204].includes(res.status)) deleted++;
    else throw new Error(`offer delete failed: ${JSON.stringify(res.body).slice(0, 200)}`);
  }
  if (opts.refresh !== false) await refreshProductRollup(pid);
  return { deleted };
}

module.exports = {
  upsertOffer, refreshProductRollup, resolveProductId, toUsd,
  deleteOffersForProductNetwork, isFreshPricedOffer, effectivePrice,
};
