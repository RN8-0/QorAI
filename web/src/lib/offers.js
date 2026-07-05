import { pb } from './pocketbase';
import {
  CURRENCY_BY_COUNTRY,
  PRICE_COUNTRIES_BY_LANG,
  amazonTagUrl,
  offerForLang,
  safeExternalUrl,
} from './format';

const PRICE_TTL_MS = {
  TR: 45 * 60 * 1000,
  DE: 120 * 60 * 1000,
  GB: 120 * 60 * 1000,
  UK: 120 * 60 * 1000,
  US: 180 * 60 * 1000,
  DEFAULT: 180 * 60 * 1000,
};

function escFilter(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function ts(value) {
  const n = Date.parse(value || '');
  return Number.isFinite(n) ? n : 0;
}

function ttlForCountry(country) {
  return PRICE_TTL_MS[String(country || '').toUpperCase()] || PRICE_TTL_MS.DEFAULT;
}

function priceValue(offer) {
  const total = Number(offer?.totalPrice) || 0;
  if (total > 0) return total;
  const price = Number(offer?.price) || 0;
  const shipping = Number(offer?.shipping) || 0;
  return price > 0 ? Math.round((price + shipping) * 100) / 100 : 0;
}

function isLiveOffer(offer) {
  if (!offer || offer.inStock === false) return false;
  if (String(offer.condition || 'new').toLowerCase() === 'used') return false;
  const availability = String(offer.availability || '').toLowerCase();
  return !availability || availability === 'in_stock' || availability === 'available';
}

export function isFreshPricedOffer(offer, at = Date.now()) {
  if (!isLiveOffer(offer) || offer.priceUnknown) return false;
  const price = priceValue(offer);
  if (price <= 0) return false;
  const expires = ts(offer.expiresAt);
  if (expires) return expires > at;
  const checked = ts(offer.lastCheckedAt || offer.priceUpdatedAt || offer.scrapedAt || offer.updated);
  return Boolean(checked && at - checked <= ttlForCountry(offer.country));
}

export function normalizeOffer(record) {
  const price = priceValue(record);
  return {
    id: record.id || '',
    productId: record.productId || '',
    store: record.store || '',
    network: record.network || '',
    country: String(record.country || '').toUpperCase(),
    price,
    rawPrice: Number(record.price) || 0,
    shipping: Number(record.shipping) || 0,
    currency: String(record.currency || CURRENCY_BY_COUNTRY[String(record.country || '').toUpperCase()] || 'USD').toUpperCase(),
    priceText: record.priceText || '',
    url: safeExternalUrl(record.affiliateUrl || record.url || ''),
    directUrl: safeExternalUrl(record.url || ''),
    condition: record.condition || 'new',
    availability: record.availability || '',
    inStock: record.inStock !== false,
    priceUnknown: record.priceUnknown === true || !(price > 0),
    matchConfidence: Number(record.matchConfidence) || 0,
    lastCheckedAt: record.lastCheckedAt || record.priceUpdatedAt || record.scrapedAt || record.updated || '',
    expiresAt: record.expiresAt || '',
    source: record.source || '',
    hasExactPrice: isFreshPricedOffer(record),
  };
}

export async function fetchProductOffers(productId) {
  if (!productId) return [];
  try {
    const records = await pb.collection('offers').getFullList({
      filter: `productId="${escFilter(productId)}"`,
      sort: 'country,totalPrice,price,updated',
      fields: [
        'id', 'productId', 'store', 'network', 'country',
        'price', 'shipping', 'totalPrice', 'currency', 'priceText',
        'url', 'affiliateUrl', 'condition', 'availability', 'inStock',
        'priceUnknown', 'matchConfidence', 'lastCheckedAt',
        'priceUpdatedAt', 'expiresAt', 'scrapedAt', 'updated', 'source',
      ].join(','),
    });
    return records.map(normalizeOffer).filter(o => o.url && isLiveOffer(o));
  } catch (err) {
    console.warn('[offers] fetch failed', err);
    return [];
  }
}

export async function fetchProductPriceSnapshots(productId, { country = '', limit = 120 } = {}) {
  if (!productId) return [];
  try {
    const filters = [`productId="${escFilter(productId)}"`];
    const cc = String(country || '').toUpperCase();
    if (cc) filters.push(`country="${escFilter(cc)}"`);
    const records = await pb.collection('price_snapshots').getFullList({
      filter: filters.join(' && '),
      sort: '-checkedAt,-created',
      fields: [
        'id', 'offerId', 'productId', 'store', 'network', 'country',
        'price', 'shipping', 'totalPrice', 'currency', 'availability',
        'condition', 'source', 'checkedAt', 'created',
      ].join(','),
      batch: Math.min(Math.max(limit, 20), 200),
    });
    return records
      .map((record) => {
        const total = Number(record.totalPrice) || Number(record.price) + Number(record.shipping || 0);
        return {
          id: record.id || '',
          offerId: record.offerId || '',
          store: record.store || record.network || '',
          country: String(record.country || '').toUpperCase(),
          price: Math.round(total * 100) / 100,
          currency: String(record.currency || CURRENCY_BY_COUNTRY[String(record.country || '').toUpperCase()] || 'USD').toUpperCase(),
          checkedAt: record.checkedAt || record.created || '',
          source: record.source || '',
        };
      })
      .filter((x) => x.price > 0 && x.checkedAt)
      .sort((a, b) => Date.parse(a.checkedAt) - Date.parse(b.checkedAt))
      .slice(-Math.min(Math.max(limit, 20), 200));
  } catch (err) {
    console.warn('[offers] price snapshots fetch failed', err);
    return [];
  }
}

function countryRank(country, countries) {
  const i = countries.indexOf(String(country || '').toUpperCase());
  return i === -1 ? countries.length + 1 : i;
}

function sortOffersForLang(offers, countries) {
  return [...offers].sort((a, b) => {
    const ar = countryRank(a.country, countries);
    const br = countryRank(b.country, countries);
    if (ar !== br) return ar - br;
    if (a.hasExactPrice !== b.hasExactPrice) return a.hasExactPrice ? -1 : 1;
    return (a.price || Number.MAX_SAFE_INTEGER) - (b.price || Number.MAX_SAFE_INTEGER);
  });
}

export function bestOfferForLang(offers, product, lang = 'en') {
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  const countries = PRICE_COUNTRIES_BY_LANG[code] || PRICE_COUNTRIES_BY_LANG.en;
  const live = (offers || []).filter(o => o.url && isLiveOffer(o));
  const exact = sortOffersForLang(live.filter(o => isFreshPricedOffer(o)), countries)[0];
  if (exact) return { ...exact, hasExactPrice: true };

  const linkOnly = sortOffersForLang(live, countries)[0];
  if (linkOnly) {
    return { ...linkOnly, price: 0, priceUnknown: true, hasExactPrice: false };
  }

  // Rollup fallback is kept link-only on purpose. It has no per-offer freshness
  // metadata in older indexed documents, so showing its numeric price would be
  // less trustworthy than sending the user to check the current store page.
  const rollup = offerForLang(product, lang);
  if (rollup?.url) {
    return {
      ...rollup,
      id: '',
      productId: product?.id || '',
      price: 0,
      priceUnknown: true,
      hasExactPrice: false,
      source: 'product-rollup',
    };
  }
  return null;
}

export function formatOfferPrice(offer, lang = 'en') {
  if (!offer || !offer.hasExactPrice || !Number(offer.price)) return '';
  try {
    return new Intl.NumberFormat(lang, {
      style: 'currency',
      currency: offer.currency || 'USD',
      maximumFractionDigits: 0,
    }).format(offer.price);
  } catch {
    return `${offer.currency || 'USD'} ${Number(offer.price || 0).toLocaleString(lang, { maximumFractionDigits: 0 })}`;
  }
}

export function offerClickPath(offer, visitorCountry = '') {
  if (offer?.id) {
    const qs = new URLSearchParams({ offer: offer.id });
    if (offer.productId) qs.set('product', offer.productId);
    return `/go?${qs.toString()}`;
  }
  // Id-less rollup fallback renders a raw href — legacy affiliateLinks can
  // carry a stale/wrong-program Amazon tag (qorai-20 on .de/.co.uk), so re-tag
  // for the storefront the URL already points at before it hits the DOM.
  return amazonTagUrl(offer?.url || '', visitorCountry);
}
