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
 *   node scripts/icecat_ingest.js --fast            EN-only bulk mode (workers=8, delay=150 by default)
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
const { configKey } = require('./lib/config_key');
const { collectIcecatImages } = require('./lib/icecat_images');

// ─── Config ───────────────────────────────────────────────────────────────────

const ROOT          = path.resolve(__dirname, '..');
const QUEUE_FILE    = path.join(__dirname, 'icecat_queue.jsonl');
const QUEUE_META_FILE = path.join(__dirname, 'icecat_queue_meta.json');
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
const FAST_MODE   = hasFlag('fast');
const LIMIT       = parseInt(getOpt('limit',   '0'));
const MAX_TOTAL_PRODUCTS = parseInt(getOpt('maxTotalProducts', '300000'), 10);
const DELAY       = parseInt(getOpt('delay',   FAST_MODE ? '150' : '800'));
const WORKERS     = parseInt(getOpt('workers', FAST_MODE ? '8' : '3'));
// Phase 1 cap: at most N index entries per model name. Icecat lists thousands
// of cosmetic SKUs per model; ~400 random samples still cover every real
// CPU/RAM/storage configuration. Set --maxPerModel=0 to disable the cap.
const MAX_PER_MODEL = parseInt(getOpt('maxPerModel', '400'));
// 12 languages matching the Flutter app's l10n files
const LANGS_DEFAULT = FAST_MODE ? 'EN' : 'EN,TR,DE,FR,ES,IT,JA,NL,PL,PT,SV,AR';
const LANGS         = getOpt('langs', LANGS_DEFAULT).split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
let shutdownRequested = false;
process.on('SIGTERM', () => {
  shutdownRequested = true;
  log('Stop requested — finishing in-flight workers and saving progress...', 'warn');
});
process.on('SIGINT', () => {
  shutdownRequested = true;
  log('Stop requested — finishing in-flight workers and saving progress...', 'warn');
});

// Optional category filter — e.g. --cats=monitors,ram.
// Default is intentionally narrow: Versus-like catalog surfaces should ingest
// comparable product families first, not every Icecat accessory/appliance row.
// Use --cats=all for the full CAT_MAP.
const CATS_FILTER = getOpt('cats', '');
function normalizeCatFilterSlug(input) {
  const s = String(input || '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const aliases = {
    laptop: 'laptops',
    notebook: 'laptops',
    notebooks: 'laptops',
    notebooks_laptops: 'laptops',
    all_in_one_pcs: 'desktops',
    cpu: 'cpus',
    processor: 'cpus',
    processors: 'cpus',
    ssds: 'ssd',
    internal_ssds: 'ssd',
    hdd: 'hard_drives',
    hdds: 'hard_drives',
    external_hdds: 'external_hdd',
    psus: 'psu',
    power_supplies: 'psu',
    cases: 'pc_cases',
    computer_cases: 'pc_cases',
    coolers: 'cpu_coolers',
    computer_cooling_systems: 'cpu_coolers',
    nas: 'nas_servers',
    network_cards: 'pcie_nic',
    mobile_phones: 'smartphones',
    cameras: 'digital_cameras',
    camcorders: 'video_cameras',
    portable_speakers: 'speakers',
    multifunction_printers: 'printers',
    laser_printers: 'printers',
    label_printers: 'printers',
    xbox_one: 'gaming_consoles',
    xbox_series: 'gaming_consoles',
    ps5_consoles: 'gaming_consoles',
    switch2_consoles: 'gaming_consoles',
    ps5_games: 'games',
    switch2_games: 'games',
    xbox_accessories: 'gaming_accessories',
    ps5_accessories: 'gaming_accessories',
    switch2_accessories: 'gaming_accessories',
    pdu: 'ups',
    power_adapters: 'powerbanks',
    video_cameras: 'digital_cameras',
    signage_displays: 'tvs',
    flash_drives: 'external_hdd',
    memory_cards: 'external_hdd',
    optical_drives: 'hard_drives',
  };
  return aliases[s] || s;
}
const DEFAULT_CAT_SLUGS = new Set([
  'laptops', 'desktops',
  'smartphones', 'tablets',
  'monitors', 'tvs',
  'cpus', 'ram', 'ssd', 'hard_drives', 'external_hdd',
]);
const BLOCKED_ICECAT_SLUGS = new Set([
  'vacuums',
  'small_appliances',
  'coffee_makers',
  'dishwashers',
  'microwaves',
  'tumble_dryers',
  'washing_machines',
  'hobs',
  'fridge_freezers',
  'ovens',
  'smart_home',
  'led_bulbs',
]);
const ALL_CAT_SLUGS = new Set([
  'laptops', 'desktops', 'servers', 'thin_clients', 'laptop_docks', 'handheld_computers',
  'cpus', 'ram', 'motherboards', 'pc_cases', 'psu', 'cpu_coolers',
  'hard_drives', 'external_hdd', 'ssd', 'nas_servers', 'flash_drives', 'memory_cards', 'optical_drives',
  'monitors', 'tvs', 'signage_displays', 'projectors', 'monitor_accessories', 'tv_mounts',
  'smartphones', 'tablets', 'digital_cameras', 'video_cameras', 'security_cameras',
  'keyboards', 'mice', 'printers', 'network_switches', 'routers', 'pcie_nic',
  'ups', 'pdu', 'power_adapters', 'speakers', 'games',
].map(canonicalCategory).filter(slug => slug && !BLOCKED_ICECAT_SLUGS.has(slug)));
const CAT_WHITELIST = CATS_FILTER && CATS_FILTER.trim().toLowerCase() !== 'all'
  ? new Set(CATS_FILTER.split(',').map(canonicalCategory).filter(slug => slug && !BLOCKED_ICECAT_SLUGS.has(slug)))
  : CATS_FILTER.trim().toLowerCase() === 'all'
    ? ALL_CAT_SLUGS
    : DEFAULT_CAT_SLUGS;

// Optional brand filter — e.g. --brand=apple. Only products whose Icecat
// brand matches are saved; everything else is skipped in Phase 2.
const BRAND_FILTER = String(getOpt('brand', '')).trim().toLowerCase();

const REFURBISHED_RE = /\b(?:refurbished|renewed|renew|renewd|refurbed|refurb|reconditioned|remanufactured|yenilenmi[sş]|yenilenmis|ikinci\s*el|used|pre[-\s]?owned|asgoodasnew|back\s*market|forza\s*refurbished|forza|greenpanda|teqcycle|upcycle\s*it|circular\s*computing|circular)\b/i;
// Non-catalog rows: spare parts, services, warranties, bundles, demo units,
// promo/marketing SKUs and pure accessories that pollute consumer categories.
const BAD_PRODUCT_RE = /\b(?:spare\s*part|replacement\s*part|service\s*part|repair\s*part|warranty|garantie|license|licence|lisans|subscription|abonnement|accessory\s*kit|mounting\s*kit|carry\s*case|carrying\s*case|sleeve|backpack|gift\s*card|voucher|coupon|demo\s*unit|dummy|display\s*model|sample\s*unit|engraving|installation\s*service|setup\s*service|onsite\s*service|extended\s*warranty|care\s*pack|carepack|protection\s*plan|trade[-\s]?in|co[-\s]?term|staging\s*service|bundle\s*offer|promotional|marketing\s*sample|not\s*for\s*resale|nfr\b)\b/i;

