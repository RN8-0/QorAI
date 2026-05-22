#!/usr/bin/env node
/**
 * Translate exported Epey term JSON files with any OpenAI-compatible chat API.
 *
 * This script only reads input JSON files and writes translated JSON files.
 * It does not touch PocketBase and does not modify product specs.
 *
 * Examples:
 *   $env:TRANSLATE_PROVIDER="deepseek"
 *   $env:TRANSLATE_MODEL="deepseek-chat"
 *   node scripts/translate_epey_terms_openai_compatible.mjs --limitFiles=1 --items=20
 *
 *   $env:TRANSLATE_PROVIDER="openai"
 *   $env:OPENAI_API_KEY="..."
 *   $env:TRANSLATE_MODEL="gpt-5.4-mini"
 *   node scripts/translate_epey_terms_openai_compatible.mjs
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const desktop = path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Desktop');
const DEFAULT_INPUT = path.join(desktop, 'DEEPSEEK_UPLOAD_EPEY_TERMS');
const DEFAULT_OUTPUT = path.join(desktop, 'EPEY_TERMS_TRANSLATED');

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [k, ...rest] = arg.replace(/^--/, '').split('=');
    return [k, rest.length ? rest.join('=') : 'true'];
  }),
);

const INPUT_DIR = path.resolve(args.get('input') || DEFAULT_INPUT);
const OUTPUT_DIR = path.resolve(args.get('output') || DEFAULT_OUTPUT);
const LIMIT_FILES = Number(args.get('limitFiles') || 0);
const LIMIT_ITEMS = Number(args.get('items') || 0);
const BATCH_SIZE = Number(args.get('batch') || process.env.TRANSLATE_BATCH || 40);
const FILE_CONCURRENCY = Number(args.get('concurrency') || process.env.TRANSLATE_CONCURRENCY || 3);
const RETRIES = Number(args.get('retries') || 3);
const PROVIDER = String(args.get('provider') || process.env.TRANSLATE_PROVIDER || 'deepseek').toLowerCase();
const MODEL = String(args.get('model') || process.env.TRANSLATE_MODEL || (PROVIDER === 'openai' ? 'gpt-5.4-mini' : 'deepseek-chat'));
const DRY_RUN = args.has('dry-run');

function loadDotEnv(file) {
  try {
    const raw = require('node:fs').readFileSync(file, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (key && process.env[key] == null) process.env[key] = value;
    }
  } catch {
    // optional
  }
}

loadDotEnv(path.join(process.cwd(), '.env'));

const PROVIDERS = {
  deepseek: {
    url: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions',
    key: process.env.DEEPSEEK_API_KEY,
  },
  openai: {
    url: process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions',
    key: process.env.OPENAI_API_KEY,
  },
};

const cfg = PROVIDERS[PROVIDER];
if (!cfg) {
  throw new Error(`Unknown provider "${PROVIDER}". Use deepseek or openai.`);
}
if (!cfg.key && !DRY_RUN) {
  throw new Error(`Missing API key for ${PROVIDER}. Set ${PROVIDER === 'openai' ? 'OPENAI_API_KEY' : 'DEEPSEEK_API_KEY'}.`);
}

const LANGS = ['en', 'de', 'es', 'fr', 'it', 'ja', 'nl', 'pl', 'pt', 'sv', 'ar'];

const SYSTEM_PROMPT = `You are a precise technical product specification translator.
Return valid JSON only.
Never change item id.
Return only an array of objects with: id, translations.
Fill only translations.en/de/es/fr/it/ja/nl/pl/pt/sv/ar.
Preserve brand names, model names, model codes, CPU/GPU names, units, standards, storage/RAM variants, numbers, URLs, EAN, GTIN, MPN, and SKU.
Preserve technical tokens such as USB-C, HDMI, OLED, AMOLED, IPS, HDR10+, Wi-Fi, Bluetooth, NFC, LTE, 5G, PCIe, NVMe, DDR, GDDR, IP68, Hz, GHz, GB, TB, mAh, W, MP, fps.
Translate Turkish spec labels naturally and shortly.
Translate booleans: Var/Evet means yes; Yok/Hayır means no.
If a source is already language-neutral or purely technical, copy it unchanged to every language.
For product names, translate only Turkish descriptive words; keep brand/model tokens unchanged.`;

function chunkArray(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function stripFences(text) {
  return String(text || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function normalizeTranslations(item) {
  item.translations = item.translations && typeof item.translations === 'object' ? item.translations : {};
  for (const lang of LANGS) {
    item.translations[lang] = String(item.translations[lang] || '').trim();
  }
  return item;
}

function validateReturned(originalBatch, returned) {
  if (!Array.isArray(returned)) throw new Error('model did not return a JSON array');
  const byId = new Map(returned.map((item) => [String(item?.id || ''), item]));
  return originalBatch.map((original) => {
    const next = byId.get(original.id);
    if (!next) throw new Error(`missing returned id ${original.id}`);
    const merged = {
      ...original,
      translations: {
        ...original.translations,
        ...(next.translations || {}),
      },
    };
    return normalizeTranslations(merged);
  });
}

async function callModel(batch) {
  const compactBatch = batch.map((item) => ({
    id: item.id,
    source: item.source,
    type: item.type,
    translations: item.translations,
  }));
  const body = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Translate this JSON array. Return the same JSON array, but only keep id and translations in the result:\n${JSON.stringify(compactBatch)}`,
      },
    ],
    temperature: 0,
    max_tokens: Number(process.env.TRANSLATE_MAX_TOKENS || 32000),
    response_format: { type: 'json_object' },
  };

  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.key}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${PROVIDER} HTTP ${res.status}: ${JSON.stringify(data).slice(0, 600)}`);
  }

  const content = data.choices?.[0]?.message?.content || '';
  const parsed = JSON.parse(stripFences(content));
  const arr = Array.isArray(parsed) ? parsed : (parsed.items || parsed.data || parsed.terms);
  return validateReturned(batch, arr);
}

async function translateBatch(batch, depth = 0) {
  if (DRY_RUN) {
    return batch.map((item) => {
      const copy = normalizeTranslations({ ...item, translations: { ...item.translations } });
      for (const lang of LANGS) copy.translations[lang] = copy.source;
      return copy;
    });
  }

  let lastError = null;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      return await callModel(batch);
    } catch (err) {
      lastError = err;
      const waitMs = Math.min(30000, 1500 * attempt * attempt);
      console.warn(`[warn] batch failed attempt ${attempt}/${RETRIES}: ${err.message}`);
      if (attempt < RETRIES) await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  if (batch.length <= 1) {
    const item = normalizeTranslations({ ...batch[0], translations: { ...batch[0].translations } });
    for (const lang of LANGS) item.translations[lang] = item.source;
    console.warn(`[warn] falling back to source for ${item.id}: ${lastError?.message || 'unknown error'}`);
    return [item];
  }

  const mid = Math.ceil(batch.length / 2);
  console.warn(`[warn] splitting batch of ${batch.length} after failures: ${lastError?.message || 'unknown error'}`);
  const left = await translateBatch(batch.slice(0, mid), depth + 1);
  const right = await translateBatch(batch.slice(mid), depth + 1);
  return [...left, ...right];
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const names = (await fs.readdir(INPUT_DIR))
    .filter((name) => /^epey_translate_\d+\.json$/i.test(name))
    .sort();
  const files = LIMIT_FILES ? names.slice(0, LIMIT_FILES) : names;
  console.log(`[translate] provider=${PROVIDER} model=${MODEL} files=${files.length} batch=${BATCH_SIZE} dryRun=${DRY_RUN}`);
  console.log(`[translate] input=${INPUT_DIR}`);
  console.log(`[translate] output=${OUTPUT_DIR}`);

  for (const file of files) {
    const inputPath = path.join(INPUT_DIR, file);
    const outputPath = path.join(OUTPUT_DIR, file);
    const errPath = path.join(OUTPUT_DIR, `${file}.error.json`);

    try {
      await fs.access(outputPath);
      console.log(`[skip] ${file} already translated`);
      continue;
    } catch {
      // continue
    }

    const itemsAll = JSON.parse(await fs.readFile(inputPath, 'utf8'));
    const items = LIMIT_ITEMS ? itemsAll.slice(0, LIMIT_ITEMS) : itemsAll;
    const batches = chunkArray(items, BATCH_SIZE);
    const translated = new Array(items.length);
    console.log(`[file] ${file}: items=${items.length}, batches=${batches.length}, concurrency=${FILE_CONCURRENCY}`);

    let cursor = 0;
    const workers = Array.from({ length: Math.min(FILE_CONCURRENCY, batches.length) }, async () => {
      while (true) {
        const batchIndex = cursor++;
        if (batchIndex >= batches.length) break;
        const start = batchIndex * BATCH_SIZE;
        const result = await translateBatch(batches[batchIndex]);
        for (let i = 0; i < result.length; i++) {
          translated[start + i] = result[i];
        }
        console.log(`  [ok] ${file} batch ${batchIndex + 1}/${batches.length} total=${Math.min(start + result.length, items.length)}`);
      }
    });

    await Promise.all(workers);
    await fs.writeFile(outputPath, JSON.stringify(translated, null, 2), 'utf8');
    try { await fs.rm(errPath); } catch {}
  }
}

main().catch(async (err) => {
  console.error('[fatal]', err);
  process.exitCode = 1;
});
