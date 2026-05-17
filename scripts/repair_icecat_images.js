'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { req: pbReq } = require('../migration/pb');
const { collectIcecatImages, isBadIcecatImage } = require('./lib/icecat_images');

const ROOT = path.resolve(__dirname, '..');
const envRaw = fs.readFileSync(path.join(ROOT, 'migration', '.env'), 'utf8');
const ENV = Object.fromEntries(
  envRaw.split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const ICECAT_USER = ENV.ICECAT_USERNAME || '';
const argv = process.argv.slice(2);
const hasFlag = name => argv.includes(`--${name}`);
const getOpt = (name, def = '') => {
  const v = argv.find(a => a.startsWith(`--${name}=`));
  return v ? v.slice(name.length + 3) : def;
};

const ALL = hasFlag('all');
const MISSING = hasFlag('missing');
const DRY = hasFlag('dry');
const LIMIT = parseInt(getOpt('limit', '0'), 10);
const NAME = getOpt('name', '').toLowerCase();
const DELAY = parseInt(getOpt('delay', '120'), 10);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function log(msg) {
  console.log(`[icecat-images] ${msg}`);
}

function localImageIsBad(url) {
  return isBadIcecatImage({ Pic500x500: url }, url);
}

async function listProducts() {
  const byId = new Map();
  for (let page = 1; ; page++) {
    const filter = encodeURIComponent('source="icecat"');
    const fields = 'id,name,brand,category,imageUrl,images,icecatId,updated';
    const r = await pbReq('GET', `/api/collections/products/records?page=${page}&perPage=500&filter=${filter}&fields=${fields}`);
    if (r.status !== 200) throw new Error(`PocketBase list failed: ${r.status} ${JSON.stringify(r.body)}`);
    for (const item of (r.body.items || [])) byId.set(item.id, item);
    if (page >= Number(r.body.totalPages || 1)) break;
  }
  return [...byId.values()];
}

async function fetchIcecatJson(icecatId) {
  const url = `https://live.icecat.biz/api/?UserName=${encodeURIComponent(ICECAT_USER)}&Language=EN&icecat_id=${icecatId}`;
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Accept: 'application/json', 'User-Agent': 'QorAI/1.0' } }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (!json.data) reject(new Error(json.Message || json.msg || `Icecat ${res.statusCode}`));
          else resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function needsRepair(product) {
  if (!product.icecatId) return false;
  if (NAME && !String(product.name || '').toLowerCase().includes(NAME)) return false;
  if (ALL || NAME) return true;

  const urls = []
    .concat(product.imageUrl || [])
    .concat(Array.isArray(product.images) ? product.images : [])
    .filter(Boolean);
  if (MISSING && urls.length === 0) return true;
  return urls.some(localImageIsBad);
}

async function main() {
  if (!ICECAT_USER) throw new Error('ICECAT_USERNAME must be set in migration/.env');
  const products = await listProducts();
  let candidates = products.filter(needsRepair);
  if (LIMIT > 0) candidates = candidates.slice(0, LIMIT);

  log(`${products.length} Icecat products scanned, ${candidates.length} image records queued${DRY ? ' (dry)' : ''}.`);

  let patched = 0;
  let cleared = 0;
  let unchanged = 0;
  let errors = 0;

  for (const p of candidates) {
    try {
      const json = await fetchIcecatJson(p.icecatId);
      const d = json.data || {};
      const gi = d.GeneralInfo || {};
      const fresh = collectIcecatImages(d, gi, 8);
      const samePrimary = String(p.imageUrl || '') === fresh.imageUrl;
      const sameImages = JSON.stringify(Array.isArray(p.images) ? p.images : []) === JSON.stringify(fresh.images);
      if (samePrimary && sameImages) {
        unchanged++;
      } else {
        if (!DRY) {
          await pbReq('PATCH', `/api/collections/products/records/${p.id}`, {
            imageUrl: fresh.imageUrl,
            images: fresh.images,
            updatedAt: new Date().toISOString(),
          });
        }
        if (fresh.imageUrl) patched++;
        else cleared++;
        log(`${fresh.imageUrl ? 'fixed' : 'cleared'} ${p.icecatId} ${p.name}`);
      }
    } catch (e) {
      errors++;
      log(`error ${p.icecatId} ${p.name}: ${e.message}`);
    }
    if (DELAY > 0) await sleep(DELAY);
  }

  log(`done: ${patched} fixed, ${cleared} cleared, ${unchanged} unchanged, ${errors} errors.`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
