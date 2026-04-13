// PocketBase API helper — admin-authed HTTP wrapper
const http = require('http');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = Object.fromEntries(envFile.split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)];
}));

const BASE = env.POCKETBASE_URL;
const EMAIL = env.POCKETBASE_ADMIN_EMAIL;
const PASS = env.POCKETBASE_ADMIN_PASSWORD;
let token = null;

function raw(method, urlPath, body, extraHeaders) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + urlPath);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      headers: {
        'Accept': 'application/json',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(token ? { 'Authorization': token } : {}),
        ...extraHeaders,
      },
    };
    const r = http.request(opts, (res) => {
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
