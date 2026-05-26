#!/usr/bin/env node
/**
 * Backfill original Turkish Epey specs into source* fields.
 *
 * This keeps specs/specSections/keySpecs as the canonical English payload
 * used by search/scoring, while the admin modal can show real Turkish source
 * text when "Türkçe (source)" is selected.
 *
 * Usage:
 *   node scripts/repair_epey_source_tr_fields.js --dry --limit=20
 *   node scripts/repair_epey_source_tr_fields.js --apply --category=laptops
 *   node scripts/repair_epey_source_tr_fields.js --apply --force
 */
'use strict';

const cheerio = require('cheerio');
const { req: pbReq } = require('../migration/pb');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const FORCE = argv.includes('--force');
const CATEGORY = (argv.find(a => a.startsWith('--category=')) || '').split('=')[1] || '';
const LIMIT = Number((argv.find(a => a.startsWith('--limit=')) || '').split('=')[1] || 0);
const CONCURRENCY = Math.max(1, Number((argv.find(a => a.startsWith('--concurrency=')) || '').split('=')[1] || 4));
const PROXY = (argv.find(a => a.startsWith('--proxy=')) || '').split('=')[1] || 'http://localhost:3456';

const enc = encodeURIComponent;

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function cleanValueText(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function hasUsefulObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0;
}

function normalizeEpeyProductUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(raw, 'https://www.epey.com');
    u.hash = '';
    return u.href.replace(/\/+$/, '');
  } catch {
    return raw;
  }
}

function valueFromCell($, cell) {
  if (!cell || !cell.length) return '';
  const values = [];
  cell.find('a, span, div').each((_, el) => {
    const $el = $(el);
    if ($el.find('a, span, div').length) return;
    const t = cleanText($el.text());
    if (t && !values.includes(t)) values.push(t);
  });
  const own = cleanText(cell.contents().filter((_, node) => node.type === 'text').text());
  if (own && !values.includes(own)) values.unshift(own);
  if (values.length) return values.join('\n');
  return cleanValueText(cell.text());
}

function parseSpecs(html) {
  const $ = cheerio.load(html);
  const specs = {};
  const specSections = {};
  const keySpecs = {};

  const addSpec = (section, key, value) => {
    const k = cleanText(key).replace(/:$/, '');
    const v = cleanValueText(value);
    if (!k || !v || k.length > 180 || v.length > 1200) return;
    const sec = cleanText(section) || 'Genel';
    if (!specSections[sec]) specSections[sec] = {};
    specs[k] = v;
    specSections[sec][k] = v;
  };

  const parseList = (root, section) => {
    root.find('li').each((_, li) => {
      const $li = $(li);
      const strong = $li.find('strong, b, .baslik, .cell:first-child').first();
      if (!strong.length) return;
      let value = valueFromCell($, $li.find('span.cell, .cell:not(:first-child)').first());
      if (!value) {
        const clone = $li.clone();
        clone.find('strong, b, .baslik, .cell:first-child, script, style').remove();
        value = cleanValueText(clone.text());
      }
      addSpec(section, strong.text(), value);
    });
  };

  const ozellikler = $('#ozellikler, .ozellikler').first();
  if (ozellikler.length) {
    ozellikler.find('.masonry-brick, .ozellik-grup, .detay, section, .liste').each((_, block) => {
      const $block = $(block);
      const h = $block.find('h2, h3, h4, .baslik').first();
      const section = cleanText(h.find('span').first().text() || h.text() || 'Genel') || 'Genel';
      parseList($block, section);
      $block.find('tr').each((_, row) => {
        const cells = $(row).find('th,td');
        if (cells.length >= 2) addSpec(section, $(cells[0]).text(), valueFromCell($, $(cells[1])));
      });
    });

    if (Object.keys(specs).length === 0) {
      let section = 'Genel';
      ozellikler.find('h2,h3,h4,li,tr').each((_, el) => {
        const tag = String(el.tagName || '').toUpperCase();
        const $el = $(el);
        if (/^H[234]$/.test(tag)) {
          section = cleanText($el.text()) || section;
          return;
        }
        if (tag === 'LI') parseList($el.parent(), section);
        if (tag === 'TR') {
          const cells = $el.find('th,td');
          if (cells.length >= 2) addSpec(section, $(cells[0]).text(), valueFromCell($, $(cells[1])));
        }
      });
    }
  }

  if (Object.keys(specs).length === 0) {
    $('table tr').each((_, row) => {
      const cells = $(row).find('th,td');
      if (cells.length >= 2) addSpec('Genel', $(cells[0]).text(), valueFromCell($, $(cells[1])));
    });
  }

  $('.cell, .ozet .row, .row1, .row2').each((_, el) => {
    const $el = $(el);
    const key = cleanText($el.find('.row1, strong, b').first().text());
    const value = cleanText($el.find('.row2, span:last-child').first().text());
    if (key && value && !specs[key]) {
      keySpecs[key] = value;
      addSpec('Öne Çıkanlar', key, value);
    }
  });

  const h1 = cleanText($('h1 > a').first().text() || $('h1').first().text());
  return { name: h1, specs, specSections, keySpecs };
}