function catsKey() {
  if (!CAT_WHITELIST) return 'all';
  return [...CAT_WHITELIST].sort().join(',');
}

function readQueueMeta() {
  try { return JSON.parse(fs.readFileSync(QUEUE_META_FILE, 'utf8')); }
  catch { return null; }
}

function writeQueueMeta(count) {
  try {
    fs.writeFileSync(QUEUE_META_FILE, JSON.stringify({
      catsKey: catsKey(),
      count,
      maxPerModel: MAX_PER_MODEL,
      createdAt: new Date().toISOString(),
    }, null, 2));
  } catch (e) {
    log(`Queue meta write failed: ${e.message}`, 'warn');
  }
}

async function inspectQueueForSelectedCats() {
  if (!fs.existsSync(QUEUE_FILE)) return { total: 0, allowed: 0 };
  let total = 0;
  let allowed = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(QUEUE_FILE), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    total++;
    try {
      const item = JSON.parse(line);
      if (isAllowedCatId(item.catId) && !isBlockedCatalogText(item.name, item.brand)) allowed++;
    } catch {}
    if (allowed > 0 && total > 1000) break;
  }
  return { total, allowed };
}

async function getCatalogProductCount() {
  const r = await pbReq('GET', '/api/collections/products/records?perPage=1&page=1&skipTotal=false&fields=id');
  if (r.status !== 200) return 0;
  return Number(r.body.totalItems || 0);
}

function isAllowedCatId(catId) {
  const slug = canonicalCategory(CAT_MAP[Number(catId)]);
  return !!(slug && TARGET_CATS.has(Number(catId)) && !BLOCKED_ICECAT_SLUGS.has(slug) && (!CAT_WHITELIST || CAT_WHITELIST.has(slug)));
}

function isBlockedCatalogText(...parts) {
  const text = parts.map(v => String(v || '')).join(' ');
  return REFURBISHED_RE.test(text) || BAD_PRODUCT_RE.test(text);
}

// ─── Icecat category → internal slug ─────────────────────────────────────────
// ✓ = confirmed via live.icecat.biz/api lookups on real products (2026-05)

// Categories observed in the free Icecat Open Catalog. The whitelist is
// applied during Phase 1 to keep the queue focused on consumer electronics.
//
// All CategoryID values below were verified via real Icecat live-API hits
// during a full index scan (2026-05). Source: scripts/icecat_cats_named.json,
// produced by `node scripts/icecat_discover_cats.js` + name resolver. Each
// line shows the free-tier product count we'll see in Phase 1.
const CAT_MAP = {
  // ── Computing ───────────────────────────────────────────────
  151:  'laptops',                  // 877k
  153:  'desktops',                 // 340k  (PCs/Workstations)
  2282: 'desktops',                 // 44k   (All-in-One PCs/Workstations)
  156:  'servers',                  // 24k
  896:  'thin_clients',             //  5k
  152:  'laptop_docks',             //  5k
  154:  'handheld_computers',       //  3k
  // ── Components ──────────────────────────────────────────────
  989:  'cpus',                     // 14k  (Processors)
  911:  'ram',                      // 54k  (Memory Modules)
  164:  'motherboards',             //  9k
  237:  'pc_cases',                 //  4k
  963:  'psu',                      //  4k
  921:  'cpu_coolers',              //  3k  (Computer Cooling Systems)
  // ── Storage ─────────────────────────────────────────────────
  219:  'hard_drives',              // 36k  (Internal HDDs)
  1823: 'external_hdd',             //  4k
  1563: 'ssd',                      // 27k  (Internal SSDs)
  932:  'nas_servers',              // 46k  (NAS & Storage Servers)
  1554: 'flash_drives',             //  6k
  902:  'memory_cards',             //  4k
  214:  'optical_drives',           //  4k
  // ── Display & TV ────────────────────────────────────────────
  222:  'monitors',                 // 42k  (Computer Monitors)
  1584: 'tvs',                      // 42k
  2672: 'signage_displays',         //  6k
  567:  'projectors',               //  8k  (Data Projectors)
  940:  'monitor_accessories',      //  6k
  1056: 'tv_mounts',                //  6k
  // ── Mobile ──────────────────────────────────────────────────
  1893: 'smartphones',              // 29k  (Smartphones)
  119:  'smartphones',              //  4k  (Feature phones)
  897:  'tablets',                  // 27k
  // ── Imaging ─────────────────────────────────────────────────
  575:  'digital_cameras',          // 12k  (Digital Cameras)
  584:  'video_cameras',            //  3k
  1557: 'security_cameras',         //  5k
  // ── Peripherals ─────────────────────────────────────────────
  194:  'keyboards',                // 26k  (Keyboards)
  195:  'mice',                     //  9k
  2813: 'keyboards',                //  5k
  // ── Printing ────────────────────────────────────────────────
  304:  'printers',                 // 11k
  235:  'printers',                 //  4k
  229:  'printers',                 //  5k
  // ── Networking ──────────────────────────────────────────────
  258:  'network_switches',         //  9k
  3982: 'routers',                  //  3k  (Wireless Routers)
  182:  'pcie_nic',                 //  6k
  // ── Power ───────────────────────────────────────────────────
  817:  'ups',                      //  6k  (UPSs)
  984:  'pdu',                      //  4k  (Power Distribution Units)
  827:  'power_adapters',           // 22k
  // ── Audio ───────────────────────────────────────────────────
  2315: 'speakers',                 //  5k
  94:   'games',                    // 26k
  // ── Smart home / appliances (electronics) ───────────────────
  1234: 'vacuums',                  //  5k
  1320: 'coffee_makers',            //  7k
  1324: 'dishwashers',              //  9k
  1325: 'microwaves',               //  4k
  1330: 'tumble_dryers',            //  5k
  1331: 'washing_machines',         // 16k
  1864: 'hobs',                     //  7k
  1873: 'fridge_freezers',          // 14k
  2286: 'ovens',                    //  8k
  1661: 'led_bulbs',                // 11k
};

const TARGET_CATS = new Set(Object.keys(CAT_MAP).map(Number));
const VALID_CAT_SLUGS = new Set(Object.values(CAT_MAP).map(canonicalCategory));
if (CAT_WHITELIST) {
  const unknownCats = [...CAT_WHITELIST].filter(slug => !VALID_CAT_SLUGS.has(slug));
  if (unknownCats.length) {
    throw new Error(`Unknown Icecat category slug(s): ${unknownCats.join(', ')}`);
  }
}

