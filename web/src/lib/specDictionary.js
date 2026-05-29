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

const FALLBACKS = {
  'transistör mesafesi': { en: 'Process Node', de: 'Fertigungsprozess' },
  'mesafesi': { en: 'Process Node', de: 'Fertigungsprozess' },
  'çarpan kilidi': { en: 'Multiplier Lock', de: 'Multiplikatorsperre' },
  'kilidi': { en: 'Multiplier Lock', de: 'Multiplikatorsperre' },
  'ısı yayma kapasitesi': { en: 'Thermal Design Power', de: 'Thermal Design Power' },
  'ısı yayma kapasitesi (tdp)': { en: 'Thermal Design Power (TDP)', de: 'Thermal Design Power (TDP)' },
  'yapay zeka (yz)': { en: 'Artificial Intelligence (AI)', de: 'Künstliche Intelligenz (KI)' },
  'desteklediği teknolojiler': { en: 'Supported Technologies', de: 'Unterstützte Technologien' },
  'passmark puanı (tekil)': { en: 'PassMark Single-Thread Score', de: 'PassMark Single-Thread-Wert' },
  'passmark puanı (çoğul)': { en: 'PassMark Multi-Thread Score', de: 'PassMark Multi-Thread-Wert' },
  'çıkış dönemi': { en: 'Release Quarter', de: 'Erscheinungsquartal' },
  'çıkış yılı': { en: 'Release Year', de: 'Erscheinungsjahr' },
  'jenerasyon': { en: 'Generation', de: 'Generation' },
  'işlemci ailesi': { en: 'Processor Family', de: 'Prozessorfamilie' },
  'işlemci mimarisi': { en: 'Processor Architecture', de: 'Prozessorarchitektur' },
  'işlemci modeli': { en: 'Processor Model', de: 'Prozessormodell' },
  'işlemci serisi': { en: 'Processor Series', de: 'Prozessorserie' },
  'işlemci türü': { en: 'Processor Type', de: 'Prozessortyp' },
  'işlemci üst modeli': { en: 'Processor Parent Model', de: 'Prozessor-Basismodell' },
  'temel frekans': { en: 'Base Frequency', de: 'Basistakt' },
  'artırılmış frekans': { en: 'Boost Frequency', de: 'Boost-Takt' },
  'iş parçacığı': { en: 'Threads', de: 'Threads' },
  'çekirdek': { en: 'CPU cores', de: 'CPU-Kerne' },
  'performans çekirdeği': { en: 'Performance Core', de: 'Performance-Kerne' },
  'verimlilik çekirdeği': { en: 'Efficiency Core', de: 'Effizienz-Kerne' },
  'önbellek l1': { en: 'Cache L1', de: 'Cache L1' },
  'önbellek l2': { en: 'Cache L2', de: 'Cache L2' },
  'önbellek l3': { en: 'Cache L3', de: 'Cache L3' },
  'dahili grafik işlemci': { en: 'Integrated Graphics Processor', de: 'Integrierter Grafikprozessor' },
  'grafik işlemci modeli': { en: 'Graphics Processor Model', de: 'Grafikprozessormodell' },
  'sıcaklık': { en: 'Temperature', de: 'Temperatur' },
  'soket': { en: 'Socket', de: 'Sockel' },
  'pcie hattı sayısı': { en: 'PCIe Lane Count', de: 'PCIe-Lane-Anzahl' },
  'pcie sürümü': { en: 'PCIe Version', de: 'PCIe-Version' },
  'bellek hızı': { en: 'Memory Speed', de: 'Speichergeschwindigkeit' },
  '2.bellek hızı': { en: '2.Memory Speed', de: '2.Speichergeschwindigkeit' },
  'bellek türü': { en: 'Memory Type', de: 'Speichertyp' },
  '2.bellek türü': { en: '2.Memory Type', de: '2.Speichertyp' },
  'bellek kanalı': { en: 'Memory Channel', de: 'Speicherkanäle' },
  'ecc bellek desteği': { en: 'ECC Memory Support', de: 'ECC-Speicherunterstützung' },
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
