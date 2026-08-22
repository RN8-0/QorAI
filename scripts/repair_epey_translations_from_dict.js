#!/usr/bin/env node
/**
 * Rebuilds Epey product translation payloads from the live PocketBase
 * tr_translation_dict shards. This fixes products that were translated before
 * the dictionary was corrected, without scraping Epey again.
 *
 * Usage:
 *   node scripts/repair_epey_translations_from_dict.js --dry
 *   node scripts/repair_epey_translations_from_dict.js --apply
 */
'use strict';

const fs = require('fs');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const LIMIT = Number((process.argv.find(a => a.startsWith('--limit=')) || '').split('=')[1] || 0);
// Almanca 2026-08-21'de urunden tamamen kaldirildi. Bu betikler PB'deki
// ortak sozluge YAZIYOR; listede 'de' kalirsa bir kez calistirmak Almancayi
// katalog hattina geri sokar.
const LANGS = ['en', 'es', 'fr', 'pt', 'ru'];

function loadEnv(p) {
  if (!fs.existsSync(p)) return {};
  const out = {};
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line.includes('=') || line.trim().startsWith('#')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

const env = { ...loadEnv(path.join(__dirname, '..', 'migration', '.env')), ...process.env };
const PB_URL = (env.POCKETBASE_URL || '').replace(/\/$/, '');
const PB_EMAIL = env.POCKETBASE_ADMIN_EMAIL;
const PB_PASSWORD = env.POCKETBASE_ADMIN_PASSWORD;

if (!PB_URL || !PB_EMAIL || !PB_PASSWORD) {
  console.error('Missing POCKETBASE_URL / POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD');
  process.exit(1);
}

function normalizeKey(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeFoldedKey(s) {
  return String(s || '')
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isObj(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeOutputText(text) {
  return String(text ?? '')
    .replace(/\bSportsts\b/g, 'Sports')
    .replace(/\bSportst\b/g, 'Sport')
    .replace(/\bDolby vision\b/gi, 'Dolby Vision')
    .replace(/\bFree-sync premium\b/gi, 'FreeSync Premium')
    .replace(/\bX-rite\b/gi, 'X-Rite')
    .replace(/%(\d+(?:[.,]\d+)?)/g, '$1%')
    .replace(/TÜV Rheinland Düşük Mavi Işık Sertifikası\s*\(\s*Donanımsal\s*\)/gi, 'TÜV Rheinland Low Blue Light Certification (Hardware)')
    .replace(/TÜV Rheinland Düşük Mavi Işık Sertifikası/gi, 'TÜV Rheinland Low Blue Light Certification')
    .replace(/TÜV Rheinland Yüksek Oyun Performansı/gi, 'TÜV Rheinland High Gaming Performance')
    .replace(/Düşük Mavi Işık Sertifikası\s*\(\s*Donanımsal\s*\)/gi, 'Low Blue Light Certification (Hardware)')
    .replace(/Düşük Mavi Işık Sertifikası/gi, 'Low Blue Light Certification')
    .replace(/Yüksek Oyun Performansı/gi, 'High Gaming Performance')
    .replace(/Donanımsal/gi, 'Hardware')
    .replace(/\bGöz Sağlığı Sertifikasyonu\b/gi, 'Eye Health Certification')
    .replace(/\bEyesafe\s*\(\s*Eye Health Certification\s*\)/gi, 'Eyesafe (Eye Health Certification)')
    .replace(/\bPhycker free\b/gi, 'Flicker Free')
    .replace(/\bFactory color calibration\b/gi, 'Factory Color Calibration')
    .replace(/\bLow power\b/gi, 'Low Power')
    .replace(/\bX-Rite factory color calibration\b/gi, 'X-Rite Factory Color Calibration')
    .replace(/\bGold level game performance & comfort\s*\(\s*ul solutions\s*\)/gi, 'Gold-Level Gaming Performance & Comfort (UL Solutions)')
    .replace(/TÜV Rheinland Titreşimsiz Sertifikasyonu/gi, 'TÜV Rheinland Flicker-Free Certification')
    .replace(/LED Arka Aydınlatma Teknolojisi/gi, 'LED Backlight Technology')
    .replace(/\bCharging Box\b/gi, 'Charging Case')
    .replace(/\bTam Wireless\b/gi, 'True Wireless')
    .replace(/\bUse Mesafesi\b/gi, 'Use Distance')
    .replace(/\bIP Protection Class\s*\(\s*Su\s*\)/gi, 'IP Protection Class (Water)')
    .replace(/\bTere Resistant\b/gi, 'Sweat Resistant')
    .replace(/\bAudioli Assistant Feature\b/gi, 'Voice Assistant Feature')
    .replace(/\bAudioli Assistant Support\b/gi, 'Voice Assistant Support')
    .replace(/\bAudioli\b/gi, 'Audio')
    .replace(/\bAmbient Audio Mode\b/gi, 'Ambient Audio Mode')
    .replace(/\bDeep Head\b/gi, 'Deep Bass')
    .replace(/\bSingle ve Dual Kullanabilme\b/gi, 'Single and Dual Use')
    .replace(/\bAnnound\b/gi, 'Compatible OS')
    .replace(/\bMy phone Find\b/gi, 'Find My Phone')
    .replace(/\bCalculator Machine\b/gi, 'Calculator')
    .replace(/\bTide Graphics\b/gi, 'Tide Charts')
    .replace(/\bLocation Info Emergency Call\b/gi, 'Emergency Call with Location Info')
    .replace(/\bEl with Device Control\b/gi, 'Hand Gesture Device Control')
    .replace(/\bPower Tasarruf Mode\b/gi, 'Power Saving Mode')
    .replace(/\bGymKit Radio Etmeyin Mode\b/gi, 'GymKit, Walkie-Talkie Mode')
    .replace(/\bAudio with Command Verme\b/gi, 'Voice Command')
    .replace(/\bAudio Audio Mesaj\b/gi, 'Voice Message')
    .replace(/\bAudio Not\s*\(\s*Voice Memo\s*\)/gi, 'Voice Memo')
    .replace(/\bAudio SMS Sending\b/gi, 'Voice SMS Sending')
    .replace(/\bBisiklet Eliptik Bisiklet\b/gi, 'Cycling, Elliptical')
    .replace(/\bYoga\s*\(\s*Havuz\s*\)/gi, 'Swimming (Pool)')
    .replace(/\bCar rental\b/gi, 'Skiing')
    .replace(/\bReverse Heading\b/gi, 'Return Route')
    .replace(/\bSmart Sea Water Temperature\b/gi, 'Sea Water Temperature')
    .replace(/\bMatching with bluetooth headset\b/gi, 'Bluetooth Headphone Pairing')
    .replace(/\bBass talk\s*\(\s*walkie-talkie\s*\)/gi, 'Walkie-Talkie')
    .replace(/\bDevice control with hand motions\b/gi, 'Gesture Device Control')
    .replace(/\bTide chart\b/gi, 'Tide Charts')
    .replace(/\bPower saving mode\b/gi, 'Power Saving Mode')
    .replace(/\bCommanding with voice\b/gi, 'Voice Command')
    .replace(/\bSms sending\b/gi, 'SMS Sending')
    .replace(/\bGoogle fast pair\b/gi, 'Google Fast Pair')
    .replace(/\bSingle and double use\b/gi, 'Single and Dual Use')
    .replace(/\bCharging Case time\s*\(\s*general\s*\)/gi, 'Charging Case Runtime (General)')
    .replace(/\bSmart notifications\b/gi, 'Smart Notifications')
    .replace(/\bBuilt-in media player\b/gi, 'Internal Media Player')
    .replace(/\bWorld hours\b/gi, 'World Clock')
    .replace(/\bSearch history\b/gi, 'Call History')
    .replace(/\bCamera control\b/gi, 'Camera Control')
    .replace(/\bVoice alert\b/gi, 'Voice Alert')
    .replace(/\bVoice translation\b/gi, 'Voice Translation')
    .replace(/\bMusic Player Control\b/g, 'Music Player Control')
    .replace(/\bGymkit\b/g, 'GymKit')
    .replace(/\bDigital crown\b/gi, 'Digital Crown')
    .replace(/\bFingerprint non-drinsing coating\b/gi, 'Fingerprint-Resistant Coating')
    .replace(/\bP3\s*\(\s*Wide color vest\s*\)/gi, 'P3 (Wide Color Gamut)')
    .replace(/\bApple pencil\b/gi, 'Apple Pencil')
    .replace(/\bTrue tone\b/gi, 'True Tone')
    .replace(/\bLiquid retina\b/gi, 'Liquid Retina')
    .replace(/\bMulti touch\b/gi, 'Multi-Touch')
    .replace(/\bHlg\b/g, 'HLG')
    .replace(/\bIPS panel\b/gi, 'IPS Panel')
    .replace(/\bLenovo AI now\b/gi, 'Lenovo AI Now')
    .replace(/\bLenovo vantage\b/gi, 'Lenovo Vantage')
    .replace(/\bSmart connect\b/gi, 'Smart Connect')
    .replace(/\bScreen refresh rate\s+(\d+\s*Hz)\b/gi, '$1 Refresh Rate')
    .replace(/\b(\d+)\s+Nit brightness\b/gi, '$1 nit Brightness')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function auth() {
  const r = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASSWORD }),
  });
  if (!r.ok) throw new Error(`auth ${r.status}: ${await r.text()}`);
  return (await r.json()).token;
}

async function pbReq(token, method, url, body) {
  const r = await fetch(`${PB_URL}${url}`, {
    method,
    headers: {
      Authorization: token,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${url} ${r.status}: ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

async function loadDict(token) {
  const data = await pbReq(
    token,
    'GET',
    `/api/collections/public_config/records?perPage=200&filter=${encodeURIComponent('key~"tr_translation_dict__part_"')}&fields=value`,
  );
  const dict = {};
  for (const item of data.items || []) Object.assign(dict, item.value?.terms || {});
  return dict;
}

async function listProducts(token) {
  const out = [];
  let page = 1;
  while (true) {
    const fields = [
      'id', 'name', 'category', 'source', 'sourceUrl', 'sourceLang',
      'specs', 'specSections', 'keySpecs',
      'sourceSpecs', 'sourceSpecSections', 'sourceKeySpecs',
      'multiLangSpecs', 'multiLangSections', 'nameTranslated', 'specsEn',
    ].join(',');
    const data = await pbReq(token, 'GET', `/api/collections/products/records?perPage=200&page=${page}&sort=id&fields=${encodeURIComponent(fields)}`);
    out.push(...(data.items || []));
    if (data.page >= data.totalPages || !data.items?.length) break;
    page += 1;
  }
  return LIMIT ? out.slice(0, LIMIT) : out;
}

function lookup(dict, text, lang) {
  const raw = String(text ?? '').trim();
  if (!raw) return '';
  if (raw.includes('\n')) {
    let changed = false;
    const lines = raw.split(/\r?\n/).map(line => {
      const trimmed = line.trim();
      const tx = lookup(dict, trimmed, lang);
      if (tx && tx !== trimmed) {
        changed = true;
        return line.replace(trimmed, tx);
      }
      return line;
    });
    if (changed) return sanitizeOutputText(lines.join('\n'));
  }
  const direct = dict[normalizeKey(raw)] || dict[normalizeFoldedKey(raw)];
  const value = direct?.[lang];
  if (typeof value === 'string' && value.trim()) return sanitizeOutputText(value);
  return '';
}

function translateName(dict, name, lang) {
  const direct = lookup(dict, name, lang);
  if (direct) return direct;
  if (lang !== 'en') return name || '';
  let out = String(name || '');
  out = out
    .replace(/\bAlüminyum Kasa\b/g, 'Aluminum Case')
    .replace(/\bTitanyum Kasa\b/g, 'Titanium Case')
    .replace(/\bSpor Kordon\b/g, 'Sport Band')
    .replace(/\bOcean Kordon\b/g, 'Ocean Band')
    .replace(/\bAkıllı Saat\b/g, 'Smartwatch')
    .replace(/\bve\b/g, 'and')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return sanitizeOutputText(out || name || '');
}

function collectAtoms(product) {
  const specs = isObj(product.sourceSpecs) && Object.keys(product.sourceSpecs).length ? product.sourceSpecs : (isObj(product.specs) ? product.specs : {});
  const sections = isObj(product.sourceSpecSections) && Object.keys(product.sourceSpecSections).length ? product.sourceSpecSections : (isObj(product.specSections) ? product.specSections : {});
  const keySpecs = isObj(product.sourceKeySpecs) && Object.keys(product.sourceKeySpecs).length ? product.sourceKeySpecs : (isObj(product.keySpecs) ? product.keySpecs : {});
  const atoms = new Set();

  const add = (value) => {
    const s = String(value ?? '').trim();
    if (!s) return;
    atoms.add(s);
    if (s.includes('\n')) {
      for (const line of s.split(/\r?\n/)) {
        const t = line.trim();
        if (t) atoms.add(t);
      }
    }
  };

  for (const [k, v] of Object.entries(specs)) { add(k); add(v); }
  for (const [k, v] of Object.entries(keySpecs)) { add(k); add(v); }
  for (const [section, body] of Object.entries(sections)) {
    add(section);
    if (isObj(body)) for (const [k, v] of Object.entries(body)) { add(k); add(v); }
  }

  return { specs, sections, keySpecs, atoms };
}

function buildPatch(dict, product) {
  const { specs, sections, atoms } = collectAtoms(product);
  const multiLangSpecs = { ...(isObj(product.multiLangSpecs) ? product.multiLangSpecs : {}) };
  const multiLangSections = { ...(isObj(product.multiLangSections) ? product.multiLangSections : {}) };
  const nameTranslated = { ...(isObj(product.nameTranslated) ? product.nameTranslated : {}) };

  for (const lang of LANGS) {
    const map = {};
    for (const atom of atoms) {
      const tx = lookup(dict, atom, lang);
      if (tx && tx !== atom) map[atom] = tx;
    }
    multiLangSpecs[lang] = map;

    const secMap = {};
    for (const section of Object.keys(sections)) {
      secMap[section] = lookup(dict, section, lang) || section;
    }
    multiLangSections[lang] = secMap;

    nameTranslated[lang] = translateName(dict, product.name, lang);
  }
  multiLangSpecs.tr = specs;
  multiLangSections.tr = sections;
  nameTranslated.tr = product.name || '';

  const specsEn = {};
  for (const [k, v] of Object.entries(specs)) {
    const key = lookup(dict, k, 'en') || k;
    const val = lookup(dict, v, 'en') || v;
    specsEn[key] = val;
  }

  return { multiLangSpecs, multiLangSections, nameTranslated, specsEn };
}

function stableJson(value) {
  return JSON.stringify(value || {});
}

function changed(product, patch) {
  return stableJson(product.multiLangSpecs) !== stableJson(patch.multiLangSpecs) ||
    stableJson(product.multiLangSections) !== stableJson(patch.multiLangSections) ||
    stableJson(product.nameTranslated) !== stableJson(patch.nameTranslated) ||
    stableJson(product.specsEn) !== stableJson(patch.specsEn);
}

(async () => {
  const token = await auth();
  const dict = await loadDict(token);
  const products = await listProducts(token);
  let patched = 0;
  let scanned = 0;

  for (const product of products) {
    scanned += 1;
    const patch = buildPatch(dict, product);
    if (!changed(product, patch)) continue;
    patched += 1;
    const label = `${product.category || '-'} · ${product.name || product.id}`;
    if (APPLY) {
      await pbReq(token, 'PATCH', `/api/collections/products/records/${product.id}`, patch);
      console.log(`✓ ${patched}: ${label}`);
    } else {
      console.log(`DRY ${patched}: ${label}`);
    }
  }

  console.log(`${APPLY ? 'Patched' : 'Would patch'} ${patched}/${scanned} products from dict (${Object.keys(dict).length} dict entries).`);
})().catch(err => {
  console.error(err);
  process.exit(1);
});
