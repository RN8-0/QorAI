import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.QORAI_TRANSLATE_PORT || 8797);
const HOST = process.env.QORAI_TRANSLATE_HOST || '127.0.0.1';
const MODEL = process.env.QORAI_TRANSLATE_MODEL || 'Xenova/nllb-200-distilled-600M';
const CACHE_FILE = path.join(__dirname, '.local-translate-cache.json');

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
      env.backends.onnx.wasm.numThreads = Math.max(1, Math.min(4, Number(process.env.QORAI_TRANSLATE_THREADS || 4)));
      console.log(`[local-translate] Loading ${MODEL}. First run downloads the model; later runs use cache.`);
      return pipeline('translation', MODEL);
    });
  }
  return translatorPromise;
}

function cleanText(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

async function translateBatch(texts, targets) {
  const translator = await getTranslator();
  const out = {};
  for (const text of texts) out[text] = {};

  for (const lang of targets) {
    const tgt = LANGS[lang];
    if (!tgt) continue;
    const missing = texts.filter((text) => !cache[text]?.[lang]);
    if (missing.length) {
      for (let i = 0; i < missing.length; i += 8) {
        const batch = missing.slice(i, i + 8);
        const result = await translator(batch, {
          src_lang: 'tur_Latn',
          tgt_lang: tgt,
          max_length: 256,
        });
        const rows = Array.isArray(result) ? result : [result];
        for (let j = 0; j < batch.length; j++) {
          const translated = cleanText(rows[j]?.translation_text || rows[j]?.generated_text || '');
          if (!translated) continue;
          cache[batch[j]] = cache[batch[j]] || {};
          cache[batch[j]][lang] = translated;
        }
        scheduleSave();
        console.log(`[local-translate] ${lang}: ${Math.min(i + batch.length, missing.length)}/${missing.length}`);
      }
    }
    for (const text of texts) {
      if (cache[text]?.[lang]) out[text][lang] = cache[text][lang];
    }
  }
  return out;
}

await loadCache();

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return json(res, 204, {});
    if (req.method === 'GET' && req.url === '/health') {
      return json(res, 200, { ok: true, model: MODEL, cache: Object.keys(cache).length });
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
    const translations = await translateBatch(texts, targets);
    return json(res, 200, {
      provider: 'local-nllb',
      model: MODEL,
      count: texts.length,
      to: targets,
      elapsedMs: Date.now() - started,
      translations,
    });
  } catch (err) {
    console.error('[local-translate] request failed:', err);
    return json(res, 500, { error: 'local_translate_failed', detail: String(err?.message || err) });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[local-translate] Listening on http://${HOST}:${PORT}`);
});
