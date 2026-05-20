import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.QORAI_TRANSLATE_PORT || 8797);
const HOST = process.env.QORAI_TRANSLATE_HOST || '127.0.0.1';
const MODEL = process.env.QORAI_TRANSLATE_MODEL || 'Xenova/nllb-200-distilled-600M';
const CACHE_FILE = path.join(__dirname, '.local-translate-cache.json');
const INFERENCE_BATCH = Math.max(1, Number(process.env.QORAI_TRANSLATE_BATCH || 24));
const MAX_LEN = Math.max(64, Number(process.env.QORAI_TRANSLATE_MAX_LEN || 192));

const LANGS = {
  en: 'eng_Latn',
  de: 'deu_Latn',
  es: 'spa_Latn',
  fr: 'fra_Latn',
  it: 'ita_Latn',
  ja: 'jpn_Jpan',
  nl: 'nld_Latn',
  pl: 'pol_Latn',
  pt: 'por_Latn',
  sv: 'swe_Latn',
  ar: 'arb_Arab',
};

let translatorPromise = null;
let cache = {};
let cacheDirty = false;
let saveTimer = null;

// Live job state — exposed via GET /status so the admin UI can show real
// per-language / per-batch progress while a /translate call is in flight.
const STATE = {
  busy: false,
  startedAt: 0,
  jobId: 0,
  totalTexts: 0,
  totalTargets: 0,
  lang: null,
  langIndex: 0,
  langTotal: 0,
  batchDone: 0,
  batchTotal: 0,
  itemsDone: 0,
  itemsTotal: 0,
  lastBatchMs: 0,
  avgBatchMs: 0,
  lastUpdate: 0,
  modelReady: false,
  warming: false,
};

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Private-Network': 'true',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function loadCache() {
  try {
    cache = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8')) || {};
  } catch {
    cache = {};
  }
}

function scheduleSave() {
  cacheDirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (!cacheDirty) return;
    cacheDirty = false;
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache), 'utf8').catch(() => {});
  }, 1000);
}

async function getTranslator() {
  if (!translatorPromise) {
    translatorPromise = import('@xenova/transformers').then(async ({ pipeline, env }) => {
      env.allowLocalModels = true;
      env.allowRemoteModels = true;
      env.backends.onnx.wasm.numThreads = Math.max(1, Math.min(8, Number(process.env.QORAI_TRANSLATE_THREADS || 4)));
      console.log(`[local-translate] Loading ${MODEL}. First run downloads the model; later runs use cache.`);
      const t = await pipeline('translation', MODEL);
      console.log(`[local-translate] Model ready · threads=${env.backends.onnx.wasm.numThreads} · batch=${INFERENCE_BATCH} · maxLen=${MAX_LEN}`);
      return t;
    });
  }
  return translatorPromise;
}

async function warmUp() {
  if (STATE.modelReady || STATE.warming) return;
  STATE.warming = true;
  try {
    const t = await getTranslator();
    // Tiny dummy inference to compile the ONNX graph + JIT WASM kernels.
    await t(['merhaba'], { src_lang: 'tur_Latn', tgt_lang: 'eng_Latn', max_length: 32 });
    STATE.modelReady = true;
    console.log('[local-translate] Warm-up complete — ready for traffic.');
  } catch (e) {
    console.error('[local-translate] Warm-up failed:', e?.message || e);
  } finally {
    STATE.warming = false;
  }
}

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

function resetState(totalTexts, targets) {
  STATE.busy = true;
  STATE.startedAt = Date.now();
  STATE.jobId++;
  STATE.totalTexts = totalTexts;
  STATE.totalTargets = targets.length;
  STATE.lang = null;
  STATE.langIndex = 0;
  STATE.langTotal = targets.length;
  STATE.batchDone = 0;
  STATE.batchTotal = 0;
  STATE.itemsDone = 0;
  STATE.itemsTotal = totalTexts * targets.length;
  STATE.lastBatchMs = 0;
  STATE.avgBatchMs = 0;
  STATE.lastUpdate = Date.now();
}

function endState() {
  STATE.busy = false;
  STATE.lastUpdate = Date.now();
}

