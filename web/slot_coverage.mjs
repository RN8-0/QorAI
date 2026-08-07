// Her kategori için, kart slotlarının GERÇEK doluluk oranını ölçer.
// Gerçek Typesense verisini (lean alanlar + _raw zengin specler) çeker ve
// projenin kendi cardKeySpecs() fonksiyonunu çalıştırır — tahmin yok.
import { cardKeySpecs } from './src/lib/categoryFilters.js';

const TS = 'https://lg9nuw99z1qojgv21dlemdrb.46.225.95.201.sslip.io';
const KEY = 'BFc7h2MZhq5yct2GxzkClzQtzzCglKIb';

const CATS = process.argv[2]
  ? process.argv[2].split(',')
  : ['smartphones', 'tablets', 'laptops', 'monitors', 'tvs', 'graphics_cards',
     'headphones', 'ssd', 'cpus', 'smartwatches', 'desktops', 'ram', 'speakers',
     'keyboards', 'mice', 'powerbanks', 'psu', 'motherboards', 'earbuds', 'consoles'];

const searches = CATS.map((c) => ({
  collection: 'products', q: '*', query_by: 'name',
  filter_by: `category:=${c}`, sort_by: 'techScore:desc', per_page: 40,
  include_fields: 'id,name,category,filterTokens,screenSizeValue,batteryCapacityValue,_raw',
}));

const res = await fetch(`${TS}/multi_search`, {
  method: 'POST',
  headers: { 'X-TYPESENSE-API-KEY': KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ searches }),
}).then((r) => r.json());

console.log('kategori'.padEnd(16), 'n'.padStart(4), ' slot doluluk (%)');
console.log('-'.repeat(78));
for (let i = 0; i < CATS.length; i++) {
  const hits = res.results[i]?.hits || [];
  if (!hits.length) { console.log(CATS[i].padEnd(16), '   0  (veri yok)'); continue; }
  const products = hits.map((h) => {
    const d = h.document;
    let raw = {};
    try { raw = d._raw ? JSON.parse(d._raw) : {}; } catch { raw = {}; }
    return { ...d, ...raw, category: d.category, filterTokens: d.filterTokens };
  });
  const fill = new Map();
  for (const p of products) {
    for (const chip of cardKeySpecs(p, 'en')) {
      const cur = fill.get(chip.label) || { n: 0, ok: 0 };
      cur.n += 1;
      if (chip.value && chip.value !== '—') cur.ok += 1;
      fill.set(chip.label, cur);
    }
  }
  const parts = [...fill.entries()].map(([k, v]) => `${k}=${Math.round(v.ok * 100 / v.n)}%`);
  console.log(CATS[i].padEnd(16), String(products.length).padStart(4), ' ' + parts.join('  '));
}
