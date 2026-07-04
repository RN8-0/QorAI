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
 *      amazon_direct rows supply previous prices for sanity + keep-alive
 *   2. fetchAmazonPrice(cc, asin) on every marketplace IN PARALLEL (each host
 *      has its own pace gate in amazon_page, so three markets cost one gap)
 *        ok        → write offer (direct /dp/<ASIN> + per-market tag)
 *        no-price  → no offer on that storefront (runner clears stale rows)
 *        gone      → same
 *        throw     → transient (wall/5xx): re-emit the market's EXISTING row
 *                    (keep-alive) so the runner's delete-then-insert cycle
 *                    does not drop it — price just stays one day older
 *   3. sanity: a new price outside [25%, 400%] of the previous one is
 *      suspicious (parse drift / price glitch) — keep-alive the OLD offer
 *      (price + extended expiry), log. Never publish a wild swing silently.
 *
 * Circuit breaker: MAX_STRIKES consecutive transient failures trip the
 * breaker; later products fail fast ("breaker open") so a bot wall degrades
 * to "prices stay one day older" instead of hammering Amazon. The breaker
 * cools down (default 45 min) and allows one probe — captcha walls usually
 * clear in minutes, so a multi-hour run gets the market back the same night.
 *
 * Config (migration/.env or process env):
 *   AMAZON_DIRECT_ENABLED=0     kill switch
 *   AMAZON_DIRECT_MARKETS       CSV, default "DE,GB"
 *   AMAZON_DIRECT_BREAKER_COOLDOWN_MIN  breaker cooldown, default 45
 *   AMAZON_TAG_DE / AMAZON_TAG_UK / … per-market Associates tag,
 *   AMAZON_TAG                  fallback tag (qorai-20)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { req } = require('../../migration/pb');
const { toUsd } = require('../lib/offers');
const { MARKETPLACES, marketTag, fetchAmazonPrice, searchLocalAsin, titleMatches } = require('../lib/amazon_page');

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
// Skip a product whose amazon_direct offers on ALL target markets were checked
// within this window. This is the load governor: a home IP can only fetch so
// many Amazon pages a day before the bot wall trips, so once a product is
// priced we don't re-scrape it until its price is ~a day old. The nightly run
// can ask for --limit=4000 yet only actually hit the network for the products
// that are stale or never-seen — volume self-regulates.
const SKIP_FRESH = ENV.AMAZON_DIRECT_SKIP_FRESH !== '0';
const SKIP_FRESH_MS = Math.max(1, Number(ENV.AMAZON_DIRECT_SKIP_FRESH_H || 20)) * 60 * 60 * 1000;
const MAX_STRIKES = 6;
// PER-MARKET breaker: amazon.com's search wall must not stop amazon.de/.co.uk
// pricing (one blocked country used to abort the whole product AND, at 6
// strikes, the whole run for every market).
// The breaker COOLS DOWN instead of staying open for the whole run: Amazon's
// captcha walls usually clear within minutes, and a multi-hour run used to
// lose a market permanently to one bad stretch. After the cooldown one probe
// is allowed — its single failure re-opens the breaker for another cooldown.
const BREAKER_COOLDOWN_MS = Math.max(5, Number(ENV.AMAZON_DIRECT_BREAKER_COOLDOWN_MIN || 45)) * 60 * 1000;
const marketStrikes = {};
const marketBreaker = {}; // cc → tripped-at ms
let breakerLogged = false;

function breakerActive(cc) {
  const trippedAt = marketBreaker[cc];
  if (!trippedAt) return false;
  if (Date.now() - trippedAt < BREAKER_COOLDOWN_MS) return true;
  delete marketBreaker[cc]; // half-open: one strike away from re-opening
  marketStrikes[cc] = MAX_STRIKES - 1;
  console.log(`  ! amazon_direct: ${cc} breaker half-open — probing again after cooldown`);
  return false;
}