function canonicalCategory(slug) {
  const s = normalizeCatFilterSlug(slug);
  if (['laptop', 'laptops', 'notebook', 'notebooks', 'notebooks_laptops'].includes(s)) return 'laptops';
  const aliases = {
    all_in_one_pcs: 'desktops',
    desktop: 'desktops',
    pc: 'desktops',
    pcs: 'desktops',
    cpu: 'cpus',
    processor: 'cpus',
    processors: 'cpus',
    ssds: 'ssd',
    hdd: 'hard_drives',
    hdds: 'hard_drives',
    external_hdds: 'external_hdd',
    psus: 'psu',
    cases: 'pc_cases',
    coolers: 'cpu_coolers',
    nas: 'nas_servers',
    network_cards: 'pcie_nic',
    mobile_phones: 'smartphones',
    cameras: 'digital_cameras',
    camcorders: 'video_cameras',
    portable_speakers: 'speakers',
    multifunction_printers: 'printers',
    laser_printers: 'printers',
    label_printers: 'printers',
    xbox_one: 'gaming_consoles',
    xbox_series: 'gaming_consoles',
    ps5_consoles: 'gaming_consoles',
    switch2_consoles: 'gaming_consoles',
    ps5_games: 'games',
    switch2_games: 'games',
    xbox_accessories: 'gaming_accessories',
    ps5_accessories: 'gaming_accessories',
    switch2_accessories: 'gaming_accessories',
    pdu: 'ups',
    power_adapters: 'powerbanks',
    signage_displays: 'tvs',
    flash_drives: 'external_hdd',
    memory_cards: 'external_hdd',
    optical_drives: 'hard_drives',
    video_cameras: 'digital_cameras',
    servers: 'desktops',
    thin_clients: 'desktops',
    laptop_docks: 'laptops',
    handheld_computers: 'tablets',
    monitor_accessories: 'monitors',
    tv_mounts: 'tvs',
    coffee_makers: 'small_appliances',
    dishwashers: 'small_appliances',
    microwaves: 'small_appliances',
    tumble_dryers: 'small_appliances',
    washing_machines: 'small_appliances',
    hobs: 'small_appliances',
    fridge_freezers: 'small_appliances',
    ovens: 'small_appliances',
    led_bulbs: 'smart_home',
  };
  return aliases[s] || s;
}

// ─── Key specs per category (displayed in compare + AI prompts) ───────────────

const KEY_SPEC_NAMES = {
  laptops:                ['Processor Model','Memory (RAM)','Hard Disk (SSD) Size','Display diagonal','Display resolution','Operating System','Battery Life'],
  notebooks:              ['Processor Model','Memory (RAM)','Hard Disk (SSD) Size','Display diagonal','Display resolution','Operating System','Battery Life'],
  smartphones:            ['Processor Model','Memory (RAM)','Internal Storage','Display diagonal','Display resolution','Main Camera','Battery Capacity (Typical)','Network'],
  tablets:                ['Processor Model','Memory (RAM)','Internal Storage','Display diagonal','Display resolution','Operating System','Battery Capacity (Typical)'],
  smartwatches:           ['Display diagonal','Display resolution','Battery Life','Water resistance','Operating System','Bluetooth','GPS'],
  desktops:               ['Processor Model','Memory (RAM)','Hard Disk (SSD) Size','Graphics Card','Operating System'],
  cpus:                   ['Processor Cores','Processor Threads','Processor Base Frequency','Maximum Turbo Frequency','Processor Socket','TDP'],
  gpus:                   ['Memory Size','Memory type','Core Clock Speed','Memory Interface Width','TDP'],
  motherboards:           ['Chipset','Socket','Form Factor','Memory Slots','Supported Memory Types'],
  ram:                    ['Memory Size','Memory Speed','CAS Latency','Memory type'],
  ssd:                    ['Capacity','Sequential Read Speed','Sequential Write Speed','Interface','Form Factor'],
  ssds:                   ['Capacity','Sequential Read Speed','Sequential Write Speed','Interface','Form Factor'],
  hard_drives:            ['Capacity','HDD Speed','Interface','Cache','Form Factor'],
  external_hdd:           ['Capacity','HDD Speed','Interface','Cache','Form Factor'],
  hdds:                   ['Capacity','HDD Speed','Interface','Cache','Form Factor'],
  flash_drives:           ['Capacity','Interface','Read speed','Write speed'],
  memory_cards:           ['Capacity','Type','Read speed','Write speed','Speed Class'],
  monitors:               ['Display diagonal','Display resolution','Panel type','Screen Refresh Rate','Response time','HDR'],
  psu:                    ['Maximum Output Power','Efficiency','Modularity','Form Factor'],
  psus:                   ['Maximum Output Power','Efficiency','Modularity','Form Factor'],
  pc_cases:               ['Form Factor','Colour','Side Panel','Dimensions (WxDxH)'],
  cases:                  ['Form Factor','Colour','Side Panel','Dimensions (WxDxH)'],
  cpu_coolers:            ['Cooling type','Fan Size','Max Noise Level','TDP'],
  coolers:                ['Cooling type','Fan Size','Max Noise Level','TDP'],
  keyboards:              ['Keyboard type','Device connectivity','Switch type','Backlight'],
  mice:                   ['Maximum Resolution','Device connectivity','Number of buttons','Polling Rate'],
  headsets:               ['Connectivity technology','Frequency Range','Active Noise Cancellation','Playback time'],
  headphones:             ['Connectivity technology','Frequency Range','Driver size','Active Noise Cancellation','Playback time'],
  speakers:               ['RMS power output','Number of channels','Connectivity Technology'],
  tvs:                    ['Display diagonal','Display resolution','Panel type','Smart TV OS','HDR','Screen Refresh Rate'],
  cameras:                ['Sensor Type','Sensor Size','Megapixels','Optical Zoom','Display diagonal','Video Resolution'],
  lenses:                 ['Focal Length','Maximum Aperture','Lens Mount','Filter Size','Weight'],
  printers:               ['Print Technology','Maximum Print Resolution','Print Speed (black, ISO/IEC 24734)','ADF','Duplex','Connectivity'],
  scanners:               ['Maximum Optical Resolution','Scanner Type','Scan Speed','Connectivity'],
  routers:                ['Wi-Fi Standard','Maximum Data Transfer Rate','LAN Ports','WAN Ports','Antennas'],
  networking:             ['Number of Ports','Switching Capacity','PoE','Form Factor'],
  webcams:                ['Maximum Video Resolution','Frame Rate','Microphone','Field of View'],
  ups:                    ['Output Power','Input Voltage','Battery Type','Outlets'],
  'power-strips':         ['Number of Outlets','Surge Protection','Cable Length','Switch'],
};