async function proxyHealthy() {
  try {
    const res = await fetch(`${PROXY.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function fetchHtml(url, useProxy) {
  const normalized = normalizeEpeyProductUrl(url);
  if (!normalized) throw new Error('missing sourceUrl');
  if (useProxy) {
    const res = await fetch(`${PROXY.replace(/\/$/, '')}/?url=${enc(normalized)}`, { signal: AbortSignal.timeout(45000) });
    const text = await res.text();
    if (!res.ok) throw new Error(`proxy ${res.status}: ${text.slice(0, 120)}`);
    return text;
  }
  const res = await fetch(normalized, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
      'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.7',
    },
    signal: AbortSignal.timeout(25000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`fetch ${res.status}: ${text.slice(0, 120)}`);
  return text;
}

function buildPatch(product, parsed) {
  const sourceSpecs = parsed.specs || {};
  const sourceSpecSections = parsed.specSections || {};
  const sourceKeySpecs = parsed.keySpecs || {};
  const sourceName = parsed.name || product.name || '';
  const patch = {
    sourceLang: 'tr',
    sourceSpecs,
    sourceSpecSections,
    sourceKeySpecs,
    multiLangSpecs: { ...(product.multiLangSpecs || {}), tr: sourceSpecs },
    multiLangSections: { ...(product.multiLangSections || {}), tr: sourceSpecSections },
    nameTranslated: { ...(product.nameTranslated || {}), tr: sourceName },
  };
  return patch;
}

function jsonEq(a, b) {
  return JSON.stringify(a || {}) === JSON.stringify(b || {});
}

function patchChanged(product, patch) {
  return product.sourceLang !== patch.sourceLang ||
    !jsonEq(product.sourceSpecs, patch.sourceSpecs) ||
    !jsonEq(product.sourceSpecSections, patch.sourceSpecSections) ||
    !jsonEq(product.sourceKeySpecs, patch.sourceKeySpecs) ||
    !jsonEq(product.multiLangSpecs, patch.multiLangSpecs) ||
    !jsonEq(product.multiLangSections, patch.multiLangSections) ||
    !jsonEq(product.nameTranslated, patch.nameTranslated);
}

async function fetchProducts() {
  const fields = [
    'id', 'name', 'category', 'source', 'sourceUrl',
    'sourceLang', 'sourceSpecs', 'sourceSpecSections', 'sourceKeySpecs',
    'multiLangSpecs', 'multiLangSections', 'nameTranslated',
  ].join(',');
  const out = [];
  let lastId = '';
  let page = 1;
  for (;;) {
    const filters = ['(source = "epey.com" || sourceUrl ~ "epey.com")'];
    if (CATEGORY) filters.push(`category = "${CATEGORY.replace(/"/g, '\\"')}"`);
    if (!FORCE) filters.push('(sourceLang = "" || sourceLang = null || sourceSpecSections = null)');
    if (lastId) filters.push(`id > "${lastId.replace(/"/g, '\\"')}"`);
    const url = `/api/collections/products/records?perPage=300&page=1&sort=id&skipTotal=1&fields=${enc(fields)}&filter=${enc(filters.join(' && '))}`;
    const r = await pbReq('GET', url);
    if (r.status !== 200) throw new Error(`fetch page ${page}: ${r.status} ${JSON.stringify(r.body).slice(0, 220)}`);
    const items = r.body.items || [];
    out.push(...items);
    if (items.length) lastId = items[items.length - 1].id;
    console.log(`[load] page ${page}: ${items.length} · total ${out.length}`);
    if ((LIMIT && out.length >= LIMIT) || items.length < 300) break;
    page++;
  }
  return LIMIT ? out.slice(0, LIMIT) : out;
}

async function mapLimit(items, limit, worker) {
  let index = 0;
  const results = [];
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = index++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  console.log(`[source-tr] mode=${APPLY ? 'APPLY' : 'DRY'} category=${CATEGORY || 'all'} limit=${LIMIT || 'none'} concurrency=${CONCURRENCY}`);
  const useProxy = await proxyHealthy();
  console.log(`[source-tr] fetch=${useProxy ? PROXY : 'direct HTTPS'}`);
  const products = await fetchProducts();
  console.log(`[source-tr] loaded ${products.length} Epey products needing source fields`);

  let patched = 0;
  let unchanged = 0;
  let failed = 0;

  await mapLimit(products, CONCURRENCY, async (product, i) => {
    try {
      if (!FORCE && hasUsefulObject(product.sourceSpecSections)) {
        unchanged++;
        return;
      }
      const html = await fetchHtml(product.sourceUrl, useProxy);
      const parsed = parseSpecs(html);
      if (!hasUsefulObject(parsed.specs)) throw new Error('no specs parsed');
      const patch = buildPatch(product, parsed);
      if (!patchChanged(product, patch)) {
        unchanged++;
        return;
      }
      patched++;
      if (patched <= 10 || patched % 100 === 0) {
        console.log(`[source-tr] ${APPLY ? 'patch' : 'would patch'} ${patched}/${products.length}: ${product.id} ${String(product.name || '').slice(0, 80)} (${Object.keys(parsed.specs).length} specs)`);
      }
      if (APPLY) {
        const r = await pbReq('PATCH', `/api/collections/products/records/${product.id}`, patch);
        if (r.status < 200 || r.status >= 300) {
          throw new Error(`PB patch ${r.status}: ${JSON.stringify(r.body).slice(0, 180)}`);
        }
      }
    } catch (err) {
      failed++;
      console.warn(`[source-tr] failed ${i + 1}/${products.length} ${product.id}: ${err.message}`);
    }
  });

  console.log(`[source-tr] done patched=${patched} unchanged=${unchanged} failed=${failed}${APPLY ? '' : ' (dry run)'}`);
  if (!APPLY) console.log('[source-tr] Re-run with --apply to write PocketBase.');
  if (failed && APPLY) process.exitCode = 2;
}

main().catch(err => {
  console.error('[source-tr] fatal:', err);
  process.exit(1);
});
