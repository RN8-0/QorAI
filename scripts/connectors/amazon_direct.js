/**
 * Qor AI — Amazon multi-marketplace price connector (ASIN-first)
 *
 * THE follow-up to epey_amazon: once a product's real Amazon ASIN is known
 * (epey_amazon stores it in offers.merchantProductId), that same ASIN is
 * valid on EVERY Amazon storefront. This connector prices it on the
 * configured marketplaces (default DE + GB) through scripts/lib/amazon_page
 * — one parser for all countries, a marketplace is just a config row.
 *
 * Per product:
 *   1. read its offers once — the epey_amazon row supplies the ASIN, our own
 *      amazon_direct rows supply previous prices for the sanity check
 *   2. fetchAmazonPrice(cc, asin) per marketplace
 *        ok        → write offer (direct /dp/<ASIN> + per-market tag)
 *        no-price  → no offer on that storefront (runner clears stale rows)
 *        gone      → same
 *        throw     → whole product aborts, existing offers stay alive
 *   3. sanity: a new price outside [25%, 400%] of the previous one is
 *      suspicious (parse drift / price glitch) — keep the OLD price, extend
 *      its expiry, log. Never publish a wild swing silently.
 *
 * Circuit breaker: MAX_STRIKES consecutive transient failures trip the
 * breaker; every later product fails fast ("breaker open") so a bot-wall
 * night degrades to "prices stay one day older" instead of hammering Amazon.
 *
 * Config (migration/.env or process env):
 *   AMAZON_DIRECT_ENABLED=0     kill switch
 *   AMAZON_DIRECT_MARKETS       CSV, default "DE,GB"
 *   AMAZON_TAG_DE / AMAZON_TAG_UK / … per-market Associates tag,
 *   AMAZON_TAG                  fallback tag (qorai-20)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { req } = require('../../migration/pb');
const { toUsd } = require('../lib/offers');
const { MARKETPLACES, marketTag, fetchAmazonPrice } = require('../lib/amazon_page');

function loadEnv() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', '..', 'migration', '.env'), 'utf8');
    return Object.fromEntries(raw.split(/\r?\n/)
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  } catch { return {}; }
}
const ENV = { ...loadEnv(), ...process.env };

const MARKETS = String(ENV.AMAZON_DIRECT_MARKETS || 'DE,GB')
  .split(',').map(s => s.trim().toUpperCase()).filter(cc => MARKETPLACES[cc]);
// 50 h expiry like epey_amazon: prices survive one missed nightly run.
const EXPIRES_MS = 50 * 60 * 60 * 1000;
const MAX_STRIKES = 6;
let strikes = 0;
let breakerOpen = false;

const esc = v => String(v || '').replace(/"/g, '\\"');

function formatPrice(value, currency) {
  const locale = { EUR: 'de-DE', GBP: 'en-GB', USD: 'en-US', TRY: 'tr-TR' }[currency] || 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
  } catch { return `${value} ${currency}`; }
}

/** One offers query serves both needs: the epey_amazon row carries the ASIN,
 *  our own rows carry previous prices for the sanity check. */
async function loadOfferContext(productId) {
  const filter = `productId="${esc(productId)}" && (network="epey_amazon" || network="amazon_direct")`;
  const r = await req('GET',
    `/api/collections/offers/records?perPage=50&fields=network,country,price,currency,merchantProductId&filter=${encodeURIComponent(filter)}`);
  if (r.status !== 200) throw new Error(`offer context ${r.status}`);
  const items = r.body.items || [];
  const trOffer = items.find(o => o.network === 'epey_amazon' && /^[A-Z0-9]{10}$/.test(o.merchantProductId || ''));
  const asin = trOffer ? trOffer.merchantProductId : '';
  // The Epey-verified TR price is the cross-market referee: the same product
  // on another storefront can't plausibly cost >3.5× / <1/3.5 of it in USD.
  const refUsd = trOffer ? toUsd(trOffer.price, trOffer.currency) : 0;
  const previous = {};
  for (const o of items) {
    if (o.network === 'amazon_direct' && o.country && o.price > 0) previous[o.country] = o.price;
  }
  return { asin, previous, refUsd };
}

module.exports = {
  id: 'amazon_direct',

  isConfigured() {
    return ENV.AMAZON_DIRECT_ENABLED !== '0' && MARKETS.length > 0;
  },

  async searchOffers(product) {
    if (breakerOpen) throw new Error('breaker open (earlier bot wall / repeated failures)');
    const { asin, previous, refUsd } = await loadOfferContext(product.id);
    if (!asin) return []; // no verified ASIN → nothing to do on any storefront

    const offers = [];
    for (const cc of MARKETS) {
      const mk = MARKETPLACES[cc];
      let res;
      try {
        res = await fetchAmazonPrice(cc, asin);
        strikes = 0;
      } catch (e) {
        strikes++;
        if (strikes >= MAX_STRIKES) breakerOpen = true;
        throw e; // transient — runner keeps existing offers for this product
      }
      if (!res.ok) continue; // definite no-offer on this storefront

      const price = res.price;
      // Sanity 1 — cross-market referee: reject a price wildly off the
      // Epey-verified TR price (catches parse drift like "3 options from
      // £109" → 3109). Skipping the offer beats publishing a wrong price.
      const newUsd = toUsd(price, mk.currency);
      if (refUsd > 0 && newUsd > 0 && (newUsd > refUsd * 3.5 || newUsd < refUsd / 3.5)) {
        console.log(`  ! amazon_direct sanity(ref): ${asin} ${cc} ${price} ${mk.currency} vs TR ~$${refUsd} — skipped`);
        continue;
      }
      // Sanity 2 — no referee available: guard against swings vs our own
      // previous price for this marketplace.
      const prev = previous[cc];
      if (!refUsd && prev > 0 && (price < prev * 0.25 || price > prev * 4)) {
        console.log(`  ! amazon_direct sanity(prev): ${asin} ${cc} ${prev} → ${price} — skipped`);
        continue;
      }

      const direct = `https://${mk.host}/dp/${asin}`;
      const tag = marketTag(cc);
      const now = Date.now();
      offers.push({
        productId: product.id,
        store: mk.store,
        network: 'amazon_direct',
        country: cc,
        price,
        shipping: 0,
        totalPrice: price,
        currency: mk.currency,
        priceText: formatPrice(price, mk.currency),
        url: direct,
        affiliateUrl: tag ? `${direct}?tag=${encodeURIComponent(tag)}` : direct,
        merchantProductId: asin,
        condition: 'new',
        inStock: true,
        availability: 'in_stock',
        matchConfidence: 1, // same ASIN as the verified TR offer
        source: 'amazon',
        lastCheckedAt: new Date(now).toISOString(),
        priceUpdatedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + EXPIRES_MS).toISOString(),
      });
    }
    return offers;
  },
};
