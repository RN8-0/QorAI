/**
 * Qor AI — Icecat Open Catalog Ingestor v1.0
 *
 * Phase 1 — Index:   Stream files.index.xml from data.icecat.biz,
 *                    filter to target categories, write queue to icecat_queue.jsonl.
 * Phase 2+3 — Enrich+Import: For each queued product, fetch full JSON from
 *                    live.icecat.biz then upsert to PocketBase (Typesense auto-syncs).
 *
 * USAGE
 *   node scripts/icecat_ingest.js                   Full run (Phase 1 + 2+3)
 *   node scripts/icecat_ingest.js --resume          Skip Phase 1, continue Phase 2+3
 *   node scripts/icecat_ingest.js --phase=2         Same as --resume
 *   node scripts/icecat_ingest.js --limit=500       Stop after N products (good for testing)
 *   node scripts/icecat_ingest.js --langs=EN        EN only (faster, recommended first run)
 *   node scripts/icecat_ingest.js --langs=EN,TR     EN + Turkish (doubles API calls)
 *   node scripts/icecat_ingest.js --workers=6       Concurrent workers (default 3)
 *   node scripts/icecat_ingest.js --delay=800       ms between each worker's requests
 *
 * ENV  (migration/.env)
 *   ICECAT_USERNAME  — your Icecat username (e.g. arain-0)
 *   ICECAT_PASSWORD  — your Icecat password  (for data.icecat.biz Phase 1 auth)
 *   POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD  (already set)
 */
'use strict';

const path     = require('path');
const fs       = require('fs');
const https    = require('https');
const zlib     = require('zlib');
const readline = require('readline');
const { req: pbReq } = require('../migration/pb');

// ─── Config ───────────────────────────────────────────────────────────────────

const ROOT          = path.resolve(__dirname, '..');
const QUEUE_FILE    = path.join(__dirname, 'icecat_queue.jsonl');
const PROGRESS_FILE = path.join(__dirname, 'icecat_progress.json');

