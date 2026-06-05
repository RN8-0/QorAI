// ─────────────────────────────────────────────────────────────────────────────
//  Re-compute Typesense browse filters (filterTokens + screenSizeValue +
//  batteryCapacityValue + weightValueKg) for every product.
//
//  Most products were bulk-indexed by ts_fast_upsert / admin ts_client, which
//  only emitted the `socket:` token — so category filtering had almost no data.
//  This ports the FULL extraction from pb_hooks/typesense_sync.pb.js and writes
//  the tokens straight into each Typesense document (partial update), so the
//  category sidebar can offer rich, epey-style filters across every category.
//
//  Usage:  node scripts/reindex_filter_tokens.mjs            # all categories
//          node scripts/reindex_filter_tokens.mjs --dry      # preview counts
//          node scripts/reindex_filter_tokens.mjs --cats smartphones,laptops
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', 'migration', '.env'), 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const TS_URL = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const K = ENV.TYPESENSE_API_KEY;
const HDR = { 'X-TYPESENSE-API-KEY': K };
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const CONC = (() => { const i = args.indexOf('--concurrency'); return i >= 0 ? Number(args[i + 1]) : 8; })();
const CAT_FILTER = (() => { const i = args.indexOf('--cats'); return i >= 0 ? args[i + 1].split(',').map((s) => s.trim()) : null; })();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── extraction (ported verbatim from pb_hooks/typesense_sync.pb.js) ───────────
function _normalizeBrowseText(v) { return String(v || '').toLowerCase().replace(/[^a-z0-9+]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function _flattenBrowseSpecs(pb) {
  const flat = {};
  const add = (o) => o && Object.keys(o).forEach((k) => { const v = o[k]; if (v != null) flat[String(k)] = String(v); });
  add(pb.specs); add(pb.keySpecs);
  const sec = pb.specSections || {};
  Object.keys(sec).forEach((s) => { if (sec[s] && typeof sec[s] === 'object') add(sec[s]); });
  return flat;
}
function _findBrowseSpecValues(keys, flat) {
  const out = [], seen = {};
  keys.forEach((key) => {
    if (flat[key] && !seen[flat[key]]) { seen[flat[key]] = true; out.push(flat[key]); }
    const nk = _normalizeBrowseText(key), ck = nk.replace(/\s+/g, '');
    Object.keys(flat).forEach((sk) => {
      const nsk = _normalizeBrowseText(sk), csk = nsk.replace(/\s+/g, '');
      if (nsk === nk || nsk.indexOf(nk) !== -1 || nk.indexOf(nsk) !== -1 || csk === ck || csk.indexOf(ck) !== -1 || ck.indexOf(csk) !== -1) {
        const v = flat[sk]; if (v && !seen[v]) { seen[v] = true; out.push(v); }
      }
    });
  });
  return out;
}
function _num(v) { const m = String(v || '').match(/(\d+(?:[.,]\d+)?)/); return m ? parseFloat(m[1].replace(',', '.')) : null; }
function _normScreenKey(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/[ıİ]/g, 'i')
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[şŞ]/g, 's')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function _isScreenSizeSpecKey(key) {
  const n = _normScreenKey(key);
  if (!n) return false;
  if (/(width|height|genis|en\b|boy\b|area|alani|cm2|cm 2|m2|m 2|ratio|oran|displayport|usb|thunderbolt)/.test(n)) return false;
  const aliases = [
    'screen size',
    'display size',
    'display diagonal',
    'screen diagonal',
    'diagonal',
    'ekran boyutu',
    'display boyutu',
    'bildschirmgrosse',
    'bildschirmgroesse',
    'bildschirmdiagonale',
  ];
  if (aliases.includes(n)) return true;
  return aliases.some((alias) =>
    n.startsWith(`${alias} `) &&
    /\b(in|inc|inch|zoll|cm|diagonal|diagonale)\b/.test(n.slice(alias.length + 1))
  );
}
function _screenSizeNumber(value, allowUnitless = false) {
  const raw = String(value || '').trim();
  const v = raw.toLowerCase();
  if (!v) return null;
  if (/(cm²|cm2|m²|m2|mm\b|piksel|pixel|px|mp\b|mah|hz|nit|ppi|cd\/m|display\s*port|usb|thunderbolt|%|x\s*\d)/i.test(v)) return null;
  const m = raw.match(/(\d+(?:[.,]\d+)?)/);
  if (!m) return null;
  const num = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(num) || num <= 0) return null;
  if (/(inch|inç|zoll|"|″|\d+(?:[.,]\d+)?\s*in\b)/i.test(raw)) {
    return num >= 1 && num <= 120 ? num : null;
  }
  if (/\bcm\b/i.test(raw)) {
    const inches = num / 2.54;
    return inches >= 1 && inches <= 120 ? Math.round(inches * 10) / 10 : null;
  }
  return allowUnitless && num >= 1 && num <= 120 ? num : null;
}
function _screenSizeFromFlat(flat) {
  for (const [key, value] of Object.entries(flat || {})) {
    if (!_isScreenSizeSpecKey(key)) continue;
    const parsed = _screenSizeNumber(value, true);
    if (parsed !== null) return parsed;
  }
  return null;
}
function _bool(v) { const n = _normalizeBrowseText(v); if (!n) return null; if (['no', 'false', 'hayir', 'yok', 'n a', '-'].includes(n)) return false; return true; }
function _storageToken(v) { const n = _normalizeBrowseText(v); if (!n) return null; if (n.includes('2 tb') || n.includes('2tb')) return '2_tb'; if (n.includes('1 tb') || n.includes('1tb')) return '1_tb'; const x = _num(v); return x === null ? null : Math.round(x) + '_gb'; }
function _osToken(v) { const n = _normalizeBrowseText(v); if (!n) return null; if (n.includes('chrome os') || n.includes('chromeos')) return 'chromeos'; if (n.includes('ipad os') || n.includes('ipados')) return 'ipados'; if (n.includes('mac os') || n.includes('macos') || n.includes('os x')) return 'macos'; if (n.includes('windows')) return 'windows'; if (n.includes('android')) return 'android'; if (n.includes('linux')) return 'linux'; if (n.includes('ios') || n.includes('iphone os')) return 'ios'; return null; }
function _cpuBrand(v) { const n = _normalizeBrowseText(v); if (!n) return null; if (n.includes('intel')) return 'intel'; if (n.includes('amd')) return 'amd'; if (n.includes('apple')) return 'apple'; if (n.includes('qualcomm') || n.includes('snapdragon')) return 'qualcomm'; if (n.includes('mediatek')) return 'mediatek'; if (n.includes('exynos')) return 'exynos'; return null; }
function _gpuType(v) { const n = _normalizeBrowseText(v); if (!n) return null; if (['rtx', 'gtx', 'geforce', 'radeon', 'arc', 'dedicated', 'discrete'].some((x) => n.includes(x))) return 'dedicated'; if (['integrated', 'shared', 'iris', 'uhd', 'intel hd', 'apple gpu'].some((x) => n.includes(x))) return 'integrated'; return null; }
function _connTokens(v) { const n = _normalizeBrowseText(v); const t = []; if (n.includes('wi fi') || n.includes('wifi')) t.push('wi-fi'); if (n.includes('5g')) t.push('5g'); if (n.includes('4g') || n.includes('cellular') || n.includes('lte')) t.push('4g'); return t; }
function _weightKg(v) { const n = _normalizeBrowseText(v), x = _num(v); if (x === null) return null; if (n.includes('kg')) return x; if (n.includes('g')) return x / 1000; return x; }
function _normSocket(v) { let s = String(v || '').trim().toUpperCase().replace(/SOCKET/g, '').replace(/FCLGA/g, 'LGA').replace(/[^A-Z0-9]/g, ''); if (/^STR\d+$/.test(s)) s = s.slice(1); return s; }
function _socketAliases(s) { const n = _normSocket(s); if (!n) return []; const a = [n]; if (n === 'TRX50' || n === 'WRX90') a.push('TR5'); if (n === 'TRX40' || n === 'WRX80') a.push('TR4'); return a; }
function _socketFromText(v) { const text = String(v || '').toUpperCase(); const m = text.match(/(?:FC)?LGA\s*\d{3,4}|AM[345]|TRX\d+|STR\d+|TR\d+|WRX\d+|STRP\d+/g) || []; const t = []; m.forEach((x) => _socketAliases(x).forEach((a) => t.push(a))); return t; }
function _matchBucket(raw, pairs) { const n = _normalizeBrowseText(raw); for (const [k, v] of pairs) if (n.indexOf(k) !== -1) return v; return null; }

function extractBrowse(pb) {
  const flat = _flattenBrowseSpecs(pb);
  const tokens = [], seen = {};
  const addT = (t) => { if (t && !seen[t]) { seen[t] = true; tokens.push(t); } };
  const first = (keys) => { const v = _findBrowseSpecValues(keys, flat); return v.length ? String(v[0]) : ''; };

  const ram = _num(first(['Memory (RAM)', 'RAM', 'memory ram', 'Bellek (RAM)', 'Bellek'])); if (ram !== null) addT('ram:' + Math.round(ram) + '_gb');
  const st = _storageToken(first(['Hard Disk (SSD) Size', 'SSD Size', 'Internal Storage', 'internal storage', 'Storage Size', 'Storage Capacity', 'storage', 'Storage', 'Capacity', 'Dahili Depolama', 'Depolama'])); if (st) addT('storage:' + st);
  const os = _osToken(first(['Operating System', 'OS', 'Platform', 'İşletim Sistemi', 'Isletim Sistemi'])); if (os) addT('os:' + os);
  const cpu = _cpuBrand(first(['Processor Brand', 'Processor', 'CPU', 'Chip', 'Chipset', 'İşlemci', 'İşlemci Markası', 'Yonga Seti'])); if (cpu) addT('processor_brand:' + cpu);
  const socketTexts = [pb.name, first(['Socket', 'CPU Socket', 'Processor Socket', 'Soket']), first(['Compatible Sockets', 'Socket Support'])];
  Object.keys(flat).forEach((k) => socketTexts.push(flat[k]));
  socketTexts.forEach((v) => _socketFromText(v).forEach((tk) => addT('socket:' + tk.toLowerCase())));
  const gpu = _gpuType(first(['GPU Model', 'Graphics Card', 'Graphics Card Type', 'External Graphics Processor (GPU)', 'Integrated Graphics Model', 'Video Card', 'Ekran Kartı', 'Grafik İşlemci'])); if (gpu) addT('gpu_type:' + gpu);
  const panel = _matchBucket(first(['Screen Technology', 'Display Type', 'Panel Type', 'Display Technology', 'Display', 'Ekran Teknolojisi', 'Panel Tipi']), [['dynamic amoled', 'dynamic_amoled'], ['super amoled', 'super_amoled'], ['amoled', 'amoled'], ['ltpo', 'ltpo'], ['oled', 'oled'], ['ips', 'ips'], ['va', 'va'], ['tn', 'tn'], ['lcd', 'lcd']]); if (panel) addT('screen_tech:' + panel);
  const rr = _num(first(['Screen Refresh Rate', 'Refresh Rate', 'Display Refresh Rate', 'Ekran Yenileme Hızı', 'Yenileme Hızı'])); if (rr !== null) { const hz = Math.round(rr); if ([60, 75, 90, 120, 144, 165, 180, 240, 360].includes(hz)) addT('refresh_rate:' + hz + '_hz'); }
  _connTokens(first(['Connectivity', 'Connection Type', '4G', '5G', 'Wi-Fi', 'Bağlantı'])).forEach((tk) => addT('connectivity:' + tk));
  [['five_g', ['5G', '5G Desteği']], ['nfc', ['NFC']], ['wireless_charging', ['Wireless Charging', 'Kablosuz Şarj']], ['fast_charging', ['Fast Charging', 'Hızlı Şarj']], ['fingerprint', ['Fingerprint Reader', 'fingerprint', 'Parmak İzi']], ['water_resistance', ['Water Resistance', 'Suya Dayanıklılık']]].forEach(([tok, keys]) => { if (_bool(first(keys)) === true) addT(tok + ':true'); });

  const screen = _screenSizeFromFlat(flat);
  const battery = _num(first(['Battery Capacity', 'Battery Capacity (Typical)', 'Batarya Kapasitesi', 'Batarya Kapasitesi (Tipik)']));
  return {
    tokens,
    screenSizeValue: screen || undefined,
    batteryCapacityValue: battery === null ? undefined : Math.round(battery),
    weightValueKg: _weightKg(first(['Weight', 'Ağırlık'])) || undefined,
  };
}

// ── IO ───────────────────────────────────────────────────────────────────────
async function* listProducts() {
  const fr = await fetch(`${TS_URL}/collections/products/documents/search?q=*&query_by=name&per_page=0&facet_by=category&max_facet_values=400`, { headers: HDR });
  let cats = ((await fr.json())?.facet_counts?.[0]?.counts || []).map((c) => c.value).filter(Boolean);
  if (CAT_FILTER) cats = cats.filter((c) => CAT_FILTER.includes(c));
  console.log(`Categories: ${cats.length}`);
  for (const cat of cats) {
    let page = 1;
    for (;;) {
      const url = `${TS_URL}/collections/products/documents/search?q=*&query_by=name&filter_by=${encodeURIComponent('category:=`' + cat + '`')}&include_fields=id,_raw,screenSizeValue,batteryCapacityValue,weightValueKg,filterTokens&per_page=250&page=${page}`;
      let data; try { const r = await fetch(url, { headers: HDR, signal: AbortSignal.timeout(30000) }); if (!r.ok) break; data = await r.json(); } catch { break; }
      const hits = data?.hits || [];
      for (const h of hits) yield h.document;
      if (hits.length < 250 || page * 250 >= 240000) break;
      page++;
    }
  }
}
async function tsUpdate(id, fields) {
  const r = await fetch(`${TS_URL}/collections/products/documents/import?action=update`, {
    method: 'POST', headers: { ...HDR, 'Content-Type': 'text/plain' },
    body: JSON.stringify({ id, ...fields }), signal: AbortSignal.timeout(20000),
  });
  const t = await r.text();
  if (!r.ok || /"success":false/.test(t)) throw new Error(`TS ${r.status}: ${t.slice(0, 140)}`);
}

const stats = { scanned: 0, updated: 0, tokensAdded: 0, errors: 0 };
async function proc(doc) {
  let raw; try { raw = JSON.parse(doc._raw || '{}'); } catch { return; }
  stats.scanned++;
  try {
    const b = extractBrowse(raw);
    const prev = Array.isArray(doc.filterTokens)
      ? doc.filterTokens
      : (Array.isArray(raw.filterTokens) ? raw.filterTokens : []);
    const tokensChanged = b.tokens.length !== prev.length || b.tokens.some((t) => !prev.includes(t));
    const prevScreen = Number(doc.screenSizeValue);
    const nextScreen = b.screenSizeValue != null
      ? b.screenSizeValue
      : (Number.isFinite(prevScreen) && prevScreen > 120 ? 0 : undefined);
    const screenChanged = nextScreen !== undefined &&
      (!Number.isFinite(prevScreen) || Math.abs(prevScreen - nextScreen) > 0.05);
    const prevBattery = Number(doc.batteryCapacityValue);
    const batteryChanged = b.batteryCapacityValue != null &&
      (!Number.isFinite(prevBattery) || Math.round(prevBattery) !== b.batteryCapacityValue);
    const prevWeight = Number(doc.weightValueKg);
    const weightChanged = b.weightValueKg != null &&
      (!Number.isFinite(prevWeight) || Math.abs(prevWeight - b.weightValueKg) > 0.001);
    if (!tokensChanged && !screenChanged && !batteryChanged && !weightChanged) return;
    stats.tokensAdded += Math.max(0, b.tokens.length - prev.length);
    if (!DRY) {
      raw.filterTokens = b.tokens;
      const fields = {
        ...(tokensChanged ? { filterTokens: b.tokens } : {}),
        ...(nextScreen !== undefined ? { screenSizeValue: nextScreen } : {}),
        ...(b.batteryCapacityValue != null ? { batteryCapacityValue: b.batteryCapacityValue } : {}),
        ...(b.weightValueKg != null ? { weightValueKg: b.weightValueKg } : {}),
        _raw: JSON.stringify(raw),
      };
      await tsUpdate(doc.id, fields);
    }
    stats.updated++;
    if (stats.updated % 200 === 0) console.log(`  … updated ${stats.updated} (scanned ${stats.scanned}, +${stats.tokensAdded} tokens)`);
  } catch (e) { stats.errors++; if (stats.errors % 50 === 1) console.log(`  ⚠ ${doc.id}: ${e.message}`); }
}

async function main() {
  if (!K) throw new Error('Missing TYPESENSE_API_KEY');
  console.log(`Filter-token reindex — ${DRY ? 'DRY' : 'LIVE'} · conc ${CONC}${CAT_FILTER ? ' · cats=' + CAT_FILTER.join(',') : ''}`);
  const pool = new Set();
  for await (const doc of listProducts()) {
    const task = proc(doc).finally(() => pool.delete(task));
    pool.add(task);
    if (pool.size >= CONC) await Promise.race(pool);
  }
  await Promise.allSettled(pool);
  console.log(`\nDone — updated ${stats.updated} (+${stats.tokensAdded} tokens), scanned ${stats.scanned}, errors ${stats.errors}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
