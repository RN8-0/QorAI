// Typesense API helper
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const envFile = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
const env = Object.fromEntries(envFile.split(/\r?\n/).filter(l => l && !l.startsWith('#')).map(l => {
  const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1)];
}));

const BASE = env.TYPESENSE_URL;
const KEY = env.TYPESENSE_API_KEY;

function req(method, urlPath, body, contentType = 'application/json') {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + urlPath);
    const data = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const transport = u.protocol === 'https:' ? https : http;
    const r = transport.request({
      method,
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      headers: {
        'X-TYPESENSE-API-KEY': KEY,
        'Accept': 'application/json',
        ...(data ? { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        let parsed = chunks;
        if (contentType.includes('json')) { try { parsed = JSON.parse(chunks); } catch {} }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

module.exports = { req, BASE };

if (require.main === module) {
  const cmd = process.argv[2];
  const arg = process.argv[3];
  (async () => {
    if (cmd === 'get') console.log(JSON.stringify((await req('GET', arg)), null, 2));
    else if (cmd === 'post') console.log(JSON.stringify((await req('POST', arg, JSON.parse(process.argv[4] || '{}'))), null, 2));
    else if (cmd === 'delete') console.log(JSON.stringify((await req('DELETE', arg)), null, 2));
    else console.log('Usage: node ts.js get|post|delete <url> [json-body]');
  })();
}
