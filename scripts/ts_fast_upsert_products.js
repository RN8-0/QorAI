'use strict';

const fs = require('fs');
const path = require('path');
const { lowestPriceUsd } = require('./fx_rates');

const COL = 'products';
const PB_PAGE_SIZE = Number(process.env.TS_FAST_PAGE_SIZE || 500);
const CONCURRENCY = Number(process.env.TS_FAST_CONCURRENCY || 6);
const START_PAGE = Math.max(1, Number(process.env.TS_FAST_START_PAGE || 1));
const REQUEST_TIMEOUT_MS = Number(process.env.TS_FAST_TIMEOUT_MS || 90000);

const envFile = fs.readFileSync(path.join(__dirname, '..', 'migration', '.env'), 'utf8');
const env = Object.fromEntries(
  envFile
    .split(/\r?\n/)
    .filter(line => line && line.includes('=') && !line.trim().startsWith('#'))
    .map(line => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

let pbToken = null;

const PRODUCT_SCHEMA = {
  name: COL,
  fields: [
    { name: 'id', type: 'string' },
    { name: 'slug', type: 'string' },
    { name: 'name', type: 'string', infix: true },
    { name: 'nameSort', type: 'string', sort: true, optional: true },
    { name: 'brand', type: 'string', facet: true, optional: true },
    { name: 'category', type: 'string', facet: true },
    { name: 'subcategory', type: 'string', facet: true, optional: true },
    { name: 'source', type: 'string', optional: true },
    { name: 'imageUrl', type: 'string', optional: true, index: false },
    { name: 'techScore', type: 'float' },
    { name: 'trendScore', type: 'float', optional: true },
    { name: 'scrapedAtTs', type: 'int64', optional: true },
    { name: 'updatedAtTs', type: 'int64', optional: true },
    { name: 'price_segment', type: 'string', facet: true, optional: true },
    { name: 'lowestPriceUSD', type: 'float', optional: true },
    { name: 'specsCount', type: 'int32', optional: true },
    { name: 'keySpecsText', type: 'string', optional: true },
    { name: 'tags', type: 'string[]', optional: true, facet: true },
    { name: 'filterTokens', type: 'string[]', optional: true, facet: true },
    { name: 'screenSizeValue', type: 'float', optional: true },
    { name: 'batteryCapacityValue', type: 'int32', optional: true },
    { name: 'weightValueKg', type: 'float', optional: true },
    { name: '_raw', type: 'string', index: false, optional: true },
  ],
  default_sorting_field: 'techScore',
  token_separators: ['-', '_', '/', ' '],
};

async function fetchWithTimeout(url, options = {}, label = url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`${label} timed out after ${REQUEST_TIMEOUT_MS}ms`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function pbAuth() {
  const res = await fetchWithTimeout(
    `${env.POCKETBASE_URL}/api/collections/_superusers/auth-with-password`,
    {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }),
    },
    'PB auth',
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`PB auth ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  pbToken = body.token;
}

async function pbGet(pathname, label) {
  if (!pbToken) await pbAuth();
  let res = await fetchWithTimeout(
    `${env.POCKETBASE_URL}${pathname}`,
    { headers: { Accept: 'application/json', Authorization: pbToken } },
    label,
  );
  if (res.status === 401) {
    pbToken = null;
    await pbAuth();
    res = await fetchWithTimeout(
      `${env.POCKETBASE_URL}${pathname}`,
      { headers: { Accept: 'application/json', Authorization: pbToken } },
      label,
    );
  }
  const body = await res.json().catch(async () => ({ raw: await res.text().catch(() => '') }));
  if (!res.ok) throw new Error(`${label}: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

async function tsPost(pathname, body, contentType, label) {
  const res = await fetchWithTimeout(
    `${env.TYPESENSE_URL}${pathname}`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': contentType,
        'X-TYPESENSE-API-KEY': env.TYPESENSE_API_KEY,
      },
      body,
    },
    label,
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`${label}: ${res.status} ${text.slice(0, 300)}`);
  return text;
}

async function tsJson(method, pathname, body, label) {
  const res = await fetchWithTimeout(
    `${env.TYPESENSE_URL}${pathname}`,
    {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-TYPESENSE-API-KEY': env.TYPESENSE_API_KEY,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    label,
  );
  const text = await res.text();
  let data = text;
  try { data = JSON.parse(text); } catch {}
  return { status: res.status, body: data };
}

async function ensureCollection() {
  const existing = await withRetry(`TS collection ${COL}`, async () => {
    const response = await tsJson('GET', `/collections/${COL}`, null, `TS collection ${COL}`);
    if (response.status >= 500) {
      throw new Error(`TS collection ${COL}: ${response.status} ${JSON.stringify(response.body).slice(0, 200)}`);
    }
    return response;
  }, 12);
  if (existing.status === 200) {
    console.log(`[fast-ts] collection '${COL}' exists · docs=${existing.body?.num_documents ?? '-'}`);
    return;
  }
  if (existing.status !== 404) {
    throw new Error(`TS collection check: ${existing.status} ${JSON.stringify(existing.body).slice(0, 300)}`);
  }
  const created = await withRetry('TS create products collection', async () => {
    const response = await tsJson('POST', '/collections', PRODUCT_SCHEMA, 'TS create products collection');
    if (response.status >= 500) {
      throw new Error(`TS create products collection: ${response.status} ${JSON.stringify(response.body).slice(0, 200)}`);
    }
    return response;
  }, 12);
  if (created.status !== 201) {
    throw new Error(`TS collection create: ${created.status} ${JSON.stringify(created.body).slice(0, 300)}`);
  }
  console.log(`[fast-ts] collection '${COL}' created`);
}

function flattenKeySpecs(ks) {
  if (!ks) return '';
  if (Array.isArray(ks)) return ks.map(x => typeof x === 'object' ? Object.values(x).join(' ') : String(x)).join(' ');
  if (typeof ks === 'object') return Object.values(ks).join(' ');
  return String(ks);
}

function tsDate(value) {
  const t = value ? new Date(value).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

function normalizeSocketToken(value) {
  let socket = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/SOCKET/g, '')
    .replace(/FCLGA/g, 'LGA')
    .replace(/[^A-Z0-9]/g, '');
  if (/^STR\d+$/.test(socket)) socket = socket.slice(1);
  return socket;
}

function socketAliases(socket) {
  const normalized = normalizeSocketToken(socket);
  if (!normalized) return [];
  const aliases = new Set([normalized]);
  if (normalized === 'TRX50' || normalized === 'WRX90') aliases.add('TR5');
  if (normalized === 'TRX40' || normalized === 'WRX80') aliases.add('TR4');
  return Array.from(aliases);
}

function extractSocketTokens(pb) {
  const texts = [pb?.name || ''];
  const pushMapValues = (value) => {
    if (!value || typeof value !== 'object') return;
    Object.values(value).forEach(v => {
      if (v && typeof v === 'object' && !Array.isArray(v)) pushMapValues(v);
      else if (v !== null && v !== undefined) texts.push(String(v));
    });
  };
  pushMapValues(pb?.specs || {});
  pushMapValues(pb?.keySpecs || {});
  pushMapValues(pb?.specSections || {});

  const tokens = new Set();
  texts.forEach(text => {
    const matches = String(text || '').toUpperCase().match(/(?:FC)?LGA\s*\d{3,4}|AM[345]|TRX\d+|STR\d+|TR\d+|WRX\d+|STRP\d+/g) || [];
    matches.flatMap(socketAliases).forEach(token => tokens.add(`socket:${token.toLowerCase()}`));
  });
  return Array.from(tokens);
}

function toDoc(pb) {
  return {
    id: pb.id,
    slug: pb.slug || '',
    name: pb.name || '',
    nameSort: String(pb.name || '').toLowerCase(),
    brand: pb.brand || '',
    category: pb.category || '',
    subcategory: pb.subcategory || '',
    source: pb.source || '',
    imageUrl: pb.imageUrl || pb.imageURL || '',
    techScore: typeof pb.techScore === 'number' ? pb.techScore : 0,
    trendScore: typeof pb.trendScore === 'number' ? pb.trendScore : 0,
    scrapedAtTs: tsDate(pb.scrapedAt || pb.created || pb.updated),
    updatedAtTs: tsDate(pb.updated || pb.scrapedAt || pb.created),
    price_segment: pb.price_segment || '',
    lowestPriceUSD: lowestPriceUsd(pb.prices),
    specsCount: pb.specsCount || 0,
    keySpecsText: flattenKeySpecs(pb.keySpecs),
    tags: Array.isArray(pb.tags) ? pb.tags : [],
    filterTokens: extractSocketTokens(pb),
  };
}

async function pbPage(page) {
  return withRetry(`PB page ${page}`, async () => {
    return pbGet(`/api/collections/products/records?perPage=${PB_PAGE_SIZE}&page=${page}&sort=id`, `PB page ${page}`);
  });
}

async function importDocs(items) {
  if (!items.length) return { ok: 0, fail: 0 };
  return withRetry(`TS import ${items[0]?.id || ''}`, async () => {
    const jsonl = items.map(p => JSON.stringify(toDoc(p))).join('\n');
    const body = await tsPost(`/collections/${COL}/documents/import?action=upsert`, jsonl, 'text/plain', `TS import ${items[0]?.id || ''}`);
    let ok = 0, fail = 0;
    for (const line of String(body || '').split('\n').filter(Boolean)) {
      try { JSON.parse(line).success ? ok++ : fail++; } catch { fail++; }
    }
    return { ok, fail };
  });
}

async function withRetry(label, fn, attempts = 6) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      const delay = Math.min(30000, 1000 * 2 ** (i - 1));
      console.warn(`[fast-ts] retry ${i}/${attempts} ${label}: ${e.message || e}`);
      if (i < attempts) await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw last;
}

async function main() {
  await ensureCollection();
  const first = await pbPage(1);
  const totalPages = first.totalPages || 1;
  const totalItems = first.totalItems || 0;
  console.log(`[fast-ts] PB ${totalItems} products, ${totalPages} pages, pageSize=${PB_PAGE_SIZE}, startPage=${START_PAGE}, concurrency=${CONCURRENCY}, timeout=${REQUEST_TIMEOUT_MS}ms`);
  let nextPage = START_PAGE;
  let donePages = 0;
  let okTotal = 0;
  let failTotal = 0;
  const started = Date.now();

  async function worker(id) {
    while (nextPage <= totalPages) {
      const page = nextPage++;
      const body = page === 1 ? first : await pbPage(page);
      const r = await importDocs(body.items || []);
      okTotal += r.ok;
      failTotal += r.fail;
      donePages++;
      if (donePages % 1 === 0 || donePages === totalPages) {
        const rate = Math.round(okTotal / ((Date.now() - started) / 1000 || 1));
        console.log(`[fast-ts] page ${page}/${totalPages} · done=${donePages} · ok=${okTotal} fail=${failTotal} · ${rate}/s`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, (_, i) => worker(i + 1)));
  console.log(`[fast-ts] DONE ok=${okTotal} fail=${failTotal} seconds=${((Date.now() - started) / 1000).toFixed(1)}`);
}

main().catch(e => {
  console.error('[fast-ts] FAIL', e);
  process.exit(1);
});
