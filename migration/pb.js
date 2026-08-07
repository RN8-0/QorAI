// PocketBase API helper — admin-authed HTTP wrapper
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = Object.fromEntries(envFile.split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)];
}));

function normalizeBaseUrl(url) {
  if (!url) return url;
  if (url.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)([:/]|$)/.test(url)) {
    return url.replace(/^http:\/\//, 'https://');
  }
  return url;
}

const BASE = normalizeBaseUrl(env.POCKETBASE_URL);
const EMAIL = env.POCKETBASE_ADMIN_EMAIL;
const PASS = env.POCKETBASE_ADMIN_PASSWORD;
let token = null;

function requestModuleFor(url) {
  return url.protocol === 'https:' ? https : http;
}

function raw(method, urlPath, body, extraHeaders, redirectCount = 0, baseUrl = BASE) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, baseUrl);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: {
        'Accept': 'application/json',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { 'Authorization': token } : {}),
        ...extraHeaders,
      },
    };
    const transport = requestModuleFor(u);
    const r = transport.request(opts, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirectCount < 5) {
        const location = new URL(res.headers.location, u);
        raw(method, location.toString(), body, extraHeaders, redirectCount + 1, location.toString())
          .then(resolve)
          .catch(reject)
        return;
      }
      // Collect raw Buffers and decode once — concatenating chunks as strings
      // (`chunks += c`) splits multi-byte UTF-8 sequences across chunk
      // boundaries and corrupts non-ASCII text (e.g. Turkish ı/ş/ğ → U+FFFD).
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let parsed = text;
        try { parsed = JSON.parse(text); } catch {}
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function auth() {
  const r = await raw('POST', '/api/collections/_superusers/auth-with-password', { identity: EMAIL, password: PASS });
  if (r.status !== 200) throw new Error('Auth failed: ' + JSON.stringify(r.body));
  token = r.body.token;
  return token;
}

// PocketBase, 107k satırlık products üzerinde ağır bir sorgu yükseldiğinde
// (özellikle totalItems sayımı yapan sayfalamada) SQL'i zaman aşımına düşürür ve
// gövdesi "Something went wrong while processing your request." olan bir **400**
// döner. Bu bir sorgu hatası DEĞİL, geçici yük hatasıdır: aynı sorgu saniyeler
// sonra 200 verir. Retry olmadığı için gecelik fiyat zinciri (sync_offers,
// ts_backfill) bu 400'ü alır almaz ölüyordu — ölçüm 2026-08-07: 107.378 üründen
// yalnız 141'inin fiyatı tazeydi, çünkü dört sync_offers pass'i de ilk sayfada
// düşmüştü. Bu yüzden GEÇİCİ hatalarda üstel geri çekilmeyle yeniden deniyoruz.
const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const REQ_RETRIES = parseInt(process.env.PB_REQ_RETRIES || '4', 10);

function isTransient(r) {
  if (TRANSIENT_STATUSES.has(r.status)) return true;
  // PB'nin yük altındaki 400'ü: mesaj jenerik ve alan bazlı `data` boş.
  if (r.status === 400 && r.body && typeof r.body === 'object') {
    const msg = String(r.body.message || '');
    const noFieldErrors = !r.body.data || Object.keys(r.body.data).length === 0;
    if (noFieldErrors && /something went wrong/i.test(msg)) return true;
  }
  return false;
}

async function req(method, urlPath, body) {
  if (!token) await auth();
  let r;
  for (let attempt = 0; ; attempt++) {
    try {
      r = await raw(method, urlPath, body);
    } catch (err) {
      // ECONNRESET/ETIMEDOUT de geçicidir — gece koşusunda tek bir sıfırlanan
      // bağlantı tüm zinciri düşürüyordu.
      if (attempt >= REQ_RETRIES) throw err;
      await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt)));
      continue;
    }
    if (r.status === 401 && attempt < REQ_RETRIES) { token = null; await auth(); continue; }
    if (!isTransient(r) || attempt >= REQ_RETRIES) return r;
    await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt)));
  }
}

module.exports = { raw, auth, req, BASE };

if (require.main === module) {
  const cmd = process.argv[2];
  const arg = process.argv[3];
  (async () => {
    if (cmd === 'get') console.log(JSON.stringify((await req('GET', arg)), null, 2));
    else if (cmd === 'delete') console.log(JSON.stringify((await req('DELETE', arg)), null, 2));
    else if (cmd === 'post') console.log(JSON.stringify((await req('POST', arg, JSON.parse(process.argv[4] || '{}'))), null, 2));
    else if (cmd === 'patch') console.log(JSON.stringify((await req('PATCH', arg, JSON.parse(process.argv[4] || '{}'))), null, 2));
    else console.log('Usage: node pb.js get|post|patch|delete <url> [json-body]');
  })();
}