const esc = v => String(v || '').replace(/"/g, '\\"');

/** Epey's scraped TR display price ("6.524,10 TL", "42.999 TL") → number.
 *  Dot is the Turkish THOUSANDS separator: a comma-less "1.299" is 1299,
 *  never 1.299 — so this must not go through the generic parseMoney. */
function parseTryPriceRaw(raw) {
  const m = String(raw || '').trim().match(/^₺?\s*([\d.,]+)\s*(?:TL|₺|TRY)?$/i);
  if (!m) return 0;
  let num = m[1];
  if (num.includes(',')) num = num.replace(/\./g, '').replace(',', '.');
  else num = num.replace(/\./g, '');
  const v = Number(num);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function formatPrice(value, currency) {
  const locale = { EUR: 'de-DE', GBP: 'en-GB', USD: 'en-US', TRY: 'tr-TR' }[currency] || 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value);
  } catch { return `${value} ${currency}`; }
}

/** One offers query serves both needs: the epey_amazon row carries the ASIN,
 *  our own rows carry previous prices for the sanity check — and the FULL
 *  previous rows back the keep-alive path (see keepAliveOffer). */
async function loadOfferContext(productId) {
  const filter = `productId="${esc(productId)}" && (network="epey_amazon" || network="amazon_direct")`;
  const r = await req('GET',
    `/api/collections/offers/records?perPage=50&filter=${encodeURIComponent(filter)}`);
  if (r.status !== 200) throw new Error(`offer context ${r.status}`);
  const items = r.body.items || [];
  const trOffer = items.find(o => o.network === 'epey_amazon' && /^[A-Z0-9]{10}$/.test(o.merchantProductId || ''));
  const asin = trOffer ? trOffer.merchantProductId : '';
  // The Epey-verified TR price is the cross-market referee: the same product
  // on another storefront can't plausibly cost >3.5× / <1/3.5 of it in USD.
  const refUsd = trOffer ? toUsd(trOffer.price, trOffer.currency) : 0;
  const previous = {};
  const prevRows = {};
  const checkedAt = {};
  // Per-market LOCAL ASINs from our own earlier rows: Amazon catalogues are
  // regional (a TR ASIN usually doesn't exist on .de/.co.uk/.com), so once the
  // name-search fallback resolves a market's own ASIN we keep re-using it and
  // never pay the search request again.
  const localAsins = {};
  for (const o of items) {
    if (o.network === 'amazon_direct' && o.country) {
      if (o.price > 0) { previous[o.country] = o.price; prevRows[o.country] = o; }
      if (/^[A-Z0-9]{10}$/.test(o.merchantProductId || '')) localAsins[o.country] = o.merchantProductId;
      const t = Date.parse(o.lastCheckedAt || '');
      if (Number.isFinite(t)) checkedAt[o.country] = t;
    }
  }
  return { asin, previous, prevRows, refUsd, checkedAt, localAsins };
}

/** Re-emit a market's EXISTING offer so the runner's delete-then-insert cycle
 *  does not drop it. Used for every "checked nothing new tonight" outcome —
 *  breaker open, transient wall, sanity skip — so a bad stretch degrades to
 *  "price stays one day older" instead of the row vanishing from the site.
 *  lastCheckedAt is NOT bumped (SKIP_FRESH must re-check the product soon);
 *  expiresAt IS extended, or the row would expire mid-wall anyway.
 *  Definite no-offer ('gone' / 'no-price') must NOT come here — delisting has
 *  to keep deleting rows. */
function keepAliveOffer(product, cc, prevRow) {
  if (!prevRow || !(prevRow.price > 0)) return null;
  const mk = MARKETPLACES[cc];
  const url = prevRow.url ||
    (/^[A-Z0-9]{10}$/.test(prevRow.merchantProductId || '') ? `https://${mk.host}/dp/${prevRow.merchantProductId}` : '');
  if (!url) return null;
  return {
    productId: product.id,
    store: prevRow.store || mk.store,
    network: 'amazon_direct',
    country: cc,
    price: prevRow.price,
    shipping: prevRow.shipping || 0,
    totalPrice: prevRow.totalPrice || prevRow.price,
    currency: prevRow.currency || mk.currency,
    priceText: prevRow.priceText || formatPrice(prevRow.price, prevRow.currency || mk.currency),
    url,
    affiliateUrl: prevRow.affiliateUrl || url,
    merchantProductId: prevRow.merchantProductId || '',
    condition: prevRow.condition || 'new',
    inStock: prevRow.inStock !== false,
    availability: prevRow.availability || 'in_stock',
    matchConfidence: prevRow.matchConfidence || 0.85,
    source: prevRow.source || 'amazon',
    lastCheckedAt: prevRow.lastCheckedAt || '',
    priceUpdatedAt: prevRow.priceUpdatedAt || '',
    expiresAt: new Date(Date.now() + EXPIRES_MS).toISOString(),
  };
}

