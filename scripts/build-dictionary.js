#!/usr/bin/env node
/**
 * Scrapes 1 product from each epey.com category to collect ALL unique
 * Turkish spec keys, values, and section names. Outputs a complete
 * TR→EN dictionary for use in the scraper.
 *
 * Usage: node scripts/build-dictionary.js
 * Output: scripts/dictionary-output.json (raw Turkish terms)
 *         Prints ready-to-paste JS dictionary entries to stdout.
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://www.epey.com';
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat';
const DEEPSEEK_API_KEY = 'sk-adb9296a88074c5080e9ab659d47d1cc';

const CATEGORIES = [
  { id: 'smartphones',      epeyPath: 'akilli-telefonlar' },
  { id: 'tablets',           epeyPath: 'tablet' },
  { id: 'laptops',           epeyPath: 'laptop' },
  { id: 'desktops',          epeyPath: 'masaustu-bilgisayar' },
  { id: 'cpus',              epeyPath: 'islemci' },
  { id: 'gpus',              epeyPath: 'ekran-karti' },
  { id: 'ram',               epeyPath: 'bellek-ram' },
  { id: 'ssd',               epeyPath: 'depolama/cihaz-sinifi/ssd' },
  { id: 'motherboards',      epeyPath: 'anakart' },
  { id: 'psu',               epeyPath: 'power-supply-psu' },
  { id: 'cases',             epeyPath: 'bilgisayar-kasasi' },
  { id: 'coolers',           epeyPath: 'islemci-sogutucu' },
  { id: 'tvs',               epeyPath: 'televizyon' },
  { id: 'monitors',          epeyPath: 'monitor' },
  { id: 'projectors',        epeyPath: 'projeksiyon-makinesi' },
  { id: 'headphones',        epeyPath: 'kulaklik' },
  { id: 'speakers',          epeyPath: 'bluetooth-hoparlor' },
  { id: 'soundbars',         epeyPath: 'ses-sistemi/urun-tipi/soundbar' },
  { id: 'smartwatches',      epeyPath: 'akilli-saat' },
  { id: 'cameras',           epeyPath: 'fotograf-kamera' },
  { id: 'action-cameras',    epeyPath: 'aksiyon-kamera' },
  { id: 'security-cameras',  epeyPath: 'guvenlik-kamerasi' },
  { id: 'consoles',          epeyPath: 'oyun-konsolu' },
  { id: 'gamepads',          epeyPath: 'oyun-kolu' },
  { id: 'keyboards',         epeyPath: 'klavye-mouse/urun-tipi/klavye' },
  { id: 'mice',              epeyPath: 'klavye-mouse/urun-tipi/mouse' },
  { id: 'printers',          epeyPath: 'yazici' },
  { id: 'webcams',           epeyPath: 'webcam' },
  { id: 'routers',           epeyPath: 'modem' },
  { id: 'robot-vacuums',     epeyPath: 'robot-supurge' },
  { id: 'powerbanks',        epeyPath: 'powerbank' },
  { id: 'e-readers',         epeyPath: 'e-kitap-okuyucu' },
  { id: 'drones',            epeyPath: 'drone' },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitForCloudflare(page) {
  for (let i = 0; i < 35; i++) {
    const title = await page.title();
    if (!title.includes('Just a moment')) return true;
    await sleep(1000);
  }
  return false;
}

async function getFirstProductUrl(page, epeyPath) {
  const listUrl = `${BASE_URL}/${epeyPath}/`;
  console.log(`  Navigating to ${listUrl}`);
  await page.goto(listUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await waitForCloudflare(page);
  await sleep(2000);

  try {
    await page.waitForSelector('#listele', { timeout: 15000 });
  } catch { }

  const productUrl = await page.evaluate((base) => {
    const listele = document.querySelector('#listele');
    if (!listele) return null;
    const a = listele.querySelector('a[href$=".html"]');
    if (a) {
      const href = a.getAttribute('href');
      return href.startsWith('http') ? href : base + '/' + href.replace(/^\//, '');
    }
    // Fallback
    const allLinks = listele.querySelectorAll('a[href]');
    for (const link of allLinks) {
      const href = link.getAttribute('href') || '';
      if (href && href !== '#' && !href.includes('javascript:')) {
        return href.startsWith('http') ? href : base + '/' + href.replace(/^\//, '');
      }
    }
    return null;
  }, BASE_URL);

  return productUrl;
}

async function scrapeProductSpecs(page, productUrl) {
  await page.goto(productUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  await waitForCloudflare(page);
  await sleep(2000);

  try {
    await page.waitForSelector('h1', { timeout: 15000 });
  } catch { }

  return page.evaluate(() => {
    const sections = {};
    const keys = new Set();
    const values = new Set();
    const sectionNames = new Set();

    const ozellikler = document.querySelector('#ozellikler');
    if (ozellikler) {
      let currentSection = 'Genel';
      const elements = ozellikler.querySelectorAll('h3, ul.grup > li');
      for (const el of elements) {
        if (el.tagName === 'H3') {
          currentSection = el.textContent.trim();
          sectionNames.add(currentSection);
        } else if (el.tagName === 'LI') {
          const strong = el.querySelector('strong');
          const valueSpan = el.querySelector('span.cell');
          if (!strong) continue;
          const key = strong.textContent.trim();
          let value = '';
          if (valueSpan) {
            const link = valueSpan.querySelector('a');
            if (link) {
              value = link.textContent.trim();
            } else {
              const innerSpan = valueSpan.querySelector('span');
              value = innerSpan ? innerSpan.textContent.trim() : valueSpan.textContent.trim();
            }
          }
          if (key) keys.add(key);
          if (value) values.add(value);
          if (!sections[currentSection]) sections[currentSection] = {};
          sections[currentSection][key] = value;
        }
      }
    }

    return {
      keys: [...keys],
      values: [...values],
      sectionNames: [...sectionNames],
      sections,
    };
  });
}

// DeepSeek batch translation
async function translateBatch(texts) {
  const numbered = texts.map((t, i) => `${i + 1}. ${t}`).join('\n');

  const prompt = `Translate these Turkish product specification terms to English.
Return a JSON object where each key is the line number (as string) and the value is the English translation (string).
Keep brand names, model numbers, units, numbers unchanged.
"Var" → "Yes", "Yok" → "No".
If already in English, return unchanged.
Output ONLY valid JSON, no markdown.

${numbered}`;

  const body = JSON.stringify({
    model: DEEPSEEK_MODEL,
    messages: [
      { role: 'system', content: 'You are a product specification translator (Turkish→English). Output only valid JSON.' },
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
      timeout: 60000,
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.message?.content;
          if (content) {
            const parsed = JSON.parse(content);
            const result = {};
            for (let i = 0; i < texts.length; i++) {
              const translation = parsed[String(i + 1)];
              if (translation) result[texts[i]] = translation;
            }
            resolve(result);
          } else {
            reject(new Error('No content in response'));
          }
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body); req.end();
  });
}

function isPurelyTechnical(text) {
  if (!text) return true;
  const t = text.trim();
  if (/^[\d.,\s°%]+$/.test(t)) return true;
  if (/^[\d.,\s]+\s*[°]?\s*(gb|mb|tb|ghz|mhz|hz|nm|mm|cm|m|kg|g|w|v|a|mah|mp|fps|bit|ms|lm|c|f)$/i.test(t)) return true;
  if (/^[A-Z0-9][A-Z0-9.\-/+()]+$/.test(t)) return true;
  if (/^[A-Za-z0-9.\-/+()]+$/.test(t) && /\d/.test(t) && t.length <= 20) return true;
  return false;
}

async function main() {
  console.log('🔍 Building comprehensive TR→EN dictionary from epey.com\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled'],
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1366, height: 768 });

  const allKeys = new Set();
  const allValues = new Set();
  const allSections = new Set();
  let totalProducts = 0;

  for (const cat of CATEGORIES) {
    console.log(`\n📦 Category: ${cat.id} (${cat.epeyPath})`);
    try {
      const productUrl = await getFirstProductUrl(page, cat.epeyPath);
      if (!productUrl) {
        console.log('  ⚠ No product URL found, skipping');
        continue;
      }
      console.log(`  → Scraping: ${productUrl}`);

      const specs = await scrapeProductSpecs(page, productUrl);
      specs.keys.forEach(k => allKeys.add(k));
      specs.values.forEach(v => allValues.add(v));
      specs.sectionNames.forEach(s => allSections.add(s));
      totalProducts++;
      console.log(`  ✅ Found ${specs.keys.length} keys, ${specs.values.length} values, ${specs.sectionNames.length} sections`);

      await sleep(2000);
    } catch (err) {
      console.log(`  ❌ Error: ${err.message}`);
    }
  }

  await browser.close();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Scraped ${totalProducts} products across ${CATEGORIES.length} categories`);
  console.log(`Unique keys: ${allKeys.size}, values: ${allValues.size}, sections: ${allSections.size}`);

  // Combine all unique terms to translate
  const allTerms = new Set([...allKeys, ...allValues, ...allSections]);

  // Filter out purely technical terms (numbers, abbreviations)
  const toTranslate = [...allTerms].filter(t => !isPurelyTechnical(t));
  console.log(`\nTerms needing translation: ${toTranslate.length} (filtered ${allTerms.size - toTranslate.length} technical terms)\n`);

  // Translate in batches of 50
  const dictionary = {};
  for (let i = 0; i < toTranslate.length; i += 50) {
    const batch = toTranslate.slice(i, i + 50);
    console.log(`Translating batch ${Math.floor(i / 50) + 1}/${Math.ceil(toTranslate.length / 50)} (${batch.length} terms)...`);
    try {
      const translations = await translateBatch(batch);
      Object.assign(dictionary, translations);
    } catch (err) {
      console.error(`  ⚠ Batch failed: ${err.message}, retrying...`);
      await sleep(3000);
      try {
        const translations = await translateBatch(batch);
        Object.assign(dictionary, translations);
      } catch (err2) {
        console.error(`  ❌ Retry failed: ${err2.message}`);
      }
    }
    await sleep(1000);
  }

  // Save raw output
  const outputPath = path.join(__dirname, 'dictionary-output.json');
  fs.writeFileSync(outputPath, JSON.stringify(dictionary, null, 2), 'utf-8');
  console.log(`\n📄 Raw dictionary saved to: ${outputPath}`);

  // Generate JS code
  console.log(`\n${'═'.repeat(60)}`);
  console.log('// ── GENERATED DICTIONARY ENTRIES ──');
  console.log('// Paste these into TR_EN in scrapers.js\n');

  const sorted = Object.entries(dictionary).sort(([a], [b]) => a.localeCompare(b, 'tr'));
  for (const [tr, en] of sorted) {
    const trLower = tr.toLocaleLowerCase('tr');
    const escaped = en.replace(/'/g, "\\'");
    const pad = Math.max(1, 35 - trLower.length);
    console.log(`  '${trLower}':${' '.repeat(pad)}'${escaped}',`);
  }

  console.log(`\n✅ Done! ${sorted.length} dictionary entries generated.`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
