'use strict';

const { req: pbReq } = require('../migration/pb');
const { req: tsReq } = require('../migration/ts');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const fallbackModelFamily = require('./lib/model_family').modelFamilyKey;

const args = new Set(process.argv.slice(2));
const dryRun = !args.has('--yes');
const categoryArg = [...args].find(a => a.startsWith('--cat='))?.slice('--cat='.length) || 'smartphones';

function loadAdminModelFamilyKey() {
  try {
    const file = path.join(__dirname, '..', 'admin', 'js', 'scraper.js');
    const src = fs.readFileSync(file, 'utf8');
    const start = src.indexOf('function normalizeProductDedupText');
    const end = src.indexOf('function productDedupKey', start);
    if (start < 0 || end < 0) throw new Error('modelFamilyKey block not found');
    const ctx = {
      exports: {},
      COUNTRY_CODE_TOKENS: ['TR','TU','US','UK','EU','DE','FR','IT','ES','PT','NL','PL','NO','DK','FI','JP','CN','KR','IN','AE','SA','AU','NZ','CA','MX','BR'],
    };
    vm.createContext(ctx);
    vm.runInContext(`${src.slice(start, end)}\nexports.modelFamilyKey = modelFamilyKey;`, ctx);
    if (typeof ctx.exports.modelFamilyKey !== 'function') throw new Error('modelFamilyKey not exported');
    return ctx.exports.modelFamilyKey;
  } catch (e) {
    console.warn(`[warn] admin modelFamilyKey load failed, using fallback: ${e.message}`);
    return fallbackModelFamily;
  }
}

const modelFamilyKey = loadAdminModelFamilyKey();

function isEpey(record = {}) {
  return /epey/i.test(String(record.source || record.sourceUrl || ''));
}

function isGeizhals(record = {}) {
  return /geizhals/i.test(String(record.source || record.sourceUrl || ''));
}

function identityKey(record = {}) {
  const key = modelFamilyKey({
    name: record.name || '',
    brand: record.brand || '',
    category: record.category || categoryArg,
  });
  return String(key || record.variantGroup || '').trim();
}

function chooseGeizhalsKeeper(records) {
  return [...records].sort((a, b) => {
    const aFamily = /-v\d+\.html(?:$|\?)/i.test(String(a.sourceUrl || '')) ? 1 : 0;
    const bFamily = /-v\d+\.html(?:$|\?)/i.test(String(b.sourceUrl || '')) ? 1 : 0;
    if (aFamily !== bFamily) return bFamily - aFamily;
    const aSpecs = Number(a.specsCount || 0);
    const bSpecs = Number(b.specsCount || 0);
    if (aSpecs !== bSpecs) return bSpecs - aSpecs;
    return String(a.created || '').localeCompare(String(b.created || ''));
  })[0];
}

async function getAllProducts(category) {
  const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const filter = [
    `category = "${esc(category)}"`,
    '(source = "epey.com" || source = "epey" || source = "geizhals.eu" || source = "geizhals" || sourceUrl ~ "epey.com" || sourceUrl ~ "geizhals.eu")',
  ].join(' && ');
  const fields = 'id,name,brand,category,source,sourceUrl,variantGroup,specsCount,techScore,created';
  const out = [];
  for (let page = 1; ; page++) {
    const url = `/api/collections/products/records?page=${page}&perPage=500&sort=id&fields=${encodeURIComponent(fields)}&filter=${encodeURIComponent(filter)}`;
    const r = await pbReq('GET', url);
    if (r.status !== 200) throw new Error(`PocketBase list failed ${r.status}: ${JSON.stringify(r.body).slice(0, 500)}`);
    out.push(...(r.body.items || []));
    if (page >= (r.body.totalPages || page)) break;
  }
  return out;
}

async function patchVariantGroup(record, key) {
  if (!record.id || !key || record.variantGroup === key) return;
  console.log(`${dryRun ? '[dry]' : '[fix]'} variantGroup ${record.id}: ${record.variantGroup || '-'} -> ${key} (${record.name})`);
  if (!dryRun) {
    const r = await pbReq('PATCH', `/api/collections/products/records/${record.id}`, { variantGroup: key });
    if (r.status < 200 || r.status >= 300) {
      throw new Error(`PB patch failed ${record.id}: ${r.status} ${JSON.stringify(r.body).slice(0, 500)}`);
    }
  }
}

async function deleteProduct(record, reason) {
  console.log(`${dryRun ? '[dry]' : '[del]'} ${record.id} ${record.source || ''} ${record.variantGroup || ''} :: ${record.name} (${reason})`);
  if (dryRun) return;
  const pb = await pbReq('DELETE', `/api/collections/products/records/${record.id}`);
  if (pb.status !== 204 && pb.status !== 404) {
    throw new Error(`PB delete failed ${record.id}: ${pb.status} ${JSON.stringify(pb.body).slice(0, 500)}`);
  }
  const ts = await tsReq('DELETE', `/collections/products/documents/${encodeURIComponent(record.id)}`);
  if (![200, 202, 204, 404].includes(ts.status)) {
    throw new Error(`Typesense delete failed ${record.id}: ${ts.status} ${JSON.stringify(ts.body).slice(0, 500)}`);
  }
}

async function main() {
  const products = await getAllProducts(categoryArg);
  const groups = new Map();
  for (const p of products) {
    const key = identityKey(p);
    if (!key || key.length < 5) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  let deleteCount = 0;
  let patchCount = 0;
  for (const [key, records] of groups) {
    const epeys = records.filter(isEpey);
    const geizhals = records.filter(isGeizhals);
    if (epeys.length && geizhals.length) {
      for (const e of epeys) {
        if (e.variantGroup !== key) patchCount++;
        await patchVariantGroup(e, key);
      }
      for (const g of geizhals) {
        deleteCount++;
        await deleteProduct(g, `Epey baseline exists: ${epeys[0].id}`);
      }
      continue;
    }
    if (geizhals.length > 1) {
      const keep = chooseGeizhalsKeeper(geizhals);
      if (keep && keep.variantGroup !== key) {
        patchCount++;
        await patchVariantGroup(keep, key);
      }
      for (const g of geizhals) {
        if (g.id === keep?.id) continue;
        deleteCount++;
        await deleteProduct(g, `duplicate Geizhals model, keeping ${keep?.id || 'one record'}`);
      }
    }
  }

  console.log(`${dryRun ? 'Dry run' : 'Done'}: ${products.length} scraped ${categoryArg} records checked, ${deleteCount} deletes${dryRun ? ' planned' : ''}, ${patchCount} variantGroup fixes${dryRun ? ' planned' : ''}.`);
  if (dryRun) console.log('Run with --yes to apply.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