const envRaw = fs.readFileSync(path.join(ROOT, 'migration', '.env'), 'utf8');
const ENV    = Object.fromEntries(
  envRaw.split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const ICECAT_USER = ENV.ICECAT_USERNAME || '';
const ICECAT_PASS = ENV.ICECAT_PASSWORD || '';

// CLI flags
const argv    = process.argv.slice(2);
const hasFlag = name => argv.includes(`--${name}`);
const getOpt  = (name, def) => {
  const v = argv.find(a => a.startsWith(`--${name}=`));
  return v ? v.slice(name.length + 3) : def;
};

const SKIP_PHASE1 = hasFlag('resume') || getOpt('phase', '1') === '2';
const LIMIT       = parseInt(getOpt('limit',   '0'));
const DELAY       = parseInt(getOpt('delay',   '800'));
const WORKERS     = parseInt(getOpt('workers', '3'));
const LANGS       = getOpt('langs', 'EN,TR').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

// ─── Icecat category → internal slug ─────────────────────────────────────────
// Icecat cat_ids verified against category pages on icecat.biz

const CAT_MAP = {
  // Laptops
  380: 'laptops',   4: 'laptops',
  // Smartphones / Phones
  5017: 'smartphones',  1619: 'smartphones',
  // Tablets
  127: 'tablets',
  // Desktops
  4050: 'desktops',  3761: 'desktops',
  // CPUs
  193: 'cpus',
  // GPUs
  814: 'gpus',   15: 'gpus',
  // Motherboards
  100: 'motherboards',
  // RAM
  2103: 'ram',
  // SSDs
  3038: 'ssds',
  // HDDs
  285: 'hdds',  200: 'hdds',
  // PSUs
  474: 'psus',
  // PC Cases
  344: 'cases',
  // Coolers
  2005: 'coolers',  3769: 'coolers',
  // Monitors
  1: 'monitors',
  // Keyboards
  130: 'keyboards',
  // Mice
  156: 'mice',
  // Headsets
  3699: 'headsets',
  // Webcams
  3580: 'webcams',
  // Speakers
  1244: 'speakers',  1243: 'speakers',
  // TVs
  396: 'tvs',  2101: 'tvs',
  // Networking
  260: 'routers',  131: 'networking',  139: 'networking',
  // Controllers / Accessories
  3861: 'controllers',
  // Smartwatches
  2642: 'smartwatches',
  // Printers
  760: 'printers',
};

const TARGET_CATS = new Set(Object.keys(CAT_MAP).map(Number));

// ─── Key specs per category (displayed in compare + AI prompts) ───────────────

const KEY_SPEC_NAMES = {
  laptops:      ['Processor Model','Memory (RAM)','Hard Disk (SSD) Size','Display diagonal','Display resolution','Operating System','Battery Life'],
  smartphones:  ['Processor Model','Memory (RAM)','Internal Storage','Display diagonal','Display resolution','Main Camera','Battery Capacity (Typical)','Network'],
  tablets:      ['Processor Model','Memory (RAM)','Internal Storage','Display diagonal','Display resolution','Operating System','Battery Capacity (Typical)'],
  desktops:     ['Processor Model','Memory (RAM)','Hard Disk (SSD) Size','Graphics Card','Operating System'],
  cpus:         ['Processor Cores','Processor Threads','Processor Base Frequency','Maximum Turbo Frequency','Processor Socket','TDP'],
  gpus:         ['Memory Size','Memory type','Core Clock Speed','Memory Interface Width','TDP'],
  motherboards: ['Chipset','Socket','Form Factor','Memory Slots','Supported Memory Types'],
  ram:          ['Memory Size','Memory Speed','CAS Latency','Memory type'],
  ssds:         ['Capacity','Sequential Read Speed','Sequential Write Speed','Interface','Form Factor'],
  hdds:         ['Capacity','HDD Speed','Interface','Cache','Form Factor'],
  monitors:     ['Display diagonal','Display resolution','Panel type','Screen Refresh Rate','Response time','HDR'],
  psus:         ['Maximum Output Power','Efficiency','Modularity','Form Factor'],
  cases:        ['Form Factor','Colour','Side Panel','Dimensions (WxDxH)'],
  coolers:      ['Cooling type','Fan Size','Max Noise Level','TDP'],
  keyboards:    ['Keyboard type','Device connectivity','Switch type','Backlight'],
  mice:         ['Maximum Resolution','Device connectivity','Number of buttons','Polling Rate'],
  headsets:     ['Connectivity technology','Frequency Range','Active Noise Cancellation','Playback time'],
  speakers:     ['RMS power output','Number of channels','Connectivity Technology'],
  tvs:          ['Display diagonal','Display resolution','Panel type','Smart TV OS','HDR','Screen Refresh Rate'],
};

// ─── Utilities ────────────────────────────────────────────────────────────────

const sleep   = ms => new Promise(r => setTimeout(r, ms));
const slugify = s  => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);

function log(msg, tag = 'info') {
  const prefix = { info: '   ', ok: ' ✓ ', warn: ' ! ', err: ' ✗ ' }[tag] || '   ';
  console.log(`[icecat]${prefix}${msg}`);
}

