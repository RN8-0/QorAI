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
// 12 languages matching the Flutter app's l10n files
const LANGS_DEFAULT = 'EN,TR,DE,FR,ES,IT,JA,NL,PL,PT,SV,AR';
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

// Optional category filter — e.g. --cats=monitors,ram  (default: all in CAT_MAP)
const CATS_FILTER = getOpt('cats', '');
const CAT_WHITELIST = CATS_FILTER
  ? new Set(CATS_FILTER.split(',').map(s => s.trim().toLowerCase()))
  : null; // null = no filter = all categories

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
  2282: 'all-in-one-pcs',           // 44k
  156:  'servers',                  // 24k
  896:  'thin-clients',             //  5k
  152:  'laptop-docks',             //  5k
  154:  'handheld-computers',       //  3k
  // ── Components ──────────────────────────────────────────────
  989:  'cpus',                     // 14k  (Processors)
  911:  'ram',                      // 54k  (Memory Modules)
  164:  'motherboards',             //  9k
  237:  'cases',                    //  4k
  963:  'psus',                     //  4k
  921:  'coolers',                  //  3k  (Computer Cooling Systems)
  // ── Storage ─────────────────────────────────────────────────
  219:  'hdds',                     // 36k  (Internal HDDs)
  1823: 'external-hdds',            //  4k
  1563: 'ssds',                     // 27k  (Internal SSDs)
  932:  'nas',                      // 46k  (NAS & Storage Servers)
  1554: 'flash-drives',             //  6k
  902:  'memory-cards',             //  4k
  214:  'optical-drives',           //  4k
  // ── Display & TV ────────────────────────────────────────────
  222:  'monitors',                 // 42k  (Computer Monitors)
  1584: 'tvs',                      // 42k
  2672: 'signage-displays',         //  6k
  567:  'projectors',               //  8k  (Data Projectors)
  940:  'monitor-accessories',      //  6k
  1056: 'tv-mounts',                //  6k
  // ── Mobile ──────────────────────────────────────────────────
  1893: 'smartphones',              // 29k  (Smartphones)
  119:  'mobile-phones',            //  4k  (Feature phones)
  897:  'tablets',                  // 27k
  // ── Imaging ─────────────────────────────────────────────────
  575:  'cameras',                  // 12k  (Digital Cameras)
  584:  'camcorders',               //  3k
  1557: 'security-cameras',         //  5k
  // ── Peripherals ─────────────────────────────────────────────
  194:  'keyboards',                // 26k  (Keyboards)
  195:  'mice',                     //  9k
  2813: 'mobile-keyboards',         //  5k
  // ── Printing ────────────────────────────────────────────────
  304:  'multifunction-printers',   // 11k
  235:  'laser-printers',           //  4k
  229:  'label-printers',           //  5k
  // ── Networking ──────────────────────────────────────────────
  258:  'network-switches',         //  9k
  3982: 'routers',                  //  3k  (Wireless Routers)
  182:  'network-cards',            //  6k
  // ── Power ───────────────────────────────────────────────────
  817:  'ups',                      //  6k  (UPSs)
  984:  'pdus',                     //  4k  (Power Distribution Units)
  827:  'power-adapters',           // 22k
  // ── Audio ───────────────────────────────────────────────────
  2315: 'portable-speakers',        //  5k
  // ── Smart home / appliances (electronics) ───────────────────
  1234: 'vacuums',                  //  5k
  1320: 'coffee-makers',            //  7k
  1324: 'dishwashers',              //  9k
  1325: 'microwaves',               //  4k
  1330: 'tumble-dryers',            //  5k
  1331: 'washing-machines',         // 16k
  1864: 'hobs',                     //  7k
  1873: 'fridge-freezers',          // 14k
  2286: 'ovens',                    //  8k
  1661: 'led-bulbs',                // 11k
};

const TARGET_CATS = new Set(Object.keys(CAT_MAP).map(Number));
const VALID_CAT_SLUGS = new Set(Object.values(CAT_MAP));
if (CAT_WHITELIST) {
  const unknownCats = [...CAT_WHITELIST].filter(slug => !VALID_CAT_SLUGS.has(slug));
  if (unknownCats.length) {
    throw new Error(`Unknown Icecat category slug(s): ${unknownCats.join(', ')}`);
  }
}

