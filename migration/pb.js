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
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        let parsed = chunks;
        try { parsed = JSON.parse(chunks); } catch {}
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

async function req(method, urlPath, body) {
  if (!token) await auth();
  let r = await raw(method, urlPath, body);
  if (r.status === 401) { token = null; await auth(); r = await raw(method, urlPath, body); }
  return r;
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
