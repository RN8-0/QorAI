const { req } = require('../migration/pb');

const PROXY_URL = 'http://localhost:3456';
const GEIZHALS_BASE = 'https://geizhals.eu';
const SEED_URL = 'https://geizhals.eu/apple-iphone-16-128gb-schwarz-a3296281.html';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function slugFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const parts = path.split('/').filter(Boolean);
    return (parts[parts.length - 1] || '').replace(/\.html$/i, '');
  } catch {
    return '';
  }
}

function generateProductId(slug) {
  if (!slug) return `product-${Date.now()}`;
  const id = slug
    .toLowerCase()
    .replace(/\.html$/i, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
  return id || `product-${Date.now()}`;
}

function parsePrice(text) {
  if (!text) return null;
  let cleaned = String(text).replace(/\s/g, '');
  if (cleaned.includes(',') && (cleaned.includes('€') || cleaned.includes('EUR'))) {
    cleaned = cleaned.replace(/€|EUR/gi, '').replace(/\./g, '').replace(/,/g, '.');
  } else {
    cleaned = cleaned.replace(/€|EUR|\$/gi, '').replace(/,/g, '');
  }
  cleaned = cleaned.replace(/[^\d.]/g, '');
  const num = parseFloat(cleaned);
  return Number.isFinite(num) && num > 0 && num < 10000000 ? num : null;
}

async function proxyFetch(url) {
  const response = await fetch(`${PROXY_URL}/?url=${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(60000),
  });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new Error(`Proxy HTTP ${response.status}: ${await response.text()}`);
  return response.text();
}

function extractTitle(html) {
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (!h1) return '';
  return h1[1]
    .replace(/<small[\s\S]*?<\/small>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLinks(html) {
  const links = [];
  const seen = new Set();
  const top10Start = html.indexOf('Top-10');
  const section = top10Start >= 0 ? html.substring(top10Start, top10Start + 30000) : html;
  const re = /href=["']([^"']*-[av]\d+\.html)["']/gi;
  let match;
  while ((match = re.exec(section)) !== null) {
    let href = match[1];
    if (href.startsWith('https://geizhals.eu/') || href.startsWith('https://geizhals.at/') || href.startsWith('https://geizhals.de/')) {
      try { href = new URL(href).pathname; } catch { continue; }
    }
    if (!href.startsWith('/')) href = `/${href}`;
    const full = `${GEIZHALS_BASE}${href}`;
    if (!seen.has(full)) {
      seen.add(full);
      links.push(full);
    }
  }
  return links;
}

function extractSpecs(html) {
  const specs = {};
  const itemRe = /<div[^>]*class=["'][^"']*specs-grid__item[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  let item;
  while ((item = itemRe.exec(html)) !== null) {
    const block = item[1];
    const dt = block.match(/<dt[^>]*>([\s\S]*?)<\/dt>/i);
    const dd = block.match(/<dd[^>]*>([\s\S]*?)<\/dd>/i);
    const key = dt ? dt[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const value = dd ? dd[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    if (key && value && key.length < 80 && value.length < 800) specs[key] = value;
  }
  return specs;
}

function extractImage(html) {
  const match = html.match(/https:\/\/[^"'\s>]*gzhls\.at\/pix\/[^"'\s>]*-n\.webp/);
  return match ? match[0].replace(/&amp;/g, '&') : undefined;
}

function extractBrand(name, specs) {
  const brandVal = specs.Brand || specs.Marka || specs.brand || specs.marka;
  if (brandVal && brandVal.trim().length < 50) return brandVal.trim();
  return String(name || '').split(/\s+/)[0] || '';
}

function prepareProductPayload(raw) {
  const payload = {
    slug: String(raw.slug || raw.id || '').trim().slice(0, 200),
    name: String(raw.name || '').trim().slice(0, 500),
    brand: String(raw.brand || '').trim().slice(0, 200),
    category: String(raw.category || '').trim().slice(0, 100),
    source: 'geizhals.eu',
    sourceUrl: raw.sourceUrl || undefined,
    imageUrl: raw.imageUrl || undefined,
    images: Array.isArray(raw.images) ? raw.images.filter(Boolean) : [],
    specs: raw.specs && typeof raw.specs === 'object' ? raw.specs : {},
    specSections: {},
    keySpecs: {},
    price_raw: raw.price_raw === undefined || raw.price_raw === null ? undefined : String(raw.price_raw).slice(0, 200),
    specsCount: Number.isFinite(Number(raw.specsCount)) ? Number(raw.specsCount) : 0,
    variantGroup: String(raw.variantGroup || '').trim().slice(0, 200),
    scrapedAt: new Date().toISOString(),
  };
  if (!payload.slug) payload.slug = generateProductId(slugFromUrl(payload.sourceUrl || ''));
  if (!payload.name) throw new Error('Product name is empty');
  Object.keys(payload).forEach(key => {
    if (payload[key] === undefined || payload[key] === null || payload[key] === '') delete payload[key];
  });
  return payload;
}

function parseProduct(html, url) {
  const slug = slugFromUrl(url);
  const name = extractTitle(html);
  const specs = extractSpecs(html);
  const priceMatch = html.match(/(?:ab\s*)?€\s*(?:&nbsp;)?\s*([\d.,]+)/i);
  const price = priceMatch ? parsePrice(priceMatch[0]) : null;
  const imageUrl = extractImage(html);
  return prepareProductPayload({
    slug: slug || generateProductId(slug),
    name,
    brand: extractBrand(name, specs),
    category: 'smartphones',
    sourceUrl: url,
    imageUrl,
    images: imageUrl ? [imageUrl] : [],
    specs,
    price_raw: price,
    specsCount: Object.keys(specs).length,
    variantGroup: slug,
  });
}

async function upsertProduct(product) {
  const created = await req('POST', '/api/collections/products/records', product);
  if (created.status !== 200) throw new Error(`Create failed ${created.status}: ${JSON.stringify(created.body)}`);
  return { action: 'created', id: created.body.id };
}

async function main() {
  const limit = Number(process.argv[2] || 10);
  const seedHtml = await proxyFetch(SEED_URL);
  const urls = [SEED_URL, ...extractLinks(seedHtml)].filter((url, index, arr) => arr.indexOf(url) === index).slice(0, limit);
  if (urls.length < limit) throw new Error(`Only found ${urls.length} URLs`);
  let saved = 0;
  for (const [index, url] of urls.entries()) {
    console.log(`[${index + 1}/${urls.length}] fetch ${url}`);
    const html = index === 0 ? seedHtml : await proxyFetch(url);
    const product = parseProduct(html, url);
    if (!product.name || product.specsCount <= 0) throw new Error(`Invalid parsed product: ${url}`);
    const result = await upsertProduct(product);
    saved++;
    console.log(`  ${result.action}: ${product.slug} | ${product.name} | specs=${product.specsCount}`);
    await sleep(1200);
  }
  const verify = await req('GET', `/api/collections/products/records?filter=${encodeURIComponent('category="smartphones" && source="geizhals.eu"')}&perPage=1`);
  if (verify.status !== 200 || verify.body.totalItems < saved) throw new Error(`Verify failed: ${JSON.stringify(verify.body)}`);
  console.log(`OK saved=${saved} totalSmartphoneGeizhals=${verify.body.totalItems}`);
}

main().catch(error => {
  console.error('FAILED:', error.message);
  process.exit(1);
});