function loadProgress() {
  try { return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')); } catch { return { done: 0, created: 0, updated: 0, errors: 0 }; }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2), 'utf8'); }

// ─── Phase 1: Download & filter catalog index ─────────────────────────────────

async function phase1_index() {
  if (!ICECAT_USER || !ICECAT_PASS) {
    throw new Error('ICECAT_USERNAME and ICECAT_PASSWORD must be set in migration/.env');
  }

  log(`Phase 1 — Downloading catalog index from data.icecat.biz...`);
  log(`Target categories: ${TARGET_CATS.size} cat_ids`);

  const auth    = Buffer.from(`${ICECAT_USER}:${ICECAT_PASS}`).toString('base64');
  const indexUrl = 'https://data.icecat.biz/export/freexml.int/EN/files.index.xml';

  let count = 0;
  const outStream = fs.createWriteStream(QUEUE_FILE);

  await new Promise((resolve, reject) => {
    https.get(indexUrl, {
      headers: {
        Authorization:    `Basic ${auth}`,
        'Accept-Encoding': 'gzip, deflate',
        'User-Agent':      'QorAI-Ingestor/1.0',
      },
    }, res => {
      if (res.statusCode === 401) return reject(new Error('Auth failed — check ICECAT_USERNAME + ICECAT_PASSWORD'));
      if (res.statusCode === 403) return reject(new Error('Access denied — make sure your Icecat account has bulk export enabled'));
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} from data.icecat.biz`));

      // Decompress if gzipped
      let stream = res;
      if ((res.headers['content-encoding'] || '').includes('gzip')) {
        stream = res.pipe(zlib.createGunzip());
      }

      // State machine: buffer lines, extract product attributes with regex
      let buf = '';
      let cur = {};

      function emit() {
        if (!cur.id) { cur = {}; return; }
        const catId = parseInt(cur.catId || '0');
        if (TARGET_CATS.has(catId)) {
          const record = { id: cur.id, catId, brand: cur.brand || '', name: cur.name || '', ean: cur.ean || '' };
          outStream.write(JSON.stringify(record) + '\n');
          count++;
          if (count % 10000 === 0) log(`  Indexed ${count.toLocaleString()} products...`);
        }
        cur = {};
      }

      stream.on('data', chunk => {
        buf += chunk.toString('utf8');
        const lines = buf.split('\n');
        buf = lines.pop(); // keep incomplete trailing line

        for (const ln of lines) {
          // New <file> element — reset state
          if (ln.includes('<file '))      cur = {};

          // Prod_id (may appear as Prod_id or prod_id)
          if (!cur.id) {
            const m = ln.match(/[Pp]rod_id="(\d+)"/);
            if (m) cur.id = m[1];
          }

          // cat_id
          if (!cur.catId) {
            const m = ln.match(/cat_id="(\d+)"/i);
            if (m) cur.catId = m[1];
          }

          // Brand / Vendor
          if (!cur.brand) {
            const m = ln.match(/Vendor="([^"]+)"/);
            if (m) cur.brand = m[1];
          }

          // EAN (first occurrence)
          if (!cur.ean) {
            const m = ln.match(/EAN="([^"]+)"/);
            if (m) cur.ean = m[1];
          }

          // Product name in English (langid="1")
          if (!cur.name) {
            const m = ln.match(/langid="1"\s+Value="([^"]+)"/);
            if (!m) {
              // alternate order: Value="..." langid="1"
              const m2 = ln.match(/Value="([^"]+)"\s+langid="1"/);
              if (m2) cur.name = m2[1];
            } else {
              cur.name = m[1];
            }
          }

          // End of file element — emit if valid
          if (ln.includes('</file>')) emit();
        }
      });

      stream.on('end', () => {
        // Flush remaining buffer
        if (buf) {
          const lines = buf.split('\n');
          for (const ln of lines) {
            if (ln.includes('</file>')) emit();
          }
        }
        outStream.end();
        resolve();
      });

      stream.on('error', reject);
    }).on('error', reject);
  });

  log(`Phase 1 done — ${count.toLocaleString()} products queued → ${path.basename(QUEUE_FILE)}`, 'ok');
  return count;
}

// ─── Icecat Live API ──────────────────────────────────────────────────────────

async function fetchIcecatJson(icecatId, lang, retries = 3) {
  const url = `https://live.icecat.biz/api/?UserName=${encodeURIComponent(ICECAT_USER)}&Language=${lang}&icecat_id=${icecatId}`;

  for (let attempt = 0; attempt < retries; attempt++) {
    const result = await new Promise((resolve, reject) => {
      https.get(url, { headers: { Accept: 'application/json', 'User-Agent': 'QorAI/1.0' } }, res => {
        if (res.statusCode === 429) {
          resolve({ _rateLimited: true });
          return;
        }
        let raw = '';
        res.on('data', c => raw += c);
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); }
          catch { resolve({ code: -1, msg: 'json_parse_error' }); }
        });
      }).on('error', reject);
    });

    if (result._rateLimited) {
      log(`  Rate limited — waiting 60s before retry (id=${icecatId})`, 'warn');
      await sleep(60000);
      continue;
    }
    if (result.code === 0 || result.code === -1) {
      throw new Error(result.msg || 'product_not_found');
    }
    return result;
  }
  throw new Error('max_retries_exceeded');
}

// ─── Map Icecat JSON → PocketBase fields ─────────────────────────────────────

function mapToPb(json, lang) {
  const d  = json.data  || {};
  const gi = d.GeneralInfo || {};
  const bi = gi.BrandInfo  || {};
  const gc = gi.Category   || d.Category || {};

  const icecatId = gi.IcecatId     || d.ProductID     || 0;
  const brand    = bi.BrandName    || d.Supplier       || d.Brand        || '';
  const mpn      = gi.BrandPartCode || d.ProductCode   || '';
  const gtin     = (gi.GTIN && Array.isArray(gi.GTIN) && gi.GTIN[0]) || '';
  const name     = gi.Title        || d.Name           || '';
  const catId    = parseInt(gc.CategoryID || 0);
  const category = CAT_MAP[catId]  || 'other';

  // Images — try both d.Gallery and gi.Gallery
  const gallery = (Array.isArray(d.Gallery) ? d.Gallery : []).concat(Array.isArray(gi.Gallery) ? gi.Gallery : []);
  const images  = gallery
    .map(img => img.Pic || img.HighPic || img.Pic500x500 || '')
    .filter(Boolean)
    .filter((u, i, a) => a.indexOf(u) === i) // dedupe
    .slice(0, 10);
  const imageUrl = images[0] || '';

  // Feature groups → specs + specSections
  const specs        = {};
  const specSections = [];

  for (const fg of (d.FeaturesGroups || [])) {
    const fgg  = fg.FeatureGroup || {};
    const gn   = typeof fgg.Name === 'object' ? (fgg.Name._ || '') : (fgg.Name || 'General');
    const sec  = { section: gn, specs: [] };

    for (const f of (fg.Features || [])) {
      const feat = f.Feature || {};
      const k    = typeof feat.Name === 'object' ? (feat.Name._ || '') : (feat.Name || '');
      const v    = f.Presentation_Value || f.Value || '';
      if (k && v) {
        specs[k] = v;
        sec.specs.push({ key: k, val: v });
      }
    }
    if (sec.specs.length) specSections.push(sec);
  }

  const specsCount = Object.keys(specs).length;
  const slug       = `icecat-${icecatId}`;
  const sourceUrl  = `https://icecat.biz/p/${slugify(brand)}/${slugify(mpn).slice(0, 50)}-${icecatId}.html`;

  return {
    slug, name, brand, category, source: 'icecat', sourceUrl,
    imageUrl, images, specs, specSections,
    specsEn:      lang === 'EN' ? specs : undefined,
    specsCount,
    variantGroup: `${slugify(brand)}-${slugify(mpn).slice(0, 40)}`,
    scrapedAt:    new Date().toISOString(),
    gtin, mpn, icecatId,
  };
}

// Extract the most important specs for quick comparison
function buildKeySpecs(category, specs) {
  const keys   = KEY_SPEC_NAMES[category] || Object.keys(specs).slice(0, 8);
  const result = {};
  for (const k of keys) {
    const direct = specs[k];
    if (direct) { result[k] = direct; continue; }
    // Partial match fallback
    const entry = Object.entries(specs).find(([sk]) =>
      sk.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(sk.toLowerCase())
    );
    if (entry) result[k] = entry[1];
  }
  return result;
}

// ─── PocketBase upsert ────────────────────────────────────────────────────────

async function upsertToPb(data) {
  // Remove undefined/null/empty-string values that PB would reject
  const payload = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );

  // Look up existing record by slug
  const filter   = `slug="${payload.slug}"`;
  const checkRes = await pbReq('GET', `/api/collections/products/records?filter=${encodeURIComponent(filter)}&perPage=1&skipTotal=1`);
  const existing = checkRes.status === 200 && checkRes.body.items && checkRes.body.items[0];

  if (existing) {
    const r = await pbReq('PATCH', `/api/collections/products/records/${existing.id}`, payload);
    if (r.status !== 200) throw new Error(`PATCH ${existing.id}: ${JSON.stringify(r.body).slice(0, 300)}`);
    return 'updated';
  }

  const r = await pbReq('POST', '/api/collections/products/records', payload);
  if (![200, 201].includes(r.status)) throw new Error(`POST: ${JSON.stringify(r.body).slice(0, 300)}`);
  return 'created';
}