module.exports = {
  id: 'amazon_direct',

  isConfigured() {
    return ENV.AMAZON_DIRECT_ENABLED !== '0' && MARKETS.length > 0;
  },

  async searchOffers(product) {
    if (MARKETS.every(cc => breakerActive(cc))) {
      // Fail fast without spamming the log once every market's wall is up: the
      // first trip already explained itself; the rest just note the count.
      if (!breakerLogged) { breakerLogged = true; throw new Error('breaker open — Amazon bot wall hit on every market; remaining products left untouched this run'); }
      throw new Error('breaker open');
    }
    const ctx = await loadOfferContext(product.id);
    const { asin, previous, prevRows, checkedAt, localAsins } = ctx;
    // Discovery products have no epey_amazon row yet, so no TR referee — but
    // Epey's own scraped display price (products.price_raw, TRY) is just as
    // good for the ±3.5× sanity band. Without it a wrong search match on a
    // never-priced product would publish with no cross-check at all.
    const refUsd = ctx.refUsd || toUsd(parseTryPriceRaw(product.price_raw), 'TRY');
    // No TR ASIN → we can still price via per-market name search (below); but
    // without a name there is nothing to search for.
    if (!asin && !String(product.name || '').trim()) return [];

    // Load governor: if every target market already has a fresh amazon_direct
    // price, skip WITHOUT touching Amazon (null = "leave my offers as they are").
    if (SKIP_FRESH) {
      const now = Date.now();
      const allFresh = MARKETS.every(cc => (now - (checkedAt[cc] || 0)) < SKIP_FRESH_MS);
      if (allFresh) return null;
    }

    // Markets run in PARALLEL: each storefront is its own host with its own
    // pace gate in amazon_page, so pricing DE+GB+US concurrently costs one
    // gap of wall time instead of three — per-host request rate is unchanged.
    const results = await Promise.all(MARKETS.map(cc => this._priceMarket(cc, { product, asin, previous, prevRows, refUsd, checkedAt, localAsins })));
    const out = results.filter(Boolean);
    // The runner's cleanup deletes ALL amazon_direct rows for the product —
    // including countries this run is NOT configured for (the PC task runs
    // DE,GB,US while the Hetzner cron runs TR,DE,GB,US). Re-emit the
    // unconfigured countries' rows untouched, or a subset-market run silently
    // wipes the other markets' prices every night.
    for (const cc of Object.keys(prevRows)) {
      if (MARKETS.includes(cc)) continue;
      const keep = keepAliveOffer(product, cc, prevRows[cc]);
      if (keep) out.push(keep);
    }
    return out;
  },

  /** Price one product on one marketplace. Returns a fresh offer, a
   *  keep-alive of the existing offer (breaker / transient / sanity-skip —
   *  the runner deletes-then-reinserts, so absence = the row is dropped), or
   *  null for a definite no-offer. Never throws — a market's wall must not
   *  abort its peers. */
  async _priceMarket(cc, { product, asin, previous, prevRows, refUsd, checkedAt, localAsins }) {
    if (breakerActive(cc)) return keepAliveOffer(product, cc, prevRows[cc]); // wall up — skip market, keep its row
    // Per-market load governor: when only SOME markets are stale (e.g. a US
    // breaker night left US rows missing while DE/GB are hours old), the
    // product passes the all-fresh skip above — but the fresh markets still
    // must not re-hit Amazon. Keep their rows, fetch only the stale peers.
    if (SKIP_FRESH && (Date.now() - (checkedAt[cc] || 0)) < SKIP_FRESH_MS) {
      return keepAliveOffer(product, cc, prevRows[cc]);
    }
    const mk = MARKETPLACES[cc];
    // Candidate order: the market's own ASIN from a previous run → the
    // Epey-verified TR ASIN → PEER markets' local ASINs. Catalogues are
    // regional, but EU/global listings often share ASINs — and on a
    // datacenter IP (Hetzner) the GB/US SEARCH page is walled while /dp/
    // keeps working, so a DE-resolved ASIN is frequently GB's only bridge.
    // Every candidate costs one /dp/ fetch; the cap keeps dead products cheap.
    const candidates = [...new Set(
      [localAsins[cc], asin, ...MARKETS.filter(m => m !== cc).map(m => localAsins[m])].filter(Boolean)
    )].slice(0, 3);
    let mAsin = '';
    let res = null;
    const strike = (e) => {
      // Transient for THIS market only: its existing row survives via
      // keep-alive at the call site, and the other markets keep pricing.
      marketStrikes[cc] = (marketStrikes[cc] || 0) + 1;
      if (marketStrikes[cc] >= MAX_STRIKES && !marketBreaker[cc]) {
        marketBreaker[cc] = Date.now();
        console.log(`  ! amazon_direct: ${cc} breaker open (${e.message}) — cooling down ${Math.round(BREAKER_COOLDOWN_MS / 60000)} min`);
      }
    };
    try {
      for (const cand of candidates) {
        mAsin = cand;
        res = await fetchAmazonPrice(cc, cand);
        marketStrikes[cc] = 0;
        // Re-validate every ASIN that is not the Epey-verified TR one against
        // the fetched page title: a wrong match stored once (e.g. a Pad 3
        // listing saved for the Pad 4) would otherwise refresh itself via
        // direct /dp/ forever and never face a matcher again. This covers
        // search-resolved AND peer-market candidates alike.
        if (res && res.ok && cand !== asin && !titleMatches(product.name, res.title)) {
          console.log(`  ! amazon_direct title-mismatch: ${cand} ${cc} "${String(res.title).slice(0, 60)}" — next candidate`);
          res = { ok: false, reason: 'wrong-asin' };
        }
        if (res && res.ok) break;
      }
    } catch (e) { strike(e); return keepAliveOffer(product, cc, prevRows[cc]); }
    if ((!res || !res.ok) && String(product.name || '').trim()) {
      try {
        const found = await searchLocalAsin(cc, product.name);
        if (found.ok && found.asin !== mAsin) {
          mAsin = found.asin;
          res = await fetchAmazonPrice(cc, mAsin);
        }
      } catch (e) {
        // The SEARCH wall must not trip the market breaker. Measured from the
        // Hetzner IP (2026-07-04): TR + DE search pages WORK, GB answers 202
        // and US 503 permanently — while direct /dp/<ASIN> keeps working on
        // TR/DE/GB. So ASIN-known products must keep pricing; GB local-ASIN
        // discovery rides the peer-ASIN bridge above, and US is left to the
        // residential (PC) run. Skip this product+market silently.
        return keepAliveOffer(product, cc, prevRows[cc]);
      }
    }
    if (!res || !res.ok) return null; // definite no-offer on this storefront — let the stale row drop

    const price = res.price;
    // Sanity 1 — cross-market referee: reject a price wildly off the
    // Epey-verified TR price (catches parse drift like "3 options from
    // £109" → 3109). Publishing a wrong price is the worst outcome, so keep
    // the OLD offer alive instead (a wrong TR referee — Epey mismatch — used
    // to DELETE a market's good row every night).
    const newUsd = toUsd(price, mk.currency);
    if (refUsd > 0 && newUsd > 0 && (newUsd > refUsd * 3.5 || newUsd < refUsd / 3.5)) {
      console.log(`  ! amazon_direct sanity(ref): ${mAsin} ${cc} ${price} ${mk.currency} vs TR ~$${refUsd} — skipped`);
      return keepAliveOffer(product, cc, prevRows[cc]);
    }
    // Sanity 2 — no referee available: guard against swings vs our own
    // previous price for this marketplace.
    const prev = previous[cc];
    if (!refUsd && prev > 0 && (price < prev * 0.25 || price > prev * 4)) {
      console.log(`  ! amazon_direct sanity(prev): ${mAsin} ${cc} ${prev} → ${price} — skipped`);
      return keepAliveOffer(product, cc, prevRows[cc]);
    }

    const direct = `https://${mk.host}/dp/${mAsin}`;
    const tag = marketTag(cc);
    const now = Date.now();
    return {
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
      merchantProductId: mAsin,
      condition: 'new',
      inStock: true,
      availability: 'in_stock',
      // 1 = the verified TR ASIN itself; 0.85 = local ASIN resolved by strict
      // name-token search (still guarded by the TR price referee above).
      matchConfidence: (asin && mAsin === asin) ? 1 : 0.85,
      source: 'amazon',
      lastCheckedAt: new Date(now).toISOString(),
      priceUpdatedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + EXPIRES_MS).toISOString(),
    };
  },
};
