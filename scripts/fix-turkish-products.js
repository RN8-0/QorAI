#!/usr/bin/env node
/**
 * Migration script: Translates all Turkish text in existing Firestore products to English.
 * Uses DeepSeek AI to translate product names, spec keys, spec values, and section names.
 * 
 * Usage: node scripts/fix-turkish-products.js [--dry-run] [--category=cpus]
 */

const admin = require('firebase-admin');
const https = require('https');
const path = require('path');

// ── Config ──
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';
const DEEPSEEK_API_KEY = 'sk-adb9296a88074c5080e9ab659d47d1cc';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const categoryFilter = args.find(a => a.startsWith('--category='))?.split('=')[1];

// ── Firebase Init ──
const serviceAccountPath = path.join(__dirname, '../compair-admin/compair-99b6e-firebase-adminsdk-fbsvc-d0cf85329c.json');
const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

// ── Translation cache ──
const cache = new Map();

// ── AI Translation ──
function callDeepSeek(prompt, systemMsg) {
  const body = JSON.stringify({
    model: DEEPSEEK_MODEL,
    messages: [
      { role: 'system', content: systemMsg },
      { role: 'user', content: prompt },
    ],
    max_tokens: 4096,
    temperature: 0.1,
    response_format: { type: 'json_object' },
  });

  return new Promise((resolve, reject) => {
    const url = new URL(DEEPSEEK_API_URL);
    const req = https.request({
      hostname: url.hostname, port: 443, path: url.pathname, method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 30000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.choices?.[0]?.message?.content) {
            resolve(JSON.parse(json.choices[0].message.content));
          } else {
            reject(new Error(`Unexpected response: ${data.substring(0, 200)}`));
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

async function translateBatch(items) {
  const entries = Object.entries(items);
  if (entries.length === 0) return {};

  const numbered = entries.map(([k, v], i) => `${i + 1}. "${k}" => "${v}"`).join('\n');
  const prompt = `Translate these Turkish product specification keys and values to English.
Return a JSON object where each key is the line number (as string) and the value is {"key": "English key", "value": "English value"}.
Keep brand names, model numbers, units, numbers as-is. "Var"→"Yes", "Yok"→"No".
If already in English, return unchanged. Output ONLY valid JSON.

${numbered}`;

  const result = await callDeepSeek(prompt, 'You are a product specification translator (Turkish→English). Output only valid JSON.');
  
  const output = {};
  for (let i = 0; i < entries.length; i++) {
    const origKey = entries[i][0];
    const item = result[String(i + 1)] || result[i + 1];
    if (item?.key && item?.value !== undefined) {
      output[origKey] = { key: item.key, value: String(item.value) };
    }
  }
  return output;
}

async function translateName(name) {
  const cacheKey = `__name__${name}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  
  try {
    const body = JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: 'Translate the Turkish product name to English. Keep brand names and model numbers unchanged. Only translate Turkish common words. Output ONLY the translated name, nothing else.' },
        { role: 'user', content: name },
      ],
      max_tokens: 256,
      temperature: 0.1,
    });

    const result = await new Promise((resolve, reject) => {
      const url = new URL(DEEPSEEK_API_URL);
      const req = https.request({
        hostname: url.hostname, port: 443, path: url.pathname, method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 15000,
      }, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => {
          try {
            const j = JSON.parse(d);
            resolve(j.choices?.[0]?.message?.content?.trim() || name);
          } catch { resolve(name); }
        });
      });
      req.on('error', () => resolve(name));
      req.on('timeout', () => { req.destroy(); resolve(name); });
      req.write(body); req.end();
    });

    const cleaned = result.replace(/^["']|["']$/g, '').trim();
    cache.set(cacheKey, cleaned || name);
    return cleaned || name;
  } catch { return name; }
}

// ── Detection ──
function isPurelyTechnical(text) {
  if (!text || typeof text !== 'string') return true;
  const t = text.trim();
  if (/^[\d.,\s°%]+$/.test(t)) return true;
  if (/^[\d.,\s]+\s*[°]?\s*(gb|mb|tb|ghz|mhz|hz|nm|mm|cm|m|kg|g|w|v|a|mah|mp|fps|bit|ms|lm|c|f)$/i.test(t)) return true;
  if (/^[A-Z0-9][A-Z0-9.\-/+()]+$/.test(t)) return true;
  if (/^[A-Za-z0-9.\-/+()]+$/.test(t) && /\d/.test(t) && t.length <= 20) return true;
  return false;
}

function hasTurkishChars(text) {
  return /[şğıöüçŞĞİÖÜÇ]/.test(text || '');
}

function needsTranslation(text) {
  if (!text || isPurelyTechnical(text)) return false;
  if (hasTurkishChars(text)) return true;
  // Check for common untranslated patterns
  if (/[a-z]/.test(text) && !/[A-Z]/.test(text[0])) return false; // lowercase English
  return false; // conservative: only flag Turkish chars for existing products
}

// For existing products, we take a more aggressive approach:
// Send ALL specs to AI for a complete re-translation
async function translateProduct(product) {
  let changed = false;
  const updates = {};

  // 1. Translate product name
  if (product.name && hasTurkishChars(product.name)) {
    const newName = await translateName(product.name);
    if (newName !== product.name) {
      updates.name = newName;
      changed = true;
    }
  }

  // 2. Collect all untranslated specs
  const untranslatedSpecs = {};
  if (product.specs) {
    for (const [k, v] of Object.entries(product.specs)) {
      if (hasTurkishChars(k) || hasTurkishChars(v) || !isPurelyTechnical(k)) {
        untranslatedSpecs[k] = v;
      }
    }
  }

  // 3. Collect all untranslated section names + their specs
  const untranslatedSections = {};
  if (product.specSections) {
    for (const [section, specObj] of Object.entries(product.specSections)) {
      if (hasTurkishChars(section)) {
        untranslatedSections[`__section__${section}`] = section;
      }
      if (specObj && typeof specObj === 'object') {
        for (const [k, v] of Object.entries(specObj)) {
          if (hasTurkishChars(k) || hasTurkishChars(v)) {
            untranslatedSpecs[k] = v;
          }
        }
      }
    }
  }

  // Merge section translations and spec translations
  const allToTranslate = { ...untranslatedSpecs, ...untranslatedSections };

  if (Object.keys(allToTranslate).length > 0) {
    // Check cache
    const toSend = {};
    const fromCache = {};
    for (const [k, v] of Object.entries(allToTranslate)) {
      const ck = `${k}|||${v}`;
      if (cache.has(ck)) {
        fromCache[k] = cache.get(ck);
      } else {
        toSend[k] = v;
      }
    }

    // Send to AI in chunks
    const sendEntries = Object.entries(toSend);
    for (let c = 0; c < sendEntries.length; c += 30) {
      const chunk = Object.fromEntries(sendEntries.slice(c, c + 30));
      try {
        const result = await translateBatch(chunk);
        for (const [origKey, translation] of Object.entries(result)) {
          const ck = `${origKey}|||${chunk[origKey]}`;
          cache.set(ck, translation);
          fromCache[origKey] = translation;
        }
      } catch (err) {
        console.error(`  ⚠ AI batch failed: ${err.message}`);
      }
    }

    // Apply spec translations
    if (product.specs && Object.keys(fromCache).length > 0) {
      const newSpecs = {};
      for (const [k, v] of Object.entries(product.specs)) {
        if (fromCache[k]) {
          newSpecs[fromCache[k].key] = fromCache[k].value;
          changed = true;
        } else {
          newSpecs[k] = v;
        }
      }
      // Filter Turkish language values
      for (const [k, v] of Object.entries(newSpecs)) {
        const lower = String(v).toLowerCase().trim();
        if (['turkish', 'türkçe', 'turkce'].includes(lower)) {
          delete newSpecs[k];
          changed = true;
        }
      }
      updates.specs = newSpecs;
      updates.specsCount = Object.keys(newSpecs).length;
    }

    // Apply section translations
    if (product.specSections && Object.keys(fromCache).length > 0) {
      const newSections = {};
      for (const [section, specObj] of Object.entries(product.specSections)) {
        const sectionKey = `__section__${section}`;
        const newSectionName = fromCache[sectionKey] ? fromCache[sectionKey].value : section;
        if (newSectionName !== section) changed = true;
        
        newSections[newSectionName] = {};
        if (specObj && typeof specObj === 'object') {
          for (const [k, v] of Object.entries(specObj)) {
            if (fromCache[k]) {
              newSections[newSectionName][fromCache[k].key] = fromCache[k].value;
              changed = true;
            } else {
              newSections[newSectionName][k] = v;
            }
          }
          // Filter Turkish language values in sections too
          for (const [k, v] of Object.entries(newSections[newSectionName])) {
            const lower = String(v).toLowerCase().trim();
            if (['turkish', 'türkçe', 'turkce'].includes(lower)) {
              delete newSections[newSectionName][k];
              changed = true;
            }
          }
        }
      }
      updates.specSections = newSections;
    }
  }

  return { changed, updates };
}

// ── Main ──
async function main() {
  console.log(`🔄 Fix Turkish Products Migration${DRY_RUN ? ' (DRY RUN)' : ''}`);
  if (categoryFilter) console.log(`  Filtering category: ${categoryFilter}`);

  let query = db.collection('products');
  if (categoryFilter) {
    query = query.where('category', '==', categoryFilter);
  }

  const snapshot = await query.get();
  console.log(`📦 Found ${snapshot.size} products to check\n`);

  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let idx = 0;

  for (const doc of snapshot.docs) {
    idx++;
    const product = doc.data();
    const progress = `[${idx}/${snapshot.size}]`;

    try {
      const { changed, updates } = await translateProduct(product);
      
      if (!changed) {
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`${progress} 🔍 Would update: ${product.name}`);
        if (updates.name) console.log(`  Name: "${product.name}" → "${updates.name}"`);
        const specChanges = updates.specs ? Object.keys(updates.specs).length : 0;
        if (specChanges) console.log(`  Specs: ${specChanges} keys translated`);
        updated++;
      } else {
        updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        await db.collection('products').doc(doc.id).update(updates);
        console.log(`${progress} ✅ Updated: ${updates.name || product.name}`);
        updated++;
      }

      // Rate limit to avoid API throttling
      if (idx % 5 === 0) await new Promise(r => setTimeout(r, 1000));

    } catch (err) {
      console.error(`${progress} ❌ Error: ${product.name} — ${err.message}`);
      errors++;
    }
  }

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`✅ Done! Updated: ${updated} | Skipped: ${skipped} | Errors: ${errors}`);
  if (DRY_RUN) console.log('(Dry run — no changes written to Firestore)');
  
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
