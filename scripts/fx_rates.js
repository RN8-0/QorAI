// ═══════════════════════════════════════════════════════════════════════════
//  QOR AI — Currency conversion table (to USD)
//
//  Single source of truth for converting product prices into a base USD value
//  used by Typesense for server-side range filters and price sorting.
//  Keys can be either country codes (ProductModel.prices Map keys) or ISO
//  currency codes (some legacy records). Values are multipliers that turn
//  the local amount into USD: localAmount × FX_TO_USD[key] = USD.
//
//  This file is consumed by:
//    - migration/ts_index.js              (Node CLI bulk indexer)
//    - admin/js/ts_client.js              (browser admin)
//    - pb_hooks/typesense_sync.pb.js      (PocketBase JSVM, copied inline)
//
//  Rates are intentionally conservative monthly averages — refreshed when
//  major rates drift > 5%. Keep them aligned with the table mirrored inside
//  the PB hook (PB JSVM cannot require external modules).
//
//  When updating: bump the version and re-run the TS backfill script so the
//  full catalogue is re-priced in USD.
// ═══════════════════════════════════════════════════════════════════════════

const FX_VERSION = '2026.05';

const FX_TO_USD = Object.freeze({
  // North America
  US: 1.00, USD: 1.00,
  CA: 0.73, CAD: 0.73,
  MX: 0.058, MXN: 0.058,
  // Eurozone (single rate for all EUR countries)
  DE: 1.08, AT: 1.08, NL: 1.08, BE: 1.08, FR: 1.08, IT: 1.08, ES: 1.08,
  PT: 1.08, IE: 1.08, FI: 1.08, GR: 1.08, EU: 1.08, EUR: 1.08,
  // Other Europe
  UK: 1.27, GB: 1.27, GBP: 1.27,
  PL: 0.25, PLN: 0.25,
  CH: 1.13, CHF: 1.13,
  SE: 0.094, SEK: 0.094,
  NO: 0.092, NOK: 0.092,
  DK: 0.145, DKK: 0.145,
  // MENA + Türkiye
  TR: 0.0286, TRY: 0.0286,        // ~1/35
  AE: 0.272, AED: 0.272,
  SA: 0.267, SAR: 0.267,
  // Asia
  IN: 0.0120, INR: 0.0120,         // ~1/83
  JP: 0.0067, JPY: 0.0067,         // ~1/150
  CN: 0.14, CNY: 0.14,
  KR: 0.00072, KRW: 0.00072,
  SG: 0.74, SGD: 0.74,
  HK: 0.128, HKD: 0.128,
  // Oceania
  AU: 0.65, AUD: 0.65,
  NZ: 0.60, NZD: 0.60,
  // South America
  BR: 0.20, BRL: 0.20,
  AR: 0.0011, ARS: 0.0011,
});

/**
 * Returns the lowest price of a product expressed in USD, rounded to cents.
 * Accepts the country/currency-keyed `prices` map shape used across the app.
 * Returns 0 (not null) when no usable price is found so Typesense can store
 * the field as an int/float without nullable handling on every read.
 *
 * @param {Record<string, number>|Object|null|undefined} prices
 * @returns {number} lowest price converted to USD, or 0 when unavailable
 */
function lowestPriceUsd(prices) {
  if (!prices || typeof prices !== 'object') return 0;
  let lowest = Infinity;
  const entries = Array.isArray(prices)
    ? prices.map((value, idx) => [String(idx), value])
    : Object.entries(prices);
  for (const [rawKey, rawValue] of entries) {
    const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
    if (!isFinite(value) || value <= 0) continue;
    const key = String(rawKey || '').toUpperCase();
    const fx = FX_TO_USD[key];
    if (!fx) continue;
    const usd = value * fx;
    if (usd < lowest) lowest = usd;
  }
  if (lowest === Infinity) return 0;
  return Math.round(lowest * 100) / 100;
}

module.exports = { FX_TO_USD, FX_VERSION, lowestPriceUsd };
