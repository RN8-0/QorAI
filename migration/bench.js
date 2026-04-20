// End-to-end latency benchmark for PocketBase + Typesense from this machine
// Usage: node bench.js
const http = require('http');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = Object.fromEntries(envFile.split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)];
}));

const PB = env.POCKETBASE_URL;
const TS = env.TYPESENSE_URL;
const TS_KEY = env.TYPESENSE_API_KEY;

const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });

function time(method, url, headers = {}) {
  return new Promise((resolve) => {
    const u = new URL(url);
    const t0 = process.hrtime.bigint();
    const r = http.request({
      agent, method,
      hostname: u.hostname, port: u.port || 80,
      path: u.pathname + u.search,
      headers: { 'Accept': 'application/json', ...headers },
    }, (res) => {
      let n = 0;
      res.on('data', c => n += c.length);
      res.on('end', () => {
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        resolve({ ms, bytes: n, status: res.statusCode });
      });
    });
    r.on('error', (e) => resolve({ ms: -1, bytes: 0, status: 0, err: e.message }));
    r.end();
  });
}

async function run(name, fn, iters = 20) {
  const samples = [];
  // Warmup (first req establishes TCP)
  await fn();
  for (let i = 0; i < iters; i++) {
    const r = await fn();
    if (r.ms > 0) samples.push(r.ms);
  }
  samples.sort((a, b) => a - b);
  const p = (q) => samples[Math.min(samples.length - 1, Math.floor(samples.length * q))];
  console.log(
    `${name.padEnd(40)} ` +
    `min=${samples[0].toFixed(0).padStart(4)}ms ` +
    `p50=${p(0.5).toFixed(0).padStart(4)}ms ` +
    `p95=${p(0.95).toFixed(0).padStart(4)}ms ` +
    `max=${samples[samples.length - 1].toFixed(0).padStart(4)}ms ` +
    `(n=${samples.length})`
  );
}

(async () => {
  console.log(`Benchmarking from this machine → ${PB.replace(/^https?:\/\//, '')}\n`);

  // PocketBase
  await run('PB /api/health',
    () => time('GET', `${PB}/api/health`));

  await run('PB list 20 products (full fields)',
    () => time('GET', `${PB}/api/collections/products/records?perPage=20`));

  await run('PB list 20 products (lean fields)',
    () => time('GET', `${PB}/api/collections/products/records?perPage=20&fields=id,slug,name,brand,imageUrl,price_segment`));

  await run('PB list 50 products (lean fields)',
    () => time('GET', `${PB}/api/collections/products/records?perPage=50&fields=id,slug,name,brand,imageUrl,price_segment`));

  await run('PB filter by category=phones',
    () => time('GET', `${PB}/api/collections/products/records?perPage=20&filter=(category='phones')&fields=id,slug,name,brand,imageUrl`));

  await run('PB get single product by slug',
    () => time('GET', `${PB}/api/collections/products/records?perPage=1&filter=(slug='apple-iphone-16-pro-max-1-tb')`));

  // Typesense
  await run('TS search "iphone" (20 results)',
    () => time('GET', `${TS}/collections/products/documents/search?q=iphone&query_by=name,brand&per_page=20`, { 'X-TYPESENSE-API-KEY': TS_KEY }));

  await run('TS search "samsung galaxy"',
    () => time('GET', `${TS}/collections/products/documents/search?q=samsung%20galaxy&query_by=name,brand&per_page=20`, { 'X-TYPESENSE-API-KEY': TS_KEY }));

  await run('TS browse (empty q, sort trendScore)',
    () => time('GET', `${TS}/collections/products/documents/search?q=*&query_by=name&sort_by=trendScore:desc&per_page=20`, { 'X-TYPESENSE-API-KEY': TS_KEY }));

  await run('TS search + category facet',
    () => time('GET', `${TS}/collections/products/documents/search?q=*&query_by=name&filter_by=category:=phones&per_page=20`, { 'X-TYPESENSE-API-KEY': TS_KEY }));

  await run('TS typo tolerant "iphne"',
    () => time('GET', `${TS}/collections/products/documents/search?q=iphne&query_by=name,brand&per_page=10&num_typos=2`, { 'X-TYPESENSE-API-KEY': TS_KEY }));
})();
