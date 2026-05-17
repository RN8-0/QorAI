const { req } = require('../migration/pb');

const DRY = process.argv.includes('--dry');
const ALLOWED_CATEGORIES = new Set([
  'laptops', 'desktops',
  'smartphones', 'tablets',
  'monitors', 'tvs',
  'cpus', 'ram', 'ssd', 'hard_drives', 'external_hdd',
]);

const REFURBISHED_RE = /\b(?:refurbished|renewed|renew|renewd|refurbed|refurb|reconditioned|remanufactured|yenilenmi[sş]|yenilenmis|ikinci\s*el|used|pre[-\s]?owned|asgoodasnew|back\s*market|forza\s*refurbished|forza|greenpanda|teqcycle|upcycle\s*it|circular\s*computing|circular)\b/i;
const BAD_PRODUCT_RE = /\b(?:spare\s*part|replacement\s*part|service\s*part|warranty|license|licence|subscription|accessory\s*kit|mounting\s*kit)\b/i;
const BAD_IMAGE_RE = /\b(?:epeat|energy\s*star|energylabel|energy-label|eprel|tco|certificate|certification|award|badge|brandlogo|brand-logo|\/brand\/|\/logo\/|placeholder|no-image|default-image)\b/i;

function textOf(p) {
  return [p.name, p.brand, p.mpn, p.sourceUrl].map(v => String(v || '')).join(' ');
}

function imageList(p) {
  const images = Array.isArray(p.images) ? p.images : [];
  return [p.imageUrl, ...images].map(v => String(v || '').trim()).filter(Boolean);
}

function reasonsFor(p) {
  const reasons = [];
  if (!ALLOWED_CATEGORIES.has(String(p.category || '').trim())) reasons.push(`category:${p.category || '(empty)'}`);
  if (REFURBISHED_RE.test(textOf(p))) reasons.push('refurbished/used');
  if (BAD_PRODUCT_RE.test(textOf(p))) reasons.push('non-catalog-item');
  const imgs = imageList(p);
  if (!imgs.length) reasons.push('no-image');
  if (imgs.some(u => BAD_IMAGE_RE.test(u))) reasons.push('bad-image');
  return reasons;
}

async function listIcecatProducts() {
  const all = [];
  let page = 1;
  for (;;) {
    const filter = encodeURIComponent('source="icecat"');
    const fields = encodeURIComponent('id,name,brand,category,source,sourceUrl,imageUrl,images,mpn');
    const res = await req('GET', `/api/collections/products/records?filter=${filter}&page=${page}&perPage=300&fields=${fields}`);
    if (res.status !== 200) throw new Error(`List failed: ${JSON.stringify(res.body).slice(0, 300)}`);
    all.push(...(res.body.items || []));
    if (page >= Number(res.body.totalPages || 1)) break;
    page++;
  }
  return all;
}

async function main() {
  const products = await listIcecatProducts();
  const bad = [];
  for (const p of products) {
    const reasons = reasonsFor(p);
    if (reasons.length) bad.push({ p, reasons });
  }

  const byReason = {};
  for (const item of bad) {
    for (const r of item.reasons) byReason[r] = (byReason[r] || 0) + 1;
  }

  console.log(`Icecat products scanned: ${products.length}`);
  console.log(`Bad products ${DRY ? 'queued' : 'deleted'}: ${bad.length}`);
  Object.entries(byReason).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  bad.slice(0, 30).forEach(({ p, reasons }) => {
    console.log(`  - ${p.id} | ${p.category} | ${p.brand || ''} | ${String(p.name || '').slice(0, 120)} | ${reasons.join(', ')}`);
  });

  if (DRY) return;

  let deleted = 0;
  for (const { p } of bad) {
    const res = await req('DELETE', `/api/collections/products/records/${p.id}`);
    if (![200, 204].includes(res.status)) {
      console.warn(`Delete failed ${p.id}: ${JSON.stringify(res.body).slice(0, 200)}`);
    } else {
      deleted++;
    }
  }
  console.log(`Deleted ${deleted}/${bad.length}`);
}

main().catch(err => {
  console.error(err.stack || err.message || err);
  process.exit(1);
});