// ─── Utilities ────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));
// modelFamilyKey + slugify live in a shared module so the live ingestor and
// the variantGroup backfill stay byte-for-byte identical.
const { modelFamilyKey, slugify } = require('./lib/model_family');

function log(msg, tag = 'info') {
  const prefix = { info: '   ', ok: ' ✓ ', warn: ' ! ', err: ' ✗ ' }[tag] || '   ';
  console.log(`[icecat]${prefix}${msg}`);
}

function loadProgress() {
  try {
    return { skipped: 0, ...JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')) };
  } catch {
    return { done: 0, created: 0, updated: 0, deduped: 0, skipped: 0, errors: 0 };
  }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2), 'utf8'); }

// Durable-resume helper: every Icecat product already in PocketBase, keyed by
// its Icecat ID. This is the single source of truth for "is this done" — it
// survives PC shutdown, proxy restarts, queue rebuilds and category switches,
// so Resume can never lose its place or re-do finished work.
async function loadExistingIcecatIds() {
  const ids = new Set();
  try {
    let page = 1;
    for (;;) {
      const r = await pbReq('GET',
        `/api/collections/products/records?filter=${encodeURIComponent('source="icecat"')}` +
        `&perPage=500&page=${page}&fields=icecatId,slug`);
      if (r.status !== 200) break;
      const items = r.body.items || [];
      for (const it of items) {
        if (it.icecatId) ids.add(String(it.icecatId));
        else {
          const m = String(it.slug || '').match(/^icecat-(\d+)$/);
          if (m) ids.add(m[1]);
        }
      }
      if (!items.length || page >= (r.body.totalPages || 1)) break;
      page++;
    }
  } catch (e) {
    log(`Could not preload existing Icecat products (${e.message}) — running without resume-skip.`, 'warn');
  }
  return ids;
}

// ─── Phase 1: Download & filter catalog index ─────────────────────────────────

async function phase1_index() {
  if (!ICECAT_USER || !ICECAT_PASS) {
    throw new Error('ICECAT_USERNAME and ICECAT_PASSWORD must be set in migration/.env');
  }

  log(`Phase 1 — Downloading catalog index from data.icecat.biz...`);
  log(`Target categories: ${CAT_WHITELIST ? [...CAT_WHITELIST].join(', ') : 'all (' + TARGET_CATS.size + ' cat_ids)'}`);

  const auth    = Buffer.from(`${ICECAT_USER}:${ICECAT_PASS}`).toString('base64');
  const indexUrl = 'https://data.icecat.biz/export/freexml.int/EN/files.index.xml';

  let count = 0;
  let capped = 0;
  const collected = []; // collect all, sort by id desc, then write
  const seenIcecatIds = new Set();
  const modelCounts = new Map(); // `catId:model_family` -> queued count, for the cap

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

      // Icecat index format (verified 2026-05):
      //   <file path="export/freexml/EN/1399.xml" ... Product_ID="1399" Supplier_id="1"
      //         Catid="846" On_Market="1" Model_Name="HP 80 Cyan" ...>
      //     <EAN_UPCS>
      //       <EAN_UPC Value="5705965480557" IsApproved="1" Format="GTIN-13"/>
      //     </EAN_UPCS>
      //   </file>
      // The opening <file> tag is ONE long line; EAN/etc follow on separate child lines.

      let buf = '';
      let cur = {};

      function emit() {
        if (!cur.id || !cur.catId) { cur = {}; return; }
        const catId = parseInt(cur.catId);
        const slug = CAT_MAP[catId];
        if (isAllowedCatId(catId) && !seenIcecatIds.has(cur.id) && !isBlockedCatalogText(cur.name)) {
          // Per-model-family cap — drop cosmetic SKUs beyond the sampling
          // limit before the expensive live API phase. The key strips
          // colour/language/region/RAM/storage/CPU tokens, so repeated
          // Icecat SKUs for one model do not explode the queue.
          const modelKey = `${catId}:${modelFamilyKey({ name: cur.name, brand: '', category: slug })}`;
          const seen = modelCounts.get(modelKey) || 0;
          if (MAX_PER_MODEL > 0 && seen >= MAX_PER_MODEL) {
            capped++;
            cur = {};
            return;
          }
          modelCounts.set(modelKey, seen + 1);
          seenIcecatIds.add(cur.id);
          collected.push({ id: cur.id, catId, name: cur.name || '', ean: cur.ean || '' });
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
          // Opening <file> tag — all key attributes on one line
          if (ln.includes('<file ')) {
            emit(); // flush previous
            cur = {};
            const mId   = ln.match(/Product_ID="(\d+)"/);
            const mCat  = ln.match(/Catid="(\d+)"/);
            const mName = ln.match(/Model_Name="([^"]*)"/);
            if (mId)   cur.id    = mId[1];
            if (mCat)  cur.catId = mCat[1];
            if (mName) cur.name  = mName[1];
          }

          // First approved EAN from child <EAN_UPC> lines
          if (!cur.ean && ln.includes('IsApproved="1"')) {
            const mEan = ln.match(/Value="(\d{8,14})"/);
            if (mEan) cur.ean = mEan[1];
          }

          // End of file element — emit
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
        // Sort newest first (highest ID = most recent product)
        collected.sort((a, b) => parseInt(b.id) - parseInt(a.id));
        const outStream = fs.createWriteStream(QUEUE_FILE);
        for (const rec of collected) outStream.write(JSON.stringify(rec) + '\n');
        outStream.end(() => {
          writeQueueMeta(collected.length);
          resolve();
        });
      });

      stream.on('error', reject);
    }).on('error', reject);
  });

  log(`Phase 1 done — ${count.toLocaleString()} products queued → ${path.basename(QUEUE_FILE)}`, 'ok');
  if (capped) log(`  ${capped.toLocaleString()} cosmetic SKUs skipped by --maxPerModel=${MAX_PER_MODEL}`, 'ok');
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
          catch { resolve({ Code: -1, Message: 'json_parse_error' }); }
        });
      }).on('error', reject);
    });

    if (result._rateLimited) {
      log(`  Rate limited — waiting 60s before retry (id=${icecatId})`, 'warn');
      await sleep(60000);
      continue;
    }
    // Icecat errors: {"Code": 404, "Message": "..."} (capital C)
    // Icecat success: {"code": 1, "data": {...}} (lowercase c)
    if (result.Code !== undefined || !result.data) {
      throw new Error(result.Message || result.msg || 'product_not_found');
    }
    return result;
  }
  throw new Error('max_retries_exceeded');
}

// ─── Map Icecat JSON → PocketBase fields ─────────────────────────────────────

