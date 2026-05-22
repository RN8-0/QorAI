import { pb } from './pocketbase';

const MANIFEST_KEY = 'tr_translation_dict_manifest';
const SHARD_PREFIX = 'tr_translation_dict__part_';

let loaded = false;
let loading = null;
const dict = new Map();

const BOOL_LABELS = {
  en: ['Yes', 'No'],
  de: ['Ja', 'Nein'],
  es: ['Sí', 'No'],
  fr: ['Oui', 'Non'],
  it: ['Sì', 'No'],
  ja: ['はい', 'いいえ'],
  nl: ['Ja', 'Nee'],
  pl: ['Tak', 'Nie'],
  pt: ['Sim', 'Não'],
  sv: ['Ja', 'Nej'],
  ar: ['نعم', 'لا'],
};

function norm(text) {
  return String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export async function ensureSpecDictionary() {
  if (loaded) return true;
  if (loading) return loading;
  loading = (async () => {
    try {
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