function canonicalCategory(slug) {
  const s = String(slug || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
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

const sleep   = ms => new Promise(r => setTimeout(r, ms));
const slugify = s  => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);

function modelFamilyKey({ name, brand, category }) {
  let s = String(name || '').toLowerCase();
  const b = String(brand || '').toLowerCase().trim();
  if (b) s = s.replace(new RegExp(`^${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), '');
  const familyProbe = s
    .replace(/[()[\],"'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const familyPatterns = [
    /\b(thinkpad\s+[a-z]\d+[a-z0-9]*(?:\s+gen\s+\d+)?)\b/i,
    /\b(ideapad\s+[a-z0-9]+(?:\s+gen\s+\d+)?)\b/i,
    /\b(legion\s+[a-z0-9]+(?:\s+gen\s+\d+)?)\b/i,
    /\b(elitebook\s+\d+\s*g\d+)\b/i,
    /\b(probook\s+\d+\s*g\d+)\b/i,
    /\b(zbook\s+[a-z0-9]+\s*g\d+)\b/i,
    /\b(latitude\s+\d+)\b/i,
    /\b(thinkbook\s+[a-z0-9]+(?:\s+gen\s+\d+)?)\b/i,
    /\b(galaxy\s+(?:s|z|a|m)\d+[a-z]*(?:\s+(?:ultra|plus|fe|fold|flip))?)\b/i,
    /\b(iphone\s+\d+[a-z]*(?:\s+(?:pro|max|plus|mini))?)\b/i,
    /\b(ipad\s+(?:pro|air|mini)?(?:\s+\d+(?:[.,]\d+)?)?)\b/i,
  ];
  for (const re of familyPatterns) {
    const m = familyProbe.match(re);
    if (m && m[1]) {
      const fam = slugify(m[1]);
      if (fam) return [b, fam].filter(Boolean).join('-').slice(0, 180);
    }
  }
  const mac = familyProbe.match(/\b(macbook\s+(?:air|pro)(?:\s+\d+(?:[.,]\d+)?)?)/i);
  if (mac) {
    const chip = familyProbe.match(/\b(m\d+(?:\s*(?:pro|max|ultra))?)\b/i);
    const fam = slugify(`${mac[1]} ${chip ? chip[1] : ''}`);
    if (fam) return [b, fam].filter(Boolean).join('-').slice(0, 180);
  }
  s = s
    .replace(/\[([^\]]*)\]/g, ' $1 ')
    .replace(/\((?:intel|amd|qualcomm|apple)\)/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*cm\b/gi, ' ')
    .replace(/\(\s*\d+(?:[.,]\d+)?\s*(?:"|inch|zoll)\s*\)/gi, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:"|inch|zoll)\b/gi, ' ')
    .replace(/\b\d+\s*(?:gb|tb|mb)\b/gi, ' ')
    .replace(/\b\d+\s*\/\s*\d+\b/g, ' ')
    .replace(/\b\d+\s*mah\b/gi, ' ')
    .replace(/\b(?:intel\s+)?core\s+(?:ultra\s+)?[3579]\s+[a-z0-9-]+\b/gi, ' ')
    .replace(/\b(?:amd\s+)?ryzen\s+(?:ai\s+)?[3579]\s+[a-z0-9-]+\b/gi, ' ')
    .replace(/\b(?:ddr\d|lpddr\d[x]?|sdram|ssd|hdd|nvme|wuxga|fhd|uhd|qhd)\b/gi, ' ')
    .replace(/\b(?:dual\s*sim|single\s*sim|sim-free|usb\s*type[- ]?c|usb-c|5g|4g|lte|wi-fi|wifi|wlan|bluetooth)\b/gi, ' ')
    .replace(/\bandroid\s*\d+(?:[.,]\d+)?\b/gi, ' ')
    .replace(/\b(?:windows|macos)\s*\d+(?:[.,]\d+)?(?:\s*pro)?\b/gi, ' ')
    .replace(/\b(?:windows|macos|linux|freebsd|pro|home|laptop|notebook|computer|pc|spanish|german|french|italian|english|turkish|ispanyolca|almanca|fransizca|fransızca|italyanca|ingilizce|turkce|türkçe)\b/gi, ' ')
    .replace(/\b(?:black|white|silver|gold|blue|purple|violet|pink|red|green|gray|grey|cream|graphite|lavender|wood|bordeaux|midnight|starlight|titanium|stone\s*colour|dark\s*blue|dark\s*green|schwarz|weiß|weiss|silber|blau|grün|gruen|creme|siyah|beyaz|yeşil|yesil|gri|mavi|kırmızı|kirmizi|mor|pembe|sarı|sari)\b/gi, ' ')
    .replace(/\b(?:de|uk|us|eu|pl|fr|it|es|se|gb)\b/gi, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const base = [b, s].filter(Boolean).join('-').slice(0, 180);
  return base || slugify(name) || slugify(category);
}

function log(msg, tag = 'info') {
  const prefix = { info: '   ', ok: ' ✓ ', warn: ' ! ', err: ' ✗ ' }[tag] || '   ';
  console.log(`[icecat]${prefix}${msg}`);
}

function loadProgress() {
  try {
    return { skipped: 0, ...JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8')) };
  } catch {
    return { done: 0, created: 0, updated: 0, skipped: 0, errors: 0 };
  }
}
function saveProgress(p) { fs.writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2), 'utf8'); }

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
  const collected = []; // collect all, sort by id desc, then write
  const seenIcecatIds = new Set();

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
        if (TARGET_CATS.has(catId) && (!CAT_WHITELIST || CAT_WHITELIST.has(slug)) && !seenIcecatIds.has(cur.id)) {
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
        outStream.end(resolve);
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

  // Images — Icecat publishes 3 variants per asset:
  //   Pic       → original (often 5000×5000, 5MB)   — too big for the app
  //   Pic500x500→ ~500×500 (~80-120KB)              — sweet spot
  //   LowPic    → 200×200  (~20-30KB)               — thumb only
  // We persist the 500×500 variant so the admin gallery and Flutter detail
  // page load in <300ms per image without filling PocketBase storage. The
  // single hero image (`imageUrl`) also points to the medium variant.
  const gallery = (Array.isArray(d.Gallery) ? d.Gallery : []).concat(Array.isArray(gi.Gallery) ? gi.Gallery : []);
  const images  = gallery
    .map(img => img.Pic500x500 || img.Pic || img.HighPic || '')
    .filter(Boolean)
    .filter((u, i, a) => a.indexOf(u) === i) // dedupe
    .slice(0, 4);
  // Fall back to the Image envelope object if Gallery was empty
  const imgEnv = d.Image || {};
  const imageUrl = images[0] || imgEnv.Pic500x500 || imgEnv.HighPic || imgEnv.LowPic || '';
  // Ensure imageUrl is also present in `images` for consistent rendering
  if (imageUrl && !images.includes(imageUrl)) images.unshift(imageUrl);

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

  return {
    slug, name, brand, category, source: 'icecat', sourceUrl,
    imageUrl, images, specs, specSections,
    specsEn:      lang === 'EN' ? specs : undefined,
    specsCount,
    variantGroup: modelFamilyKey({ name, brand, category }),
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
  return count >= minSpecsForCategory(payload.category);
}

// ─── Category sync ────────────────────────────────────────────────────────────

const CATEGORY_NAMES = {
  laptops: 'Laptops',
  desktops: 'Desktops',
  smartphones: 'Smartphones',
  tablets: 'Tablets',
  monitors: 'Monitors',
  tvs: 'TVs',
  ram: 'RAM',
  ssd: 'SSDs',
  ssds: 'SSDs',
  hard_drives: 'Hard Drives',
  external_hdd: 'External Hard Drives',
  hdds: 'Hard Drives',
  cpus: 'CPUs',
  psu: 'Power Supplies',
  pc_cases: 'PC Cases',
  cpu_coolers: 'CPU Coolers',
  motherboards: 'Motherboards',
  keyboards: 'Keyboards',
  mice: 'Mice',
  digital_cameras: 'Digital Cameras',
  cameras: 'Cameras',
  routers: 'Routers',
  ups: 'UPS',
  printers: 'Printers',
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

function reconcileVariantsNow() {
  try {
    log('Reconciling variant groups (exact counts)...');
    const { spawnSync } = require('child_process');
    const r = spawnSync(process.execPath, [path.join(__dirname, 'repair_variants.js')], { stdio: 'inherit' });
    if (r.status !== 0) log('Variant reconcile exited non-zero', 'warn');
  } catch (e) {
    log(`Variant reconcile failed: ${e.message}`, 'warn');
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
        log(`  Skip id=${icecatId} (${name || brand}): ${e.message}`, 'warn');
        prog.errors++;
      }

      prog.done++;

      // Frequent checkpointing keeps the Resume button honest after stops.
      if (prog.done % 10 === 0) saveProgress(prog);
      if (prog.done % 100 === 0) {
        saveProgress(prog);
        const pct = ((prog.done - start) / (end - start) * 100).toFixed(1);
        log(`[w${workerId}] ${prog.done}/${end} (${pct}%) — +${prog.created} new, ~${prog.updated} upd, ${prog.skipped || 0} skip, ${prog.errors} err`);
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
    log(`Stopped — progress saved at ${prog.done.toLocaleString()}/${queue.length.toLocaleString()}. Use Resume to continue.`, 'warn');
    return;
  }
  log(`Phase 2+3 done — created: ${prog.created}, updated: ${prog.updated}, skipped: ${prog.skipped || 0}, errors: ${prog.errors}`, 'ok');
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
    log('Skipping Phase 1 (--resume or --phase=2)');
  }

  await phase23_enrichImport();
}

main().catch(e => {
  log(e.message, 'err');
  console.error(e.stack);
  process.exit(1);
});