async function translateBatch(texts, targets) {
  const translator = await getTranslator();
  const out = {};
  for (const text of texts) out[text] = {};

  resetState(texts.length, targets);

  for (let li = 0; li < targets.length; li++) {
    const lang = targets[li];
    const tgt = LANGS[lang];
    if (!tgt) continue;
    STATE.lang = lang;
    STATE.langIndex = li;
    const missing = texts.filter((text) => !cache[text]?.[lang]);
    STATE.batchDone = 0;
    STATE.batchTotal = Math.ceil(missing.length / INFERENCE_BATCH);
    if (missing.length) {
      let batchSeen = 0;
      let totalMs = 0;
      for (let i = 0; i < missing.length; i += INFERENCE_BATCH) {
        const batch = missing.slice(i, i + INFERENCE_BATCH);
        const t0 = Date.now();
        const result = await translator(batch, {
          src_lang: 'tur_Latn',
          tgt_lang: tgt,
          max_length: MAX_LEN,
        });
        const dt = Date.now() - t0;
        const rows = Array.isArray(result) ? result : [result];
        for (let j = 0; j < batch.length; j++) {
          const translated = cleanText(rows[j]?.translation_text || rows[j]?.generated_text || '');
          if (!translated) continue;
          cache[batch[j]] = cache[batch[j]] || {};
          cache[batch[j]][lang] = translated;
        }
        scheduleSave();
        batchSeen++;
        totalMs += dt;
        STATE.batchDone = batchSeen;
        STATE.lastBatchMs = dt;
        STATE.avgBatchMs = Math.round(totalMs / batchSeen);
        STATE.itemsDone += batch.length;
        STATE.lastUpdate = Date.now();
        console.log(`[local-translate] ${lang}: ${Math.min(i + batch.length, missing.length)}/${missing.length} (${dt}ms)`);
      }
    } else {
      STATE.itemsDone += texts.length; // all cached
      STATE.lastUpdate = Date.now();
    }
    for (const text of texts) {
      if (cache[text]?.[lang]) out[text][lang] = cache[text][lang];
    }
  }
  return out;
}

await loadCache();

// Kick off the model load in the background so the first /translate is fast.
warmUp().catch(() => {});

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, {
        ok: true,
        model: MODEL,
        cache: Object.keys(cache).length,
        modelReady: STATE.modelReady,
        warming: STATE.warming,
        batch: INFERENCE_BATCH,
      });
    }
    if (req.method === 'GET' && req.url === '/status') {
      const now = Date.now();
      const elapsedMs = STATE.busy ? now - STATE.startedAt : 0;
      const total = STATE.itemsTotal || 1;
      const done = STATE.itemsDone;
      const ratio = total ? done / total : 0;
      const etaMs = STATE.busy && ratio > 0 ? Math.round(elapsedMs / ratio - elapsedMs) : 0;
      return json(res, 200, {
        ...STATE,
        elapsedMs,
        progress: ratio,
        etaMs,
        cacheSize: Object.keys(cache).length,
        ts: now,
      });
    }
    if (req.method !== 'POST' || req.url !== '/translate') {
      return json(res, 404, { error: 'not_found' });
    }
    const body = await readBody(req);
    const texts = [...new Set((Array.isArray(body.texts) ? body.texts : []).map(cleanText).filter(Boolean))].slice(0, 250);
    const targets = (Array.isArray(body.to) ? body.to : []).map((x) => String(x || '').toLowerCase()).filter((x) => LANGS[x]);
    if (!texts.length) return json(res, 400, { error: 'texts_required' });
    if (!targets.length) return json(res, 400, { error: 'targets_required' });
    const started = Date.now();
    try {
      const translations = await translateBatch(texts, targets);
      return json(res, 200, {
        provider: 'local-nllb',
        model: MODEL,
        count: texts.length,
        to: targets,
        elapsedMs: Date.now() - started,
        translations,
      });
    } finally {
      endState();
    }
  } catch (err) {
    endState();
    console.error('[local-translate] request failed:', err);
    return json(res, 500, { error: 'local_translate_failed', detail: String(err?.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[local-translate] Listening on http://${HOST}:${PORT} · batch=${INFERENCE_BATCH} · maxLen=${MAX_LEN}`);
});
