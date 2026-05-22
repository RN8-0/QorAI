#!/usr/bin/env node
/**
 * Read-only export of unique Epey translation atoms.
 * Writes chunked JSON/TXT files to the user's Desktop.
 * Does not patch PocketBase.
 */

const fs = require('fs');
const path = require('path');
const { req: pbReq } = require('../migration/pb');

const OUT_DIR = path.join(process.env.USERPROFILE || process.env.HOME || '.', 'Desktop', 'epey_translation_terms');
const CHUNK_SIZE = Number((process.argv.find(a => a.startsWith('--chunk=')) || '').split('=')[1] || 500);
const LIMIT = Number((process.argv.find(a => a.startsWith('--limit=')) || '').split('=')[1] || 0);

const CATEGORIES = [
  'smartphones','tablets','laptops','desktops','cpus','gpus','ram','ssd',
  'motherboards','psu','cases','coolers','tvs','monitors','projectors',
  'headphones','speakers','soundbars','smartwatches','cameras','action-cameras',
  'security-cameras','consoles','gamepads','keyboards','mice','printers',
  'webcams','routers','robot-vacuums','powerbanks','e-readers','drones',
];

function normalizeText(value) {
  return String(value || '')
    .replace(/\u00A0/g, ' ')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

function hasLetters(text) {
  return /[A-Za-zÀ-ÿığşçöüİĞŞÇÖÜ]/.test(text);
}

function isTechnicalOnly(text) {
  const s = normalizeText(text);
  if (!s || s.length < 2) return true;
  if (/^\d{8,14}$/.test(s)) return true;
  if (/^[\d\s.,:+/()°%'"×x-]+$/.test(s)) return true;
  if (/^[A-Z0-9][A-Z0-9._/+() -]{1,30}$/.test(s) && /\d/.test(s)) return true;
  if (/^\d+(?:[.,]\d+)?\s*(gb|mb|tb|kb|ghz|mhz|hz|mah|wh|w|v|a|mp|mm|cm|nm|kg|g|fps|dpi|ms|bit|nit|pa|rpm)$/i.test(s)) return true;
  return !hasLetters(s);
}

function termTypeFromContext(context) {
  if (context === 'name') return 'product_name';
  if (context === 'section') return 'section';
  if (context === 'key' || context === 'keySpecKey') return 'spec_key';
  return 'spec_value';
}

function addTerm(map, rawText, context, productId) {
  const text = normalizeText(rawText);
  if (!text || text.length > 700 || isTechnicalOnly(text)) return;

  const addOne = (source) => {
    const s = normalizeText(source);
    if (!s || s.length > 700 || isTechnicalOnly(s)) return;
    const key = s.toLocaleLowerCase('tr');
    if (!map.has(key)) {
      map.set(key, {
        id: `term_${String(map.size + 1).padStart(6, '0')}`,
        source: s,
        type: termTypeFromContext(context),
        contexts: [context],
        exampleProductIds: productId ? [productId] : [],
        translations: {
          en: '',
          de: '',
          es: '',
          fr: '',
          it: '',
          ja: '',
          nl: '',
          pl: '',
          pt: '',
          sv: '',
          ar: '',
        },
      });
      return;
    }
    const item = map.get(key);
    if (!item.contexts.includes(context)) item.contexts.push(context);
    if (productId && item.exampleProductIds.length < 5 && !item.exampleProductIds.includes(productId)) {
      item.exampleProductIds.push(productId);
    }
  };

  addOne(text);
  if (text.includes('\n')) {
    for (const line of text.split('\n')) addOne(line);
  }
}

async function fetchProducts(category, sink) {
  const fields = 'id,name,source,sourceUrl,specs,specSections,keySpecs';
  const filter = `category="${category}" && (source="epey.com" || source~"epey" || sourceUrl~"epey.com")`;
  let total = 0;
  for (let page = 1; ; page++) {
    const url = `/api/collections/products/records?filter=${encodeURIComponent(filter)}&fields=${encodeURIComponent(fields)}&perPage=500&page=${page}&sort=id`;
    const res = await pbReq('GET', url);
    if (res.status !== 200) {
      console.warn(`[warn] ${category} page ${page}: ${res.status} ${JSON.stringify(res.body).slice(0, 180)}`);
      break;
    }
    const items = res.body.items || [];
    if (!items.length) break;
    for (const p of items) {
      sink(p);
      total++;
      if (LIMIT && total >= LIMIT) return total;
    }
    if (items.length < 500) break;
  }
  return total;
}

function collectFromProduct(map, product) {
  const id = product.id || '';
  addTerm(map, product.name, 'name', id);

  for (const [k, v] of Object.entries(product.specs || {})) {
    addTerm(map, k, 'key', id);
    addTerm(map, v, 'value', id);
  }

  for (const [section, body] of Object.entries(product.specSections || {})) {
    addTerm(map, section, 'section', id);
    if (!body || typeof body !== 'object' || Array.isArray(body)) continue;
    for (const [k, v] of Object.entries(body)) {
      addTerm(map, k, 'key', id);
      addTerm(map, v, 'value', id);
    }
  }

  for (const [k, v] of Object.entries(product.keySpecs || {})) {
    addTerm(map, k, 'keySpecKey', id);
    addTerm(map, v, 'keySpecValue', id);
  }
}

function writePrompt() {
  const prompt = `You are translating product specification atoms from Turkish/source mixed text into 11 target languages.

Rules:
1. Return valid JSON only. No markdown, no comments.
2. Keep every item's "id", "source", "type", "contexts", and "exampleProductIds" unchanged.
3. Fill only translations.en/de/es/fr/it/ja/nl/pl/pt/sv/ar.
4. Do not translate brand names, product model names, model codes, CPU/GPU names, storage/RAM variants, standards, units, numbers, URLs, EAN/GTIN/MPN/SKU.
5. Preserve technical terms such as USB-C, HDMI, OLED, AMOLED, IPS, HDR10+, Wi-Fi, Bluetooth, NFC, LTE, 5G, PCIe, NVMe, DDR, GDDR, IP68, Hz, GHz, GB, TB, mAh, W, MP, fps.
6. Translate product spec labels naturally and shortly. Example: "Ekran Çözünürlüğü" -> "Display Resolution".
7. Translate boolean values: "Var"/"Evet" -> Yes/Ja/Sí/Oui/Sì/はい/Ja/Tak/Sim/Ja/نعم. "Yok"/"Hayır" -> No/Nein/No/Non/No/いいえ/Nee/Nie/Não/Nej/لا.
8. If source is already language-neutral/technical, copy it to every language unchanged.
9. Do not remove items. Do not reorder intentionally. Do not add new items.
10. Product names: translate only Turkish descriptive words. Keep brand/model tokens unchanged.

Input JSON shape:
[
  {
    "id": "term_000001",
    "source": "Ekran Çözünürlüğü",
    "type": "spec_key",
    "contexts": ["key"],
    "exampleProductIds": ["abc"],
    "translations": {"en":"","de":"","es":"","fr":"","it":"","ja":"","nl":"","pl":"","pt":"","sv":"","ar":""}
  }
]

Output the same JSON array with translations filled.`;

  fs.writeFileSync(path.join(OUT_DIR, 'DEEPSEEK_PROMPT.txt'), prompt, 'utf8');
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const terms = new Map();
  let productTotal = 0;

  for (const category of CATEGORIES) {
    const before = terms.size;
    const count = await fetchProducts(category, (p) => collectFromProduct(terms, p));
    productTotal += count;
    console.log(`[export] ${category}: products=${count}, newTerms=${terms.size - before}, totalTerms=${terms.size}`);
    if (LIMIT && productTotal >= LIMIT) break;
  }

  const all = [...terms.values()].sort((a, b) => {
    const type = a.type.localeCompare(b.type);
    return type || a.source.localeCompare(b.source, 'tr');
  });
  all.forEach((item, idx) => { item.id = `term_${String(idx + 1).padStart(6, '0')}`; });

  fs.writeFileSync(path.join(OUT_DIR, 'all_terms_master.json'), JSON.stringify(all, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'all_terms_master.txt'), all.map(x => `${x.id}\t${x.type}\t${x.source}`).join('\n'), 'utf8');

  let part = 0;
  for (let i = 0; i < all.length; i += CHUNK_SIZE) {
    part++;
    const chunk = all.slice(i, i + CHUNK_SIZE);
    const suffix = String(part).padStart(3, '0');
    fs.writeFileSync(path.join(OUT_DIR, `epey_terms_part_${suffix}.json`), JSON.stringify(chunk, null, 2), 'utf8');
    fs.writeFileSync(path.join(OUT_DIR, `epey_terms_part_${suffix}.txt`), chunk.map(x => `${x.id}\t${x.type}\t${x.source}`).join('\n'), 'utf8');
  }

  writePrompt();
  fs.writeFileSync(path.join(OUT_DIR, 'README.txt'), [
    `Epey translation term export`,
    `Products scanned: ${productTotal}`,
    `Unique terms: ${all.length}`,
    `Chunk size: ${CHUNK_SIZE}`,
    ``,
    `Use DEEPSEEK_PROMPT.txt with each epey_terms_part_XXX.json file.`,
    `Do not edit id/source/type/context fields. Fill translations only.`,
    `Return translated JSON files with the same IDs.`,
  ].join('\n'), 'utf8');

  console.log(`[export] done: products=${productTotal}, uniqueTerms=${all.length}, out=${OUT_DIR}`);
})().catch(err => {
  console.error('[export] fatal:', err);
  process.exit(1);
});