// ─── Phase 2+3: Enrich + Import ───────────────────────────────────────────────

async function phase23_enrichImport() {
  if (!fs.existsSync(QUEUE_FILE)) {
    throw new Error(`Queue file not found at ${QUEUE_FILE} — run Phase 1 first (omit --resume)`);
  }
  if (!ICECAT_USER) {
    throw new Error('ICECAT_USERNAME not set in migration/.env');
  }

  // Load queue into array (readline async iteration)
  log('Phase 2+3 — Loading product queue...');
  const queue = [];
  const rl = readline.createInterface({ input: fs.createReadStream(QUEUE_FILE), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) {
      try { queue.push(JSON.parse(line)); } catch { /* skip malformed */ }
    }
  }

  const prog  = loadProgress();
  const start = prog.done;
  const end   = LIMIT > 0 ? Math.min(start + LIMIT, queue.length) : queue.length;

  log(`Queue: ${queue.length.toLocaleString()} products | Processing: ${start.toLocaleString()} → ${end.toLocaleString()}`);
  log(`Workers: ${WORKERS} | Delay: ${DELAY}ms | Languages: ${LANGS.join(', ')}`);

  if (start >= queue.length) {
    log('Nothing to process — queue is fully done. Delete icecat_progress.json to restart.', 'warn');
    return;
  }

  // Shared index (JS is single-threaded so no race condition)
  let idx = start;

  async function runWorker(workerId) {
    while (idx < end) {
      const item = queue[idx++];
      const { id: icecatId, catId, brand, name } = item;

      try {
        // Primary language (always EN)
        const enJson = await fetchIcecatJson(icecatId, 'EN');
        const pbData = mapToPb(enJson, 'EN');
        pbData.keySpecs = buildKeySpecs(pbData.category, pbData.specs);

        // Additional languages (e.g. TR)
        const extraLangs = LANGS.filter(l => l !== 'EN');
        if (extraLangs.length) {
          const multiSpecs    = { en: pbData.specs };
          const multiSections = { en: pbData.specSections };
          const nameTrans     = { en: pbData.name };

          for (const lang of extraLangs) {
            await sleep(Math.floor(DELAY * 0.6)); // shorter inter-lang delay
            try {
              const xJson = await fetchIcecatJson(icecatId, lang);
              const xData = mapToPb(xJson, lang);
              multiSpecs[lang.toLowerCase()]    = xData.specs;
              multiSections[lang.toLowerCase()] = xData.specSections;
              nameTrans[lang.toLowerCase()]     = xData.name;
            } catch {
              // Non-fatal: EN used as fallback for missing locales
            }
          }

          pbData.multiLangSpecs    = multiSpecs;
          pbData.multiLangSections = multiSections;
          pbData.nameTranslated    = nameTrans;
        } else {
          // EN-only: still populate multilang fields so the modal doesn't show "(fallback)"
          pbData.multiLangSpecs    = { en: pbData.specs };
          pbData.multiLangSections = { en: pbData.specSections };
          pbData.nameTranslated    = { en: pbData.name };
        }

        const action = await upsertToPb(pbData);
        if (action === 'created') prog.created++;
        else prog.updated++;

      } catch (e) {
        log(`  Skip id=${icecatId} (${name || brand}): ${e.message}`, 'warn');
        prog.errors++;
      }

      prog.done++;

      // Checkpoint every 100 products
      if (prog.done % 100 === 0) {
        saveProgress(prog);
        const pct = ((prog.done - start) / (end - start) * 100).toFixed(1);
        log(`[w${workerId}] ${prog.done}/${end} (${pct}%) — +${prog.created} new, ~${prog.updated} upd, ${prog.errors} err`);
      }

      await sleep(DELAY);
    }
  }

  // Launch workers concurrently
  await Promise.all(Array.from({ length: WORKERS }, (_, i) => runWorker(i + 1)));

  saveProgress(prog);
  log(`Phase 2+3 done — created: ${prog.created}, updated: ${prog.updated}, errors: ${prog.errors}`, 'ok');
  log(`Progress saved to ${path.basename(PROGRESS_FILE)} — run with --resume to continue later`, 'ok');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║   Qor AI — Icecat Open Catalog Ingestor     ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log('');
  log(`User: ${ICECAT_USER || '(NOT SET)'} | Langs: ${LANGS.join(',')} | Workers: ${WORKERS} | Delay: ${DELAY}ms`);
  log(`Mode: ${SKIP_PHASE1 ? 'Resume (Phase 2+3 only)' : 'Full run (Phase 1 + 2+3)'}`);
  if (LIMIT) log(`Limit: ${LIMIT} products`);
  console.log('');

  if (!ICECAT_USER) throw new Error('ICECAT_USERNAME not set in migration/.env — add it and retry');

  if (!SKIP_PHASE1) {
    await phase1_index();
  } else {
    log('Skipping Phase 1 (--resume or --phase=2)');
  }

  await phase23_enrichImport();
}

main().catch(e => {
  log(e.message, 'err');
  console.error(e.stack);
  process.exit(1);
});
