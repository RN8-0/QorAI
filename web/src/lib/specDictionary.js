// PocketBase yalnizca ensureSpecDictionary() icinde (async) kullaniliyor;
// statik import SDK'yi kritik yola sokuyordu — bkz. lib/pbLazy.js.
import { pbMod } from './pbLazy';

const MANIFEST_KEY = 'tr_translation_dict_manifest';
const SHARD_PREFIX = 'tr_translation_dict__part_';

let loaded = false;
let loading = null;
const dict = new Map();

// Specs are TR + EN only. trSpec
// returns early for 'tr'; every other locale falls back to the English pair.
const BOOL_LABELS = {
  en: ['Yes', 'No'],
};

const FALLBACKS = {
  'transistör mesafesi': { en: 'Process Node' },
  'mesafesi': { en: 'Process Node' },
  'çarpan kilidi': { en: 'Multiplier Lock' },
  'kilidi': { en: 'Multiplier Lock' },
  'ısı yayma kapasitesi': { en: 'Thermal Design Power' },
  'ısı yayma kapasitesi (tdp)': { en: 'Thermal Design Power (TDP)' },
  'yapay zeka (yz)': { en: 'Artificial Intelligence (AI)' },
  'desteklediği teknolojiler': { en: 'Supported Technologies' },
  'passmark puanı (tekil)': { en: 'PassMark Single-Thread Score' },
  'passmark puanı (çoğul)': { en: 'PassMark Multi-Thread Score' },
  'çıkış dönemi': { en: 'Release Quarter' },
  'çıkış yılı': { en: 'Release Year' },
  'jenerasyon': { en: 'Generation' },
  'işlemci ailesi': { en: 'Processor Family' },
  'işlemci mimarisi': { en: 'Processor Architecture' },
  'işlemci modeli': { en: 'Processor Model' },
  'işlemci serisi': { en: 'Processor Series' },
  'işlemci türü': { en: 'Processor Type' },
  'işlemci üst modeli': { en: 'Processor Parent Model' },
  'temel frekans': { en: 'Base Frequency' },
  'artırılmış frekans': { en: 'Boost Frequency' },
  'iş parçacığı': { en: 'Threads' },
  'çekirdek': { en: 'CPU cores' },
  'performans çekirdeği': { en: 'Performance Core' },
  'verimlilik çekirdeği': { en: 'Efficiency Core' },
  'önbellek l1': { en: 'Cache L1' },
  'önbellek l2': { en: 'Cache L2' },
  'önbellek l3': { en: 'Cache L3' },
  'dahili grafik işlemci': { en: 'Integrated Graphics Processor' },
  'grafik işlemci modeli': { en: 'Graphics Processor Model' },
  'sıcaklık': { en: 'Temperature' },
  'soket': { en: 'Socket' },
  'pcie hattı sayısı': { en: 'PCIe Lane Count' },
  'pcie sürümü': { en: 'PCIe Version' },
  'bellek hızı': { en: 'Memory Speed' },
  '2.bellek hızı': { en: '2.Memory Speed' },
  'bellek türü': { en: 'Memory Type' },
  '2.bellek türü': { en: '2.Memory Type' },
  'bellek kanalı': { en: 'Memory Channel' },
  'ecc bellek desteği': { en: 'ECC Memory Support' },
};

function norm(text) {
  return String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function ensureSpecDictionary() {
  if (loaded) return true;
  if (loading) return loading;
  loading = (async () => {
    try {
      const { pb } = await pbMod();
      const manifest = await pb.collection('public_config').getFirstListItem(
        `key="${MANIFEST_KEY}"`,
        { fields: 'value' },
      );
      const value = manifest?.value || manifest?.data?.value || {};
      const batchId = value.batchId;
      const totalShards = Number(value.totalShards || 0);
      if (!batchId || !totalShards) return false;

      for (let i = 0; i < totalShards; i += 1) {
        const key = `${SHARD_PREFIX}${String(i).padStart(4, '0')}`;
        const shard = await pb.collection('public_config').getFirstListItem(
          `key="${key}"`,
          { fields: 'value' },
        );
        const shardValue = shard?.value || shard?.data?.value || {};
        if (shardValue.batchId !== batchId) continue;
        const terms = shardValue.terms || {};
        Object.entries(terms).forEach(([source, translations]) => {
          if (!translations || typeof translations !== 'object') return;
          const sourceKey = norm(source).toLowerCase();
          if (!sourceKey) return;
          dict.set(sourceKey, translations);
        });
      }
      loaded = dict.size > 0;
      return loaded;
    } catch (e) {
      console.warn('[specDictionary] unavailable', e);
      return false;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

// Ortak spec i18n modulu (admin/js/spec_i18n.js) sozlugu DUZ NESNE olarak
// bekliyor — admin panelindeki window.QorAiDict.cache() ile ayni sekil.
// Map'ten her cagrida nesne uretmek 40k+ terimde pahali, bu yuzden boyut
// degismedikce ezberlenir.
let _cacheObj = null;
let _cacheSize = -1;
export function specDictCache() {
  if (!dict.size) return null;
  if (_cacheSize === dict.size && _cacheObj) return _cacheObj;
  const out = {};
  for (const [k, v] of dict) out[k] = v;
  _cacheObj = out;
  _cacheSize = dict.size;
  return out;
}

function boolLabel(text, lang) {
  const key = norm(text).toLowerCase();
  const yes = ['var', 'evet', 'yes', 'true'].includes(key);
  const no = ['yok', 'hayır', 'hayir', 'no', 'false'].includes(key);
  if (!yes && !no) return null;
  const pair = BOOL_LABELS[lang] || BOOL_LABELS.en;
  return yes ? pair[0] : pair[1];
}

export function trSpec(text, lang) {
  const code = String(lang || 'en').slice(0, 2).toLowerCase();
  if (code === 'tr') return String(text || '');
  const bool = boolLabel(text, code);
  if (bool) return bool;
  const raw = String(text || '');
  const fallback = FALLBACKS[norm(raw).toLowerCase()]?.[code];
  if (fallback) return fallback;
  const direct = dict.get(norm(raw).toLowerCase())?.[code];
  if (direct) return direct;
  if (!raw.includes('\n')) return raw;
  let changed = false;
  const lines = raw.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    const translated = trSpec(trimmed, code);
    if (!trimmed || translated === trimmed) return line;
    changed = true;
    return line.replace(trimmed, translated);
  });
  return changed ? lines.join('\n') : raw;
}
