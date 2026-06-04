/**
 * Qor AI — Admitad offer connector (deeplink/search-link mode)
 *
 * Admitad can cover TR/DE/GB merchants once each merchant campaign is approved.
 * This connector does not invent prices. It builds merchant search URLs and
 * asks Admitad's deeplink endpoint to wrap them, so the site can show tracked
 * outbound links until product feeds are imported for live prices.
 *
 * Credentials (migration/.env):
 *   ADMITAD_CLIENT_ID
 *   ADMITAD_CLIENT_SECRET
 *   ADMITAD_WEBSITE_ID
 *   ADMITAD_MARKETS=TR,DE,GB
 *   ADMITAD_CAMPAIGNS=KEY|Store|Country|Currency|CampaignID|Search URL;...
 *
 * Example:
 *   TRENDYOL_TR|Trendyol|TR|TRY|12345|https://www.trendyol.com/sr?q={q}
 */
'use strict';

const fs = require('fs');
const path = require('path');

function loadEnv() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', '..', 'migration', '.env'), 'utf8');
    return Object.fromEntries(raw.split(/\r?\n/)
      .filter(l => l && !l.startsWith('#') && l.includes('='))
      .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  } catch { return {}; }
}

const ENV = loadEnv();
const CLIENT_ID = ENV.ADMITAD_CLIENT_ID || '';
const CLIENT_SECRET = ENV.ADMITAD_CLIENT_SECRET || '';
const WEBSITE_ID = ENV.ADMITAD_WEBSITE_ID || '';
const ACTIVE_MARKETS = new Set((ENV.ADMITAD_MARKETS || 'TR,DE,GB').split(',').map(s => s.trim().toUpperCase()).filter(Boolean));

let token = null;
let tokenExpiresAt = 0;

const enc = s => encodeURIComponent(String(s || ''));

function parseCampaigns() {
  const raw = String(ENV.ADMITAD_CAMPAIGNS || '').trim();
  if (!raw) return [];
  const lines = raw.split(/[;\r\n]+/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const line of lines) {
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 6) continue;
    const [key, store, country, currency, campaignId, searchTemplate] = parts;
    const c = String(country || '').toUpperCase();
    if (!ACTIVE_MARKETS.has(c)) continue;
    if (!campaignId || !searchTemplate || !searchTemplate.includes('{q}')) continue;
    out.push({ key, store, country: c, currency: currency || 'USD', campaignId, searchTemplate });
  }
  return out;
}

function activeCampaigns() {
  if (!CLIENT_ID || !CLIENT_SECRET || !WEBSITE_ID) return [];
  return parseCampaigns();
}

const isConfigured = () => activeCampaigns().length > 0;

async function getToken() {
  if (token && Date.now() < tokenExpiresAt - 60_000) return token;
  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://api.admitad.com/token/', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: 'deeplink_generator',
    }).toString(),
  });
  if (!res.ok) throw new Error(`Admitad token ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  token = body.access_token;
  tokenExpiresAt = Date.now() + (Number(body.expires_in) || 3600) * 1000;
  return token;
}

function buildKeywordQuery(product) {
  let name = String(product.name || '').replace(/\s+/g, ' ').trim();
  const cut = name.search(/\s(?:\d+(?:[.,]\d+)?\s*(?:cm|mm|inch|gb|tb|ghz|mhz|mah|wh|w)\b|\(\d|dual\s*sim|single\s*sim|android|windows|macos|chrome\s*os|wi-?fi|bluetooth|\d(?:g|G)\b|touchscreen)/i);
  if (cut > 10) name = name.slice(0, cut).trim();
  const brand = String(product.brand || '').trim();
  const brandFirst = brand.split(/\s+/)[0] || '';
  if (brandFirst && !name.toLowerCase().startsWith(brandFirst.toLowerCase())) {
    name = `${brand} ${name}`.trim();
  }
  return name.replace(/\s+/g, ' ').trim().slice(0, 120);
}

async function deeplink(campaignId, url, subid) {
  const access = await getToken();
  const params = new URLSearchParams({ ulp: url, subid });
  const res = await fetch(`https://api.admitad.com/deeplink/${enc(WEBSITE_ID)}/advcampaign/${enc(campaignId)}/?${params}`, {
    headers: { Authorization: `Bearer ${access}` },
  });
  if (!res.ok) throw new Error(`Admitad deeplink ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  if (Array.isArray(body) && body[0]?.link) return body[0].link;
  if (body?.link) return body.link;
  return url;
}

async function searchOffers(product) {
  const campaigns = activeCampaigns();
  if (!campaigns.length) return [];
  const kw = buildKeywordQuery(product);
  if (!kw) return [];

  const out = [];
  for (const c of campaigns) {
    const url = c.searchTemplate.replace('{q}', enc(kw));
    const subid = `qorai-${(product.id || '').slice(0, 12)}`;
    const affiliateUrl = await deeplink(c.campaignId, url, subid);
    out.push({
      gtin: String(product.gtin || ''),
      mpn: product.mpn || '',
      brand: product.brand || '',
      store: c.store,
      network: 'admitad',
      country: c.country,
      price: 0,
      priceUnknown: true,
      currency: c.currency,
      url,
      affiliateUrl,
      condition: 'new',
      inStock: true,
      source: 'admitad-deeplink',
      matchConfidence: 0.55,
    });
  }
  return out;
}

async function getRateLimit() { return null; }

module.exports = {
  id: 'admitad',
  searchOffers,
  isConfigured,
  getRateLimit,
  CALLS_PER_PRODUCT: 0,
  activeCampaigns,
};
