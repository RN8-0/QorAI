#!/usr/bin/env node
/**
 * Qor AI — Bulk DeepSeek translator (Node, no browser concurrency limit)
 *
 * Admin UI'daki "Translate Category (Bulk)" akışını Node tarafına taşıyan
 * tek-seferlik toplu çeviri scripti. Browser fetch limiti olmadığı için
 * DeepSeek'i 30+ paralel çağırabilir; admin'in 2-paralel zincirinden çok
 * daha hızlı bitirir.
 *
 * NE YAPAR
 *   1) PocketBase'den Epey kaynaklı tüm ürünleri çeker (paged).
 *   2) Tüm ürünlerin name + specs + specSections + keySpecs'inden unique
 *      Türkçe "atomları" toplar, mevcut dict shardlarında olmayanları seçer.
 *   3) DeepSeek'e CONCURRENCY paralel ve CHUNK_SIZE atomluk chunklar ile
 *      tek prompt'ta 11 dili birden istetir.
 *   4) Tüm cevaplar geldiğinde dict'i tek seferde shard'lara böler ve
 *      `public_config` koleksiyonuna yazar.
 *   5) Opsiyonel: her ürünün multiLangSpecs/multiLangSections/nameTranslated
 *      alanlarını dict-only lookup ile inşa edip PB'ye PATCH'ler.
 *
 * KULLANIM
 *   node scripts/translate-bulk-deepseek.js                  # full: dict + patch all
 *   node scripts/translate-bulk-deepseek.js --dict-only      # sadece dict doldur
 *   node scripts/translate-bulk-deepseek.js --patch-only     # dict var, ürünleri patch'le
 *   node scripts/translate-bulk-deepseek.js --category=tvs   # tek kategori
 *   node scripts/translate-bulk-deepseek.js --resume         # multiLangSpecs dolu olanları atla
 *   node scripts/translate-bulk-deepseek.js --concurrency=8 --chunk=75
 *   node scripts/translate-bulk-deepseek.js --dry-run        # API/PB yazma, sadece say
 *
 * ENV
 *   migration/.env: POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL, POCKETBASE_ADMIN_PASSWORD
 *   DeepSeek key: scripts/build-dictionary.js içinden okunur (veya DEEPSEEK_API_KEY env).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const { req: pbReq } = require('../migration/pb');

// ─── Config ───────────────────────────────────────────────────────────────

const ARGS = parseArgs(process.argv.slice(2));
const CATEGORY      = ARGS.category || '';
const CONCURRENCY   = Number(ARGS.concurrency || 8);
const CHUNK_SIZE    = Number(ARGS.chunk || 75);
const PATCH_CONCURRENCY = Number(ARGS['patch-concurrency'] || 20);
const CHECKPOINT_CHUNKS = Number(ARGS['checkpoint-chunks'] || 50);
const DICT_ONLY     = !!ARGS['dict-only'];
const PATCH_ONLY    = !!ARGS['patch-only'];
const RESUME        = !!ARGS.resume;
const DRY_RUN       = !!ARGS['dry-run'];
const VERBOSE       = !!ARGS.verbose;

// EU pivot (2026-05-23): 6 target languages instead of 11. Matches
// the admin/scraper TARGET_LANGS so both inline and backfill paths
// produce the same multiLangSpecs shape.
const TARGET_LANGS = ['en','de','es','fr','pt','ru'];
const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';
const DEEPSEEK_KEY = resolveDeepSeekKey();

const DE_DICT_PB_KEY        = 'tr_translation_dict';
const DE_DICT_MANIFEST_KEY  = `${DE_DICT_PB_KEY}_manifest`;
const DE_DICT_SHARD_PREFIX  = `${DE_DICT_PB_KEY}__part_`;
const DE_DICT_SHARD_MAX_BYTES = 180000;

if (!DEEPSEEK_KEY && !PATCH_ONLY) {
  console.error('FATAL: DEEPSEEK_API_KEY bulunamadı (env, .env veya scripts/build-dictionary.js)');
  process.exit(1);
}

// In-memory dict: { 'turkish text (lower)': { en: '...', de: '...', ... } }
const DICT = Object.create(null);

// ─── Main ─────────────────────────────────────────────────────────────────

(async function main() {
  const t0 = Date.now();
  log('info', `Bulk translate starting · concurrency=${CONCURRENCY} chunk=${CHUNK_SIZE} dictOnly=${DICT_ONLY} patchOnly=${PATCH_ONLY}`);

  // Load existing dict shards
  await loadDictFromPB();
  log('info', `Dict loaded · ${Object.keys(DICT).length} terms in memory`);

  // Fetch all Epey products
  const products = await fetchEpeyProducts(CATEGORY);
  log('info', `Products: ${products.length} Epey product fetched${CATEGORY ? ` (category=${CATEGORY})` : ''}`);
  if (!products.length) { log('info', 'No products to process. Exit.'); return; }

  if (!PATCH_ONLY) {
    // Collect atoms
    const atoms = collectAtomsFromProducts(products);
    log('info', `Atoms: ${atoms.length} unique translatable terms collected`);

    // Filter to atoms missing for at least one target lang
    const missing = atoms.filter(a => TARGET_LANGS.some(l => !dictLookup(a, l)));
    log('info', `Missing: ${missing.length} atoms need DeepSeek (${atoms.length - missing.length} fully cached)`);

    if (missing.length && !DRY_RUN) {
      await translateAtoms(missing);
      log('info', `Translation pass complete · dict now has ${Object.keys(DICT).length} terms`);
      await saveDictToPB();
      log('info', 'Dict saved to PocketBase (sharded)');
    } else if (missing.length && DRY_RUN) {
      log('info', `[dry-run] would call DeepSeek ${Math.ceil(missing.length / CHUNK_SIZE)} chunks`);
    }
  }

  if (!DICT_ONLY) {
    log('info', `Patching ${products.length} products with multiLangSpecs (concurrency=${PATCH_CONCURRENCY})...`);
    await patchProducts(products);
  }

  const elapsedMin = ((Date.now() - t0) / 60000).toFixed(1);
  log('info', `DONE · total elapsed ${elapsedMin} min`);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});

// ─── DeepSeek translation orchestration ──────────────────────────────────

async function translateAtoms(atoms) {
  const langCodes = TARGET_LANGS.join(',');
  const jobs = [];
  for (let i = 0; i < atoms.length; i += CHUNK_SIZE) {
    jobs.push({ idx: jobs.length, batch: atoms.slice(i, i + CHUNK_SIZE) });
  }
  const total = jobs.length;
  let done = 0, ok = 0, fail = 0, atomsDone = 0, storedTotal = 0;
  const startTs = Date.now();

  log('info', `→ ${atoms.length} atoms in ${total} chunks · ETA depends on DeepSeek throughput`);

  let cursor = 0;
  let lastCheckpointDone = 0;
  let checkpointPromise = Promise.resolve();
  async function worker(wid) {
    while (cursor < jobs.length) {
      const job = jobs[cursor++];
      if (!job) break;
      const t0 = Date.now();
      try {
        const stored = await translateChunk(job.batch, langCodes);
        storedTotal += stored;
        ok++;
      } catch (e) {
        fail++;
        log('warn', `chunk #${job.idx} FAILED: ${e.message || e}`);
      }
      done++;
      atomsDone += job.batch.length;
      const dt = Date.now() - t0;
      const elapsed = (Date.now() - startTs) / 1000;
      const rate = atomsDone / elapsed; // atoms/sec
      const remaining = Math.max(0, atoms.length - atomsDone);
      const etaSec = rate > 0 ? Math.round(remaining / rate) : 0;
      log('info', `chunk ${done}/${total} · w${wid} · ${job.batch.length} atoms · ${dt}ms · stored ${storedTotal} · ${rate.toFixed(1)} atoms/s · ETA ${fmtDuration(etaSec * 1000)}`);
      if (!DRY_RUN && CHECKPOINT_CHUNKS > 0 && done - lastCheckpointDone >= CHECKPOINT_CHUNKS) {
        lastCheckpointDone = done;
        const checkpointDone = done;
        checkpointPromise = checkpointPromise.then(async () => {
          log('info', `checkpoint after ${checkpointDone}/${total} chunks · saving dict...`);
          await saveDictToPB();
          log('info', `checkpoint saved after ${checkpointDone}/${total} chunks`);
        }).catch(e => log('warn', `checkpoint save failed: ${e.message || e}`));
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, (_, i) => worker(i + 1));
  await Promise.all(workers);
  await checkpointPromise;
  log('info', `Chunks: ${ok} ok · ${fail} failed · ${storedTotal} translations stored`);
}

async function translateChunk(batch, langCodes, attempt = 0, splitDepth = 0) {
  const systemMsg = `You are a technical product specification translator.
Translate Turkish tech spec terms into these languages, in this exact order: ${langCodes}.
Rules:
- Keep numbers, units, sizes and technical abbreviations unchanged (e.g. "5G", "Wi-Fi 6E", "120 Hz", "GB", "mm").
- Product names / brand names stay as-is.
- Preserve newlines (\\n) inside multi-line values.
- Return ONLY compact JSON, no markdown:
  {"translations":[["en text","de text","es text","fr text","it text","ja text","nl text","pl text","pt text","sv text","ar text"]]}
- The translations array length MUST equal the input array length.
- Each inner array MUST contain exactly ${TARGET_LANGS.length} strings in language order: ${langCodes}.
- Do not repeat the original Turkish keys. Preserve input order exactly.`;

  const userMsg = `Translate this JSON array of ${batch.length} Turkish product specification terms:\n${JSON.stringify(batch)}\n\nReturn only {"translations":[...]} in the same order.`;

  let resp;
  try {
    resp = await postJsonHttps(DEEPSEEK_URL, {
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userMsg },
      ],
      max_tokens: 8000,
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }, { Authorization: `Bearer ${DEEPSEEK_KEY}` }, 180000);
  } catch (e) {
    // Network/timeout → 1 retry with backoff
    if (attempt < 1) { await sleep(2000); return translateChunk(batch, langCodes, attempt + 1); }
    throw e;
  }

  if (resp.statusCode === 429 || /rate|limit|300 requests/i.test(JSON.stringify(resp.body))) {
    if (attempt < 2) {
      log('warn', `rate limited · waiting 20s then retry (attempt ${attempt + 1})`);
      await sleep(20000);
      return translateChunk(batch, langCodes, attempt + 1, splitDepth);
    }
    throw new Error(`rate limit exhausted: ${resp.statusCode}`);
  }
  if (resp.statusCode < 200 || resp.statusCode >= 300) {
    if (attempt < 1) { await sleep(3000); return translateChunk(batch, langCodes, attempt + 1); }
    throw new Error(`HTTP ${resp.statusCode}: ${truncate(JSON.stringify(resp.body), 200)}`);
  }

  const content = resp.body?.choices?.[0]?.message?.content || '{}';
  let translations;
  try { translations = JSON.parse(content); }
  catch { translations = salvageTruncatedJson(content); }

  const rows = Array.isArray(translations?.translations)
    ? translations.translations
    : (Array.isArray(translations) ? translations : null);
  let stored = 0;
  if (rows) {
    for (let i = 0; i < batch.length; i++) {
      const row = rows[i];
      if (Array.isArray(row)) {
        for (let j = 0; j < TARGET_LANGS.length; j++) {
          if (typeof row[j] === 'string' && row[j].trim()) {
            dictStore(batch[i], TARGET_LANGS[j], row[j]);
            stored++;
          }
        }
      } else if (row && typeof row === 'object') {
        for (const lang of TARGET_LANGS) {
          if (typeof row[lang] === 'string' && row[lang].trim()) {
            dictStore(batch[i], lang, row[lang]);
            stored++;
          }
        }
      }
    }
  } else {
    // Backward-compatible parser for older object-key responses.
    for (const t of batch) {
      const entry = translations[t];
      if (!entry || typeof entry !== 'object') continue;
      for (const lang of TARGET_LANGS) {
        if (typeof entry[lang] === 'string' && entry[lang].trim()) {
          dictStore(t, lang, entry[lang]);
          stored++;
        }
      }
    }
  }
  const incomplete = batch.filter(t => TARGET_LANGS.some(lang => !dictLookup(t, lang)));
  if (incomplete.length) {
    const complete = batch.length - incomplete.length;
    if (batch.length > 20 && splitDepth < 4) {
      log('warn', `incomplete DeepSeek JSON · ${complete}/${batch.length} atoms complete · splitting ${incomplete.length} missing atoms`);
      const mid = Math.ceil(incomplete.length / 2);
      stored += await translateChunk(incomplete.slice(0, mid), langCodes, 0, splitDepth + 1);
      stored += await translateChunk(incomplete.slice(mid), langCodes, 0, splitDepth + 1);
    } else if (attempt < 2) {
      log('warn', `incomplete DeepSeek JSON · retrying ${incomplete.length}/${batch.length} atoms (attempt ${attempt + 1})`);
      await sleep(1500);
      stored += await translateChunk(incomplete, langCodes, attempt + 1, splitDepth);
    } else {
      log('warn', `incomplete DeepSeek JSON · gave up on ${incomplete.length}/${batch.length} atoms after retries`);
    }
  }
  return stored;
}

// ─── PocketBase: load/save dict ──────────────────────────────────────────

async function loadDictFromPB() {
  // 1) Manifest tells us the active batch + shard count.
  const mfRes = await pbReq('GET', encodeURI(`/api/collections/public_config/records?filter=(key="${DE_DICT_MANIFEST_KEY}")&perPage=1`));
  if (mfRes.status !== 200 || !mfRes.body.items?.length) {
    log('info', 'No manifest found — starting from empty dict.');
    return;
  }
  const manifest = mfRes.body.items[0]?.value || {};
  const batchId = manifest.batchId;
  if (!batchId || !manifest.sharded) {
    log('warn', `Manifest exists but not sharded · skip load`);
    return;
  }

  // 2) Page through all shard records and merge those whose batchId matches.
  let page = 1;
  let merged = 0, scanned = 0;
  while (true) {
    const r = await pbReq('GET', encodeURI(`/api/collections/public_config/records?filter=(key~"${DE_DICT_SHARD_PREFIX}")&perPage=200&page=${page}&fields=key,value`));
    if (r.status !== 200) throw new Error('Failed to load shards: ' + JSON.stringify(r.body));
    const items = r.body.items || [];
    if (!items.length) break;
    for (const it of items) {
      scanned++;
      const v = it.value || {};
      if (v.batchId !== batchId) continue;
      const terms = v.terms || {};
      for (const [rawKey, rawEntry] of Object.entries(terms)) {
        const k = String(rawKey || '').toLowerCase().trim();
        if (!k || !isDictEntry(rawEntry)) continue;
        if (!DICT[k]) DICT[k] = {};
        for (const [lang, val] of Object.entries(rawEntry)) {
          if (typeof val === 'string' && val.trim()) DICT[k][lang] = val.trim();
        }
        merged++;
      }
    }
    if (items.length < 200) break;
    page++;
  }
  log('info', `Loaded ${merged} entries from ${scanned} shards (batchId=${batchId})`);
}

async function saveDictToPB() {
  // Build shards.
  const entries = Object.entries(DICT).sort(([a],[b]) => a.localeCompare(b));
  const shards = [];
  let shard = {}, shardBytes = 2;
  for (const [k, v] of entries) {
    const nextBytes = Buffer.byteLength(JSON.stringify({ [k]: v })) + 1;
    if (Object.keys(shard).length && shardBytes + nextBytes > DE_DICT_SHARD_MAX_BYTES) {
      shards.push(shard); shard = {}; shardBytes = 2;
    }
    shard[k] = v; shardBytes += nextBytes;
  }
  if (Object.keys(shard).length || !shards.length) shards.push(shard);

  const batchId = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  const updatedAt = new Date().toISOString();
  log('info', `Writing ${shards.length} shards to PB (batchId=${batchId})...`);

  // Write shards in parallel (20 at a time)
  let idx = 0;
  async function w() {
    while (idx < shards.length) {
      const i = idx++;
      const key = `${DE_DICT_SHARD_PREFIX}${String(i).padStart(4,'0')}`;
      await upsertConfig(key, {
        key, value: { sharded: true, batchId, index: i, total: shards.length, terms: shards[i] }, updatedAt,
      });
    }
  }
  await Promise.all(Array.from({length: Math.min(20, shards.length)}, w));

  // Manifest + marker
  await upsertConfig(DE_DICT_MANIFEST_KEY, {
    key: DE_DICT_MANIFEST_KEY,
    value: { sharded: true, batchId, totalShards: shards.length, totalTerms: Object.keys(DICT).length, updatedAt },
    updatedAt,
  });
  await upsertConfig(DE_DICT_PB_KEY, {
    key: DE_DICT_PB_KEY,
    value: { sharded: true, manifestKey: DE_DICT_MANIFEST_KEY, totalShards: shards.length, totalTerms: Object.keys(DICT).length, updatedAt },
    updatedAt,
  });
}

async function upsertConfig(key, body) {
  // Find existing
  const r = await pbReq('GET', encodeURI(`/api/collections/public_config/records?filter=(key="${key}")&perPage=1&fields=id`));
  if (r.status === 200 && r.body.items?.length) {
    const id = r.body.items[0].id;
    const u = await pbReq('PATCH', `/api/collections/public_config/records/${id}`, body);
    if (u.status >= 300) throw new Error(`PATCH ${key} failed: ${JSON.stringify(u.body)}`);
    return;
  }
  const c = await pbReq('POST', '/api/collections/public_config/records', body);
  if (c.status >= 300) throw new Error(`POST ${key} failed: ${JSON.stringify(c.body)}`);
}

// ─── PocketBase: fetch Epey products ─────────────────────────────────────

// PocketBase 400's on `source="epey.com"` alone (no index for full scan), but
// accepts `category="X" && source="epey.com"` because category narrows first.
// So we iterate category-by-category. Source value is exactly "epey.com".
const EPEY_CATEGORIES = [
  'smartphones','tablets','laptops','desktops','cpus','gpus','ram','ssd',
  'motherboards','psu','cases','coolers','tvs','monitors','projectors',
  'headphones','speakers','soundbars','smartwatches','cameras','action-cameras',
  'security-cameras','consoles','gamepads','keyboards','mice','printers',
  'webcams','routers','robot-vacuums','powerbanks','e-readers','drones',
];

async function fetchEpeyProducts(category) {
  const cats = category ? [category] : EPEY_CATEGORIES;
  const fields = 'id,name,brand,category,source,sourceUrl,specs,specSections,keySpecs,multiLangSpecs';
  const all = [];
  for (const cat of cats) {
    const filter = `category="${cat}" && source="epey.com"`;
    let page = 1, catCount = 0;
    while (true) {
      const url = `/api/collections/products/records?filter=${encodeURIComponent(filter)}&fields=${encodeURIComponent(fields)}&perPage=500&page=${page}&sort=id`;
      const r = await pbReq('GET', url);
      if (r.status !== 200) {
        log('warn', `category "${cat}" page ${page} failed: ${truncate(JSON.stringify(r.body), 200)} — skipping`);
        break;
      }
      const items = r.body.items || [];
      if (!items.length) break;
      all.push(...items);
      catCount += items.length;
      if (items.length < 500) break;
      page++;
    }
    if (catCount) log('info', `  ${cat}: ${catCount} products`);
  }
  return all;
}

// ─── Atom collection (mirror of admin/js/scraper.js logic) ───────────────

function collectAtomsFromProducts(products) {
  const sink = new Set();
  for (const p of products) collectAtomsFromProduct(p, sink);
  return [...sink].filter(shouldTranslateAtom);
}

function collectAtomsFromProduct(p, sink) {
  const add = (t) => {
    const s = String(t || '').trim();
    if (!s) return;
    if (s.includes('\n')) {
      for (const line of s.split('\n')) {
        const l = line.trim();
        if (l) sink.add(l);
      }
      return;
    }
    sink.add(s);
  };
  if (shouldTranslateProductName(p.name)) add(p.name);
  const specs = p.specs || {};
  for (const [k, v] of Object.entries(specs)) { add(k); add(v); }
  const sections = p.specSections || {};
  for (const [secName, body] of Object.entries(sections)) {
    add(secName);
    if (body && typeof body === 'object') {
      for (const [k, v] of Object.entries(body)) { add(k); add(v); }
    }
  }
  const keySpecs = p.keySpecs || {};
  for (const [k, v] of Object.entries(keySpecs)) { add(k); add(v); }
}

// ─── Atom filter rules (ported from admin/js/scraper.js) ─────────────────

const ACRONYMS = new Set([
  'AF','AI','AMOLED','ANC','AOSS','API','APP','ARM','BLE','CPU','DDR','DLNA',
  'DNS','DSP','EU','FHD','GHZ','GPS','GPU','HDD','HDMI','HDR','HSPA','HZ','IO',
  'IP','IP54','IP55','IP65','IP66','IP67','IP68','IP69','IPS','IR','ISO','LCD',
  'LED','LTE','MAH','MEMS','MIMO','MP','MS','NFC','OIS','OLED','OS','PD','PWM',
  'QHD','QLED','RAM','RGB','ROM','SIM','SD','SDR','SOC','SSD','SSID','TFT','TPU',
  'UFS','UHD','USB','USB-C','UV','UWB','VPN','VR','WAN','WI-FI','WLAN','WPA',
  'WPA2','WPA3','WUXGA','YUV','3D','4G','5G','6E','8K','4K','2K','HD','LDAC',
  'AAC','SBC','APT-X','APTX','EDR','BT','CCT','HDR10','HDR10+','XDR',
  'PIN','IPX','IPX4','IPX5','IPX7','IPX8','RTX','GTX','AMD','MTK',
  'DISPLAYPORT','MINI-DISPLAYPORT','THUNDERBOLT','ETHERNET','RJ45','VGA','DVI',
  'HDCP','ARC','EARC','DSC','VRR','ALLM','HFR','NIT','NITS','NTSC',
  'DCI-P3','SRGB','ADOBE','DOLBY','DTS','HI-RES','HIRES','TWS',
  'F','G','MB','GB','TB','KB','KHZ','MHZ','BAR','DPI','TDP','TBW','PCIE','PCI',
  'M.2','M2','MM','CM','SDXC','SDHC','VA','W','V','A','KW','KWH'
]);

const PRESERVE_PATTERNS = [
  /^\d+(\.\d+)?(mm|cm|m|kg|g|mg|mah|wh|w|v|a|hz|khz|mhz|ghz|mp|gb|tb|mb|kb|nm|bar|°c|°f|fps|dpi|ms|s|h|x)$/i,
  /^\d+(\.\d+)?$/,
  /^f\/\d+(\.\d+)?$/i,
  /^\d+x\d+$/,
  /^\d+x$/,
  /^\d+x\d+(\.\d+)?(mm|cm|m)?$/i,
  /^@\d+/,
  /^\d+(\.\d+)?(p|i)$/i,
  /^[A-Z]+-?\d+[A-Z0-9-]*$/,
];

function shouldPreserve(token) {
  if (!token) return true;
  if (ACRONYMS.has(token.toUpperCase())) return true;
  for (const re of PRESERVE_PATTERNS) if (re.test(token)) return true;
  if (/\d/.test(token) && /[a-zA-Z]/.test(token)) return true;
  return false;
}

function shouldTranslateAtom(text) {
  const s = String(text || '').trim();
  if (!s || s.length < 2) return false;
  if (!/[a-zA-ZÀ-ÿ]/.test(s)) return false;
  if (/^\d{8,14}$/.test(s)) return false;
  if (/^[\d\s.,:+/()°%'"-]+$/.test(s)) return false;
  if (/^(ean|gtin|upc|mpn|sku|id)$/i.test(s)) return false;
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length && tokens.every(t => shouldPreserve(t.replace(/^[^\w]+|[^\w]+$/g, '')))) return false;
  const compact = s.replace(/[\s._/-]+/g, '');
  if (/[A-Z]/.test(s) && /\d/.test(s) && compact.length <= 32 && /^[A-Z0-9]+$/i.test(compact)) return false;
  return true;
}

function shouldTranslateProductName(name) {
  const s = String(name || '').trim();
  if (!s) return false;
  if (/[çğıöşüÇĞİÖŞÜ]/.test(s)) return true;
  return /\b(akilli|akıllı|oyuncu|kablolu|kablosuz|sarj|şarj|kulaklik|kulaklık|telefon|saat|monitor|monitör|kamera|yazici|yazıcı)\b/i.test(s);
}

// ─── Title-case for dict storage (mirror of _applyTitleCase) ─────────────

function applyTitleCase(text) {
  if (typeof text !== 'string') return text;
  const trimmed = text.trim();
  if (!trimmed) return text;
  if (trimmed.includes('\n')) {
    return text.split('\n').map(applyTitleCase).join('\n');
  }
  let firstWordSeen = false;
  return trimmed.replace(/\S+/g, (token) => {
    const m = token.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u);
    if (!m) return token;
    const [, pre, core, post] = m;
    if (!core) return token;
    if (shouldPreserve(core)) { firstWordSeen = true; return pre + core + post; }
    const lower = core.toLocaleLowerCase();
    const reshaped = firstWordSeen ? lower : lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
    firstWordSeen = true;
    return pre + reshaped + post;
  });
}

// ─── Dict mutators ───────────────────────────────────────────────────────

function dictStore(turkishText, lang, translation) {
  const k = turkishText.toLowerCase().trim();
  const norm = applyTitleCase(String(translation || '').trim());
  if (!norm) return;
  if (!DICT[k]) DICT[k] = {};
  DICT[k][lang] = norm;
}

function dictLookup(turkishText, lang) {
  const k = String(turkishText || '').toLowerCase().trim();
  return DICT[k]?.[lang] || null;
}

function isDictEntry(v) {
  return v && typeof v === 'object' && !Array.isArray(v) &&
    Object.values(v).some(x => typeof x === 'string' && x.trim());
}

// ─── Build per-product translation payload + PATCH PB ────────────────────

async function patchProducts(products) {
  let cursor = 0, done = 0, skipped = 0, patched = 0, failed = 0;
  const total = products.length;
  const startTs = Date.now();
  async function worker(wid) {
    while (cursor < products.length) {
      const p = products[cursor++];
      if (!p) break;
      try {
        if (RESUME && p.multiLangSpecs && Object.keys(p.multiLangSpecs).length) {
          skipped++; done++; continue;
        }
        const payload = buildPayload(p);
        // Skip if nothing to write (no atoms translated)
        const hasContent = TARGET_LANGS.some(l => Object.keys(payload.multiLangSpecs[l] || {}).length);
        if (!hasContent) { skipped++; done++; continue; }
        if (!DRY_RUN) {
          const r = await pbReq('PATCH', `/api/collections/products/records/${p.id}`, payload);
          if (r.status >= 300) throw new Error(`HTTP ${r.status}: ${truncate(JSON.stringify(r.body), 200)}`);
        }
        patched++; done++;
      } catch (e) {
        failed++; done++;
        log('warn', `patch ${p.id} failed: ${e.message || e}`);
      }
      if (done % 50 === 0 || done === total) {
        const elapsed = (Date.now() - startTs) / 1000;
        const rate = done / Math.max(1, elapsed);
        const eta = (total - done) / Math.max(0.1, rate);
        log('info', `patched ${done}/${total} · ok=${patched} skip=${skipped} fail=${failed} · ${rate.toFixed(1)}/s · ETA ${fmtDuration(eta * 1000)}`);
      }
    }
  }
  const workers = Array.from({length: Math.min(PATCH_CONCURRENCY, products.length)}, (_, i) => worker(i+1));
  await Promise.all(workers);
  log('info', `Patch summary: ${patched} patched, ${skipped} skipped, ${failed} failed`);
}

function buildPayload(p) {
  const multiLangSpecs = {};
  const multiLangSections = {};
  const nameTranslated = {};
  for (const lang of TARGET_LANGS) {
    const map = {};
    const addToMap = (text) => {
      const t = String(text || '').trim();
      if (!t) return;
      const tx = lookupOrComposeTranslation(t, lang);
      if (tx && tx !== t) map[t] = tx;
    };
    for (const [k, v] of Object.entries(p.specs || {})) {
      addToMap(k);
      const vs = String(v);
      addToMap(vs);
      if (vs.includes('\n')) for (const line of vs.split('\n')) addToMap(line);
    }
    for (const [k, v] of Object.entries(p.keySpecs || {})) { addToMap(k); addToMap(v); }
    for (const body of Object.values(p.specSections || {})) {
      if (body && typeof body === 'object') {
        for (const [k, v] of Object.entries(body)) {
          addToMap(k);
          const vs = String(v);
          addToMap(vs);
          if (vs.includes('\n')) for (const line of vs.split('\n')) addToMap(line);
        }
      }
    }
    multiLangSpecs[lang] = map;

    const secMap = {};
    for (const secName of Object.keys(p.specSections || {})) {
      secMap[secName] = dictLookup(secName, lang) || secName;
    }
    multiLangSections[lang] = secMap;

    nameTranslated[lang] = shouldTranslateProductName(p.name) ? (dictLookup(p.name, lang) || p.name) : p.name;
  }
  return { multiLangSpecs, multiLangSections, nameTranslated };
}

function lookupOrComposeTranslation(text, lang) {
  const t = String(text || '').trim();
  if (!t) return null;
  const direct = dictLookup(t, lang);
  if (direct) return direct;
  if (!t.includes('\n')) return null;

  let changed = false;
  const lines = String(text).split('\n').map(line => {
    const raw = line.trim();
    if (!raw) return line;
    const tx = dictLookup(raw, lang);
    if (!tx || tx === raw) return line;
    changed = true;
    return line.replace(raw, tx);
  });
  return changed ? lines.join('\n') : null;
}

// ─── Salvage truncated JSON (mirror of _salvageTruncatedJson) ────────────

function salvageTruncatedJson(raw) {
  const text = String(raw || '');
  const out = {};
  const firstBrace = text.indexOf('{');
  if (firstBrace < 0) return out;
  const inner = text.slice(firstBrace + 1);
  let i = 0;
  while (i < inner.length) {
    while (i < inner.length && /[\s,]/.test(inner[i])) i++;
    if (i >= inner.length || inner[i] === '}') break;
    if (inner[i] !== '"') break;
    const keyStart = i;
    i++;
    while (i < inner.length) {
      if (inner[i] === '\\') { i += 2; continue; }
      if (inner[i] === '"') { i++; break; }
      i++;
    }
    const keyRaw = inner.slice(keyStart, i);
    let key;
    try { key = JSON.parse(keyRaw); } catch { break; }
    while (i < inner.length && /\s/.test(inner[i])) i++;
    if (inner[i] !== ':') break;
    i++;
    while (i < inner.length && /\s/.test(inner[i])) i++;
    if (inner[i] !== '{') break;
    const valStart = i;
    let depth = 0, inStr = false, closed = false;
    while (i < inner.length) {
      const c = inner[i];
      if (inStr) {
        if (c === '\\') { i += 2; continue; }
        if (c === '"') inStr = false;
      } else {
        if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}') { depth--; if (depth === 0) { i++; closed = true; break; } }
      }
      i++;
    }
    if (!closed) break;
    const valRaw = inner.slice(valStart, i);
    try { out[key] = JSON.parse(valRaw); } catch { break; }
  }
  return out;
}

// ─── HTTP helper (direct DeepSeek call) ──────────────────────────────────

function postJsonHttps(url, payload, headers = {}, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(payload);
    const req = https.request({
      method: 'POST',
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers,
      },
      timeout: timeoutMs,
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        let body = raw;
        try { body = JSON.parse(raw || '{}'); } catch {}
        resolve({ statusCode: res.statusCode || 0, body });
      });
    });
    req.on('timeout', () => req.destroy(new Error('deepseek_timeout')));
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ─── Utils ───────────────────────────────────────────────────────────────

function resolveDeepSeekKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  try {
    const envFile = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    const m = envFile.match(/DEEPSEEK_API_KEY\s*=\s*([^\n\r]+)/);
    if (m && m[1]) return m[1].trim().replace(/^['"]|['"]$/g, '');
  } catch {}
  try {
    const buildScript = fs.readFileSync(path.join(__dirname, 'build-dictionary.js'), 'utf8');
    const m = buildScript.match(/DEEPSEEK_API_KEY\s*=\s*['"]([^'"]+)['"]/);
    if (m && m[1]) return m[1];
  } catch {}
  return '';
}

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    if (!a.startsWith('--')) continue;
    const i = a.indexOf('=');
    if (i < 0) out[a.slice(2)] = true;
    else out[a.slice(2, i)] = a.slice(i + 1);
  }
  return out;
}

function log(level, msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(11, 19);
  process.stdout.write(`[${ts}] [${level.toUpperCase()}] ${msg}\n`);
}

function truncate(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function fmtDuration(ms) {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}h${m}m`;
  if (m) return `${m}m${sec}s`;
  return `${sec}s`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