function mapToPb(json, lang, queueItem = {}) {
  const d  = json.data  || {};
  const gi = d.GeneralInfo || {};
  const bi = gi.BrandInfo  || {};
  const gc = gi.Category   || d.Category || {};

  const icecatId = gi.IcecatId     || d.ProductID     || 0;
  const brand    = bi.BrandName    || d.Supplier       || d.Brand        || '';
  const mpn      = gi.BrandPartCode || d.ProductCode   || '';
  const gtin     = (gi.GTIN && Array.isArray(gi.GTIN) && gi.GTIN[0]) || queueItem.ean || '';
  const name     = gi.Title        || d.Name           || '';
  const catId    = parseInt(gc.CategoryID || 0);
  const category = canonicalCategory(CAT_MAP[catId] || 'other');
  if (!isAllowedCatId(catId)) {
    throw new Error(`category_not_selected:${CAT_MAP[catId] || catId}`);
  }
  if (isBlockedCatalogText(name, brand, mpn)) {
    throw new Error('blocked_refurbished_or_non_catalog_product');
  }
  if (BRAND_FILTER && String(brand).trim().toLowerCase() !== BRAND_FILTER) {
    throw new Error(`brand_filtered:${brand || '(none)'}`);
  }

  // Images — Icecat publishes 3 variants per asset:
  //   Pic       → original (often 5000×5000, 5MB)   — too big for the app
  //   Pic500x500→ ~500×500 (~80-120KB)              — sweet spot
  //   LowPic    → 200×200  (~20-30KB)               — thumb only
  // We persist the 500×500 variant so the admin gallery and Flutter detail
  // page load in <300ms per image without filling PocketBase storage. The
  // single hero image (`imageUrl`) also points to the medium variant.
  const { imageUrl, images } = collectIcecatImages(d, gi, 8);
  if (!imageUrl || !images.length) {
    throw new Error('no_valid_product_image');
  }

  // Feature groups → specs + specSections
  const specs        = {};
  const specSections = {};

  // Helper to extract localized name from {Value:"...", Language:"EN"} or string
  const extractName = n => {
    if (!n) return '';
    if (typeof n === 'string') return n;
    if (typeof n === 'object') return n.Value || n._ || '';
    return '';
  };

  for (const fg of (d.FeaturesGroups || [])) {
    const fgg  = fg.FeatureGroup || {};
    const gn   = extractName(fgg.Name) || 'General';
    if (!specSections[gn]) specSections[gn] = {};

    for (const f of (fg.Features || [])) {
      const feat = f.Feature || {};
      const k    = extractName(feat.Name);
      const v    = f.PresentationValue || f.Presentation_Value || f.RawValue || f.Value || '';
      if (k && v) {
        specs[k] = String(v);
        specSections[gn][k] = String(v);
      }
    }
  }

  const specsCount = Object.keys(specs).length;
  const slug       = `icecat-${icecatId}`;
  const sourceUrl  = `https://icecat.biz/p/${slugify(brand)}/${slugify(mpn).slice(0, 50)}-${icecatId}.html`;
  const variantGroup = modelFamilyKey({ name, brand, category });

  return {
    slug, name, brand, category, source: 'icecat', sourceUrl,
    imageUrl, images, specs, specSections,
    specsEn:      lang === 'EN' ? specs : undefined,
    specsCount,
    variantGroup,
    configKey:    configKey({ name, brand, category, variantGroup, specs, specSections }),
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

function minSpecsForCategory(category) {
  if (['laptops', 'smartphones', 'tablets'].includes(category)) return 20;
  if (['tvs', 'monitors', 'desktops', 'digital_cameras'].includes(category)) return 15;
  return 8;
}

function passesIcecatQuality(payload) {
  const count = Number(payload.specsCount || Object.keys(payload.specs || {}).length);
  if (!payload.imageUrl || !Array.isArray(payload.images) || !payload.images.length) return false;
  if (isBlockedCatalogText(payload.name, payload.brand, payload.mpn)) return false;
  return count >= minSpecsForCategory(payload.category);
}

// ─── Category sync ────────────────────────────────────────────────────────────

const CATEGORY_NAMES = {
  laptops: 'Laptops',
  desktops: 'Desktop PCs',
  mini_pcs: 'Mini PCs',
  servers: 'Servers',
  thin_clients: 'Thin Clients',
  laptop_docks: 'Laptop Docks',
  smartphones: 'Smartphones',
  tablets: 'Tablets',
  smartwatches: 'Smartwatches',
  headphones: 'Headphones',
  powerbanks: 'Power Banks',
  webcams: 'Webcams',
  graphics_cards: 'Graphics Cards',
  monitors: 'Monitors',
  tvs: 'TVs',
  signage_displays: 'Signage Displays',
  projectors: 'Projectors',
  ram: 'RAM',
  ssd: 'SSDs',
  hard_drives: 'Hard Drives',
  external_hdd: 'External Hard Drives',
  flash_drives: 'USB Flash Drives',
  memory_cards: 'Memory Cards',
  optical_drives: 'Optical Drives',
  nas_servers: 'NAS / Media Servers',
  cpus: 'Processors',
  psu: 'Power Supplies (PSU)',
  pc_cases: 'PC Cases',
  cpu_coolers: 'CPU Coolers',
  case_fans: 'Case Fans',
  motherboards: 'Motherboards',
  keyboards: 'Keyboards',
  mice: 'Mice',
  digital_cameras: 'Digital Cameras',
  video_cameras: 'Video Cameras',
  security_cameras: 'Security Cameras',
  routers: 'Routers',
  network_switches: 'Network Switches',
  pcie_nic: 'PCIe Network Cards',
  ups: 'UPS',
  pdu: 'PDUs',
  power_adapters: 'Power Adapters',
  printers: 'Printers',
  speakers: 'Speakers',
  soundbars: 'Soundbars',
  modem_routers: 'Modem Routers',
  wifi_routers: 'WiFi Routers',
  wifi_repeaters: 'WiFi Repeaters',
  action_cameras: 'Action Cameras',
  drones: 'Drones',
  gaming_consoles: 'Game Consoles',
  gaming_accessories: 'Gaming Accessories',
  gamepads: 'Gamepads',
  games: 'Games',
  coffee_makers: 'Coffee Makers',
  dishwashers: 'Dishwashers',
  microwaves: 'Microwaves',
  tumble_dryers: 'Tumble Dryers',
  washing_machines: 'Washing Machines',
  hobs: 'Hobs',
  fridge_freezers: 'Fridge-Freezers',
  ovens: 'Ovens',
  led_bulbs: 'LED Bulbs',
  small_appliances: 'Small Appliances',
  smart_home: 'Smart Home',
  vacuums: 'Vacuum Cleaners',
  e_readers: 'E-Readers',
  electric_scooters: 'Electric Scooters',
};
const ensuredCategories = new Set();
const touchedCategories = new Set();
let categorySyncWarned = false;

function titleFromCategory(slug) {
  return CATEGORY_NAMES[slug] || String(slug || 'other')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, s => s.toUpperCase());
}

function iconForCategory(slug) {
  if (/smartphone|phone/.test(slug)) return 'smartphone';
  if (/tablet/.test(slug)) return 'tablet';
  if (/laptop|desktop|pc|server|thin/.test(slug)) return 'computer';
  if (/camera|camcorder/.test(slug)) return 'camera';
  if (/headphone|speaker|audio/.test(slug)) return 'headphones';
  if (/keyboard|mouse/.test(slug)) return 'keyboard';
  if (/ssd|hdd|storage|nas|drive/.test(slug)) return 'hard-drive';
  if (/tv|monitor|display|projector/.test(slug)) return 'monitor';
  if (/router|network|wifi|switch/.test(slug)) return 'wifi';
  if (/cpu|ram|motherboard|graphics|psu|cool/.test(slug)) return 'cpu';
  return 'box';
}

async function upsertCategoryRecord(slug, productCount) {
  const safeSlug = String(slug || '').replace(/"/g, '\\"');
  const name = titleFromCategory(slug);
  const payload = {
    slug,
    name,
    nameEn: name,
    icon: iconForCategory(slug),
    emoji: '',
    order: 1000,
    isActive: true,
    subcategories: [],
  };
  if (Number.isFinite(productCount)) payload.productCount = productCount;

  const check = await pbReq('GET', `/api/collections/categories/records?filter=${encodeURIComponent(`slug="${safeSlug}"`)}&perPage=1&skipTotal=1`);
  if (check.status !== 200) throw new Error(`categories lookup failed: ${JSON.stringify(check.body).slice(0, 200)}`);
  const existing = check.body.items && check.body.items[0];
  let res;
  if (existing) {
    // Don't fight the admin's curated category names/icons. On an existing
    // record only refresh activity + the live product count.
    const patch = { isActive: true };
    if (Number.isFinite(productCount)) patch.productCount = productCount;
    res = await pbReq('PATCH', `/api/collections/categories/records/${existing.id}`, patch);
  } else {
    res = await pbReq('POST', '/api/collections/categories/records', payload);
  }
  if (![200, 201].includes(res.status)) throw new Error(`categories upsert failed: ${JSON.stringify(res.body).slice(0, 200)}`);
}

async function ensureCategoryRecord(slug) {
  const category = canonicalCategory(slug);
  if (!category || ensuredCategories.has(category)) return;
  try {
    await upsertCategoryRecord(category);
    ensuredCategories.add(category);
  } catch (e) {
    if (!categorySyncWarned) {
      categorySyncWarned = true;
      log(`Category sync skipped: ${e.message || e}`, 'warn');
    }
  }
}

async function syncTouchedCategoryCounts() {
  for (const category of touchedCategories) {
    try {
      const safeSlug = String(category).replace(/"/g, '\\"');
      const countRes = await pbReq('GET', `/api/collections/products/records?filter=${encodeURIComponent(`category="${safeSlug}"`)}&perPage=1`);
      if (countRes.status !== 200) continue;
      await upsertCategoryRecord(category, Number(countRes.body.totalItems || 0));
    } catch (e) {
      log(`Category count sync failed for ${category}: ${e.message || e}`, 'warn');
    }
  }
}

// ─── Variant grouping ─────────────────────────────────────────────────────────
// Icecat ships every SKU as its own product. We keep them all, but flag one
// `variantPrimary` per (category + variantGroup) family so the admin can show
// a single card per model. The cache means at most one PB lookup per family
// per run instead of one per product.

const familyHasPrimary = new Map();

function variantFamilyKey(p) {
  const cat = String(p.category || '').trim().toLowerCase();
  const vg  = String(p.variantGroup || '').trim().toLowerCase();
  return vg ? `${cat}|${vg}` : `${cat}|__solo__${p.slug || p.icecatId}`;
}

// Decide whether a newly-created product should be its family's primary.
async function resolveVariantPrimary(payload) {
  const key = variantFamilyKey(payload);
  if (familyHasPrimary.get(key)) return false;
  const vg = String(payload.variantGroup || '').replace(/"/g, '\\"');
  if (vg) {
    const cat = String(payload.category || '').replace(/"/g, '\\"');
    const filter = encodeURIComponent(`variantGroup="${vg}" && category="${cat}" && variantPrimary=true`);
    const r = await pbReq('GET', `/api/collections/products/records?filter=${filter}&perPage=1&skipTotal=1`);
    if (r.status === 200 && r.body.items && r.body.items.length) {
      familyHasPrimary.set(key, true);
      return false;
    }
  }
  familyHasPrimary.set(key, true); // this product becomes the family primary
  return true;
}

// ─── Configuration-level dedup ────────────────────────────────────────────────
// Icecat lists every cosmetic SKU (colour / reseller / keyboard language) as a
// separate product. We store ONE row per real configuration. configOwner maps
// `category|configKey` → the icecatId already kept for it, so a same-config
// product from a different icecatId is recognised as a duplicate and skipped.

const configOwner = new Map();

async function isCosmeticDuplicate(icecatId, category, ck) {
  if (!ck) return false;
  const key = `${category}|${ck}`;
  const owner = configOwner.get(key);
  if (owner !== undefined) return Number(owner) !== Number(icecatId);
  // Claim the config before awaiting PocketBase. Multiple Icecat workers can
  // hit the same SKU family concurrently; without this provisional claim they
  // can all see "no owner yet" and create duplicate variants.
  configOwner.set(key, Number(icecatId) || 0);

  const filter = encodeURIComponent(
    `category="${String(category).replace(/"/g, '\\"')}" && configKey="${String(ck).replace(/"/g, '\\"')}"`
  );
  const r = await pbReq('GET', `/api/collections/products/records?filter=${filter}&perPage=1&skipTotal=1&fields=icecatId`);
  if (r.status === 200 && r.body.items && r.body.items[0]) {
    const ownerId = Number(r.body.items[0].icecatId) || 0;
    configOwner.set(key, ownerId);
    return ownerId !== Number(icecatId);
  }
  return false;
}

function pbFilterValue(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function isEpeyRecord(record = {}) {
  return /epey/i.test(String(record.source || '')) ||
    /(^|\.)epey\.com\//i.test(String(record.sourceUrl || ''));
}

async function findExistingEpeyProduct(payload) {
  const filters = [];
  if (payload.gtin) filters.push(`gtin="${pbFilterValue(payload.gtin)}"`);
  if (payload.mpn && payload.brand) {
    filters.push(`mpn="${pbFilterValue(payload.mpn)}" && brand="${pbFilterValue(payload.brand)}"`);
  }
  if (payload.category && payload.configKey) {
    filters.push(`category="${pbFilterValue(payload.category)}" && configKey="${pbFilterValue(payload.configKey)}"`);
  }
  if (!filters.length) return null;

  const filter = encodeURIComponent(filters.join(' || '));
  const r = await pbReq('GET', `/api/collections/products/records?filter=${filter}&perPage=5&skipTotal=1&fields=id,name,source,sourceUrl,gtin,mpn,icecatId`);
  if (r.status !== 200) return null;
  return (r.body.items || []).find(isEpeyRecord) || null;
}

async function enrichExistingEpeyIdentifiers(existing, payload) {
  if (!existing || !existing.id || !payload) return false;
  const patch = {};
  if (!existing.gtin && payload.gtin) patch.gtin = String(payload.gtin).trim().slice(0, 200);
  if (!existing.mpn && payload.mpn) patch.mpn = String(payload.mpn).trim().slice(0, 200);
  if (!existing.icecatId && payload.icecatId) patch.icecatId = Number(payload.icecatId) || 0;
  if (!Object.keys(patch).length) return false;

  const r = await pbReq('PATCH', `/api/collections/products/records/${existing.id}`, patch);
  if (r.status !== 200) throw new Error(`PATCH existing Epey identifiers ${existing.id}: ${JSON.stringify(r.body).slice(0, 300)}`);
  return true;
}

function reconcileVariantsNow() {
  // After a run: normalize model families, remove logo/certificate images,
  // collapse config duplicates that slipped past the live dedup, then
  // reconcile variantPrimary / variantCount over the cleaned catalog.
  const { spawnSync } = require('child_process');
  for (const script of ['repair_variant_groups.js', 'repair_icecat_images.js', 'dedupe_configs.js', 'repair_variants.js']) {
    try {
      log(`Running ${script}...`);
      const r = spawnSync(process.execPath, [path.join(__dirname, script)], { stdio: 'inherit' });
      if (r.status !== 0) log(`${script} exited non-zero`, 'warn');
    } catch (e) {
      log(`${script} failed: ${e.message}`, 'warn');
    }
  }
}

// ─── PocketBase upsert ────────────────────────────────────────────────────────

async function upsertToPb(data) {
  // Remove undefined/null/empty-string values that PB would reject
  const payload = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== undefined && v !== null && v !== '')
  );
  if (payload.category) {
    payload.category = canonicalCategory(payload.category);
    touchedCategories.add(payload.category);
    await ensureCategoryRecord(payload.category);
  }

  // Look up existing record by stable identifiers first so Icecat enriches
  // Geizhals records instead of creating duplicates of the same product.
  const filters = [`slug="${payload.slug}"`];
  if (payload.icecatId) filters.push(`icecatId=${Number(payload.icecatId) || 0}`);
  if (payload.category && payload.configKey) {
    filters.push(
      `category="${String(payload.category).replace(/"/g, '\\"')}" && configKey="${String(payload.configKey).replace(/"/g, '\\"')}"`
    );
  }
  if (payload.gtin) filters.push(`gtin="${String(payload.gtin).replace(/"/g, '\\"')}"`);
  if (payload.mpn && payload.brand) {
    filters.push(`mpn="${String(payload.mpn).replace(/"/g, '\\"')}" && brand="${String(payload.brand).replace(/"/g, '\\"')}"`);
  }
  const filter   = filters.join(' || ');
  const checkRes = await pbReq('GET', `/api/collections/products/records?filter=${encodeURIComponent(filter)}&perPage=1&skipTotal=1`);
  const existing = checkRes.status === 200 && checkRes.body.items && checkRes.body.items[0];

  if (existing) {
    const updatePayload = { ...payload };
    if (payload.source === 'icecat' && existing.source && existing.source !== 'icecat') {
      updatePayload.source = existing.source;
      if (existing.sourceUrl) updatePayload.sourceUrl = existing.sourceUrl;
    }
    const r = await pbReq('PATCH', `/api/collections/products/records/${existing.id}`, updatePayload);
    if (r.status !== 200) throw new Error(`PATCH ${existing.id}: ${JSON.stringify(r.body).slice(0, 300)}`);
    return 'updated';
  }

  payload.variantPrimary = await resolveVariantPrimary(payload);
  payload.variantCount   = payload.variantPrimary ? 1 : 0;
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
  const currentCatalogCount = await getCatalogProductCount();
  if (MAX_TOTAL_PRODUCTS > 0 && currentCatalogCount >= MAX_TOTAL_PRODUCTS) {
    log(`Catalog cap reached: ${currentCatalogCount.toLocaleString()} / ${MAX_TOTAL_PRODUCTS.toLocaleString()} products. Icecat import stopped before new writes.`, 'warn');
    return;
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

  const beforeFilter = queue.length;
  for (let i = queue.length - 1; i >= 0; i--) {
    const item = queue[i] || {};
    if (!isAllowedCatId(item.catId) || isBlockedCatalogText(item.name, item.brand)) queue.splice(i, 1);
  }
  if (queue.length !== beforeFilter) {
    log(`Queue filtered by selected categories/quality: ${beforeFilter.toLocaleString()} → ${queue.length.toLocaleString()}`, 'warn');
  }
  const categoryTotal = queue.length;

  // ── Durable resume ──────────────────────────────────────────────────────
  // "Done" is whatever is already in PocketBase — not a fragile numeric index
  // into a filter-dependent list. Preload every saved Icecat product and drop
  // it from the work list. This makes Resume survive PC shutdown, proxy
  // restarts, category switches and a corrupt/stale progress file.
  const alreadySaved = await loadExistingIcecatIds();
  const beforeResume = queue.length;
  for (let i = queue.length - 1; i >= 0; i--) {
    if (alreadySaved.has(String(queue[i].id))) queue.splice(i, 1);
  }
  const alreadyDone = beforeResume - queue.length;
  if (alreadyDone > 0) {
    log(`Resume: ${alreadyDone.toLocaleString()} products already in PocketBase — skipped.`, 'ok');
  }

  // Progress is a live display counter only; PocketBase is the source of
  // truth, so a lost or stale progress file can never corrupt a run.
  const prog = {
    catsKey: catsKey(), total: categoryTotal, alreadyDone,
    done: 0, created: 0, updated: 0, deduped: 0, skipped: 0, errors: 0,
  };
  const remainingCatalogSlots = MAX_TOTAL_PRODUCTS > 0 ? Math.max(0, MAX_TOTAL_PRODUCTS - currentCatalogCount) : queue.length;
  const end = Math.min(LIMIT > 0 ? LIMIT : queue.length, queue.length, remainingCatalogSlots);
  saveProgress(prog);

  log(`Category total: ${categoryTotal.toLocaleString()} | Already saved: ${alreadyDone.toLocaleString()} | Catalog: ${currentCatalogCount.toLocaleString()}/${MAX_TOTAL_PRODUCTS.toLocaleString()} | To process now: ${end.toLocaleString()}`);
  log(`Workers: ${WORKERS} | Delay: ${DELAY}ms | Languages: ${LANGS.join(', ')}`);

  if (end === 0) {
    log('Nothing to process — every product in the selected category is already in the catalog.', 'ok');
    await syncTouchedCategoryCounts();
    return;
  }

  // Shared index into the not-yet-saved work list (JS is single-threaded).
  let idx = 0;

  async function runWorker(workerId) {
    while (idx < end && !shutdownRequested) {
      const item = queue[idx++];
      const { id: icecatId, catId, brand, name } = item;

      try {
        // Primary language (always EN)
        const enJson = await fetchIcecatJson(icecatId, 'EN');
        const pbData = mapToPb(enJson, 'EN', item);
        pbData.keySpecs = buildKeySpecs(pbData.category, pbData.specs);
        if (!passesIcecatQuality(pbData)) {
          const minSpecs = minSpecsForCategory(pbData.category);
          prog.skipped = (prog.skipped || 0) + 1;
          log(`  Skip id=${icecatId} (${name || brand}): only ${pbData.specsCount || 0} specs, need ${minSpecs}+`, 'warn');
          prog.done++;
          if (prog.done % 10 === 0) saveProgress(prog);
          await sleep(DELAY);
          continue;
        }

        const existingEpey = await findExistingEpeyProduct(pbData);
        if (existingEpey) {
          const enriched = await enrichExistingEpeyIdentifiers(existingEpey, pbData);
          if (enriched) prog.updated++;
          else prog.skipped = (prog.skipped || 0) + 1;
          log(`  ${enriched ? 'Linked' : 'Skip'} id=${icecatId} (${pbData.name}): already exists from Epey (${existingEpey.name || existingEpey.id})${enriched ? ' — added affiliate identifiers' : ''}`, 'ok');
          prog.done++;
          if (prog.done % 10 === 0) saveProgress(prog);
          await sleep(DELAY);
          continue;
        }

        // Configuration dedup — bail out BEFORE the 11 extra-language fetches
        // if this is just a cosmetic duplicate (same CPU/RAM/storage, only a
        // different colour / reseller / keyboard) of a config already kept.
        if (await isCosmeticDuplicate(icecatId, pbData.category, pbData.configKey)) {
          prog.deduped = (prog.deduped || 0) + 1;
          prog.done++;
          if (prog.done % 10 === 0) saveProgress(prog);
          await sleep(DELAY);
          continue;
        }

        // Additional languages — fetched in parallel. The Icecat live API
        // tolerates a small burst of concurrent reads per user; serialising
        // 12 languages with delays would take >10s per product and cap us
        // at ~10/min/worker. Parallel fan-out cuts that to ~1s per product.
        const extraLangs = LANGS.filter(l => l !== 'EN');
        const multiSpecs    = { en: pbData.specs };
        const multiSections = { en: pbData.specSections };
        const nameTrans     = { en: pbData.name };

        if (extraLangs.length) {
          const results = await Promise.allSettled(
            extraLangs.map(lang => fetchIcecatJson(icecatId, lang).then(j => ({ lang, json: j })))
          );
          for (const r of results) {
            if (r.status !== 'fulfilled') continue; // EN already covered
            const { lang, json } = r.value;
            const xData = mapToPb(json, lang, item);
            const key = lang.toLowerCase();
            multiSpecs[key]    = xData.specs;
            multiSections[key] = xData.specSections;
            nameTrans[key]     = xData.name;
          }
        }

        pbData.multiLangSpecs    = multiSpecs;
        pbData.multiLangSections = multiSections;
        pbData.nameTranslated    = nameTrans;

        const action = await upsertToPb(pbData);
        if (action === 'created') prog.created++;
        else prog.updated++;

      } catch (e) {
        // Filtered-out rows (wrong brand, refurbished, junk, off-category)
        // are expected noise — count them as skipped, not hard errors.
        const filtered = /^(brand_filtered|blocked_|category_not_selected|too_few)/.test(e.message || '');
        log(`  Skip id=${icecatId} (${name || brand}): ${e.message}`, 'warn');
        if (filtered) prog.skipped = (prog.skipped || 0) + 1;
        else prog.errors++;
      }

      prog.done++;

      // Frequent checkpointing keeps the Resume button honest after stops.
      if (prog.done % 10 === 0) saveProgress(prog);
      if (prog.done % 100 === 0) {
        saveProgress(prog);
        const pct = (prog.done / end * 100).toFixed(1);
        log(`[w${workerId}] ${prog.done}/${end} (${pct}%) — +${prog.created} new, ~${prog.updated} upd, ${prog.deduped || 0} dup, ${prog.skipped || 0} skip, ${prog.errors} err`);
      }

      await sleep(DELAY);
    }
  }

  // Launch workers concurrently
  await Promise.all(Array.from({ length: WORKERS }, (_, i) => runWorker(i + 1)));

  saveProgress(prog);
  // Always reconcile category product counts — including after a stop — so the
  // admin/Flutter category lists never drift from the real catalog.
  await syncTouchedCategoryCounts();
  if (shutdownRequested) {
    log(`Stopped — ${prog.done.toLocaleString()}/${end.toLocaleString()} processed this session. Use Resume to continue (it re-checks PocketBase).`, 'warn');
    return;
  }
  log(`Phase 2+3 done — created: ${prog.created}, updated: ${prog.updated}, deduped: ${prog.deduped || 0}, skipped: ${prog.skipped || 0}, errors: ${prog.errors}`, 'ok');
  reconcileVariantsNow();
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
  if (MAX_TOTAL_PRODUCTS) log(`Catalog hard cap: ${MAX_TOTAL_PRODUCTS.toLocaleString()} total products`);
  console.log('');

  if (!ICECAT_USER) throw new Error('ICECAT_USERNAME not set in migration/.env — add it and retry');

  if (!SKIP_PHASE1) {
    // Reset progress since queue will be rebuilt with new sort order
    if (fs.existsSync(PROGRESS_FILE)) {
      fs.unlinkSync(PROGRESS_FILE);
      log('Progress reset — queue rebuilt from scratch');
    }
    await phase1_index();
  } else {
    if (CATS_FILTER) {
      log(`Resume uses selected category filter: ${catsKey()}`);
    }
    const meta = readQueueMeta();
    const selectedKey = catsKey();
    const inspected = await inspectQueueForSelectedCats();
    const metaMismatch = !meta || meta.catsKey !== selectedKey;
    if (!fs.existsSync(QUEUE_FILE) || inspected.total === 0 || inspected.allowed === 0 || metaMismatch) {
      if (metaMismatch) log(`Queue belongs to ${meta?.catsKey || 'unknown'} but selected ${selectedKey}; rebuilding Phase 1.`, 'warn');
      else log(`Existing queue has ${inspected.allowed}/${inspected.total} usable rows for ${selectedKey}; rebuilding Phase 1.`, 'warn');
      if (fs.existsSync(PROGRESS_FILE)) fs.unlinkSync(PROGRESS_FILE);
      await phase1_index();
    } else {
      log(`Skipping Phase 1 (--resume or --phase=2); queue usable for ${selectedKey} (${inspected.allowed.toLocaleString()} sample match).`);
    }
  }

  await phase23_enrichImport();
}

main().catch(e => {
  log(e.message, 'err');
  console.error(e.stack);
  process.exit(1);
});
