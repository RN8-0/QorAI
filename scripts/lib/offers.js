/**
 * Qor AI — offers writer
 *
 * The single, source-agnostic entry point for writing retailer offers.
 * The Geizhals scraper, an eBay connector, an Amazon PA-API connector — any
 * price source — calls upsertOffer() and the `offers` collection plus the
 * product's price rollup (lowestPrice* / offerCount) stay consistent.
 *
 * A product is matched by explicit productId, else by gtin, else by
 * mpn+brand — the keys Icecat already fills on every product.
 */
'use strict';

const { req } = require('../../migration/pb');
const { FX_TO_USD } = require('../fx_rates');

const esc = v => String(v || '').replace(/"/g, '\\"');

/** Convert a price to USD using the shared FX table; 0 when not convertible. */
function toUsd(price, currency) {
  const rate = FX_TO_USD[String(currency || '').toUpperCase()];
  return (rate && price > 0) ? Math.round(price * rate * 100) / 100 : 0;
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
async function refreshProductRollup(productId) {
  const r = await req('GET',
    `/api/collections/offers/records?perPage=200&fields=price,currency,inStock` +
    `&filter=${encodeURIComponent(`productId="${esc(productId)}"`)}`);
  const offers = (r.status === 200 && r.body.items) ? r.body.items : [];
  const live = offers.filter(o => o.inStock !== false);
  let best = null, bestUsd = Infinity;
  for (const o of live) {
    const usd = toUsd(o.price, o.currency);
    if (usd > 0 && usd < bestUsd) { bestUsd = usd; best = o; }
  }
  const payload = best
    ? { lowestPrice: best.price, lowestPriceCurrency: best.currency, lowestPriceUSD: bestUsd, offerCount: live.length }
    : { lowestPrice: 0, lowestPriceCurrency: '', lowestPriceUSD: 0, offerCount: live.length };
  await req('PATCH', `/api/collections/products/records/${productId}`, payload);
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
    store: offer.store || '', network: offer.network || '',
    country: String(offer.country || '').toUpperCase(),
    price: Number(offer.price) || 0,
    currency: String(offer.currency || '').toUpperCase(),
    priceText: String(offer.priceText || '').slice(0, 60),
    url: offer.url || '', affiliateUrl: offer.affiliateUrl || '',
    condition: offer.condition || 'new',
    inStock: offer.inStock !== false,
    source: offer.source || '',
    scrapedAt: new Date().toISOString(),
  };

  // One offer per product + store + country — refresh it in place.
  const filter = `productId="${esc(productId)}" && store="${esc(rec.store)}" && country="${esc(rec.country)}"`;
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
  await refreshProductRollup(productId);
  return { ok: true, productId };
}

module.exports = { upsertOffer, refreshProductRollup, resolveProductId, toUsd };
