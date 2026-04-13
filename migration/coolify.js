const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const TOKEN = '2|GJc03mJToQxKJhIYsnerwtTUrKn56tPY9A3zedei7a4bb336';
const BASE = 'http://46.225.95.201:8000';

function req(method, url, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE + url);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Accept': 'application/json',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const r = http.request(opts, (res) => {
      let chunks = '';
      res.on('data', (c) => (chunks += c));
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

module.exports = { req };

if (require.main === module) {
  const cmd = process.argv[2];
  const arg = process.argv[3];
  (async () => {
    if (cmd === 'get') {
      const r = await req('GET', arg);
      console.log(JSON.stringify(r, null, 2));
    } else if (cmd === 'delete') {
      const r = await req('DELETE', arg);
      console.log(JSON.stringify(r, null, 2));
    } else if (cmd === 'post') {
      const body = JSON.parse(process.argv[4] || '{}');
      const r = await req('POST', arg, body);
      console.log(JSON.stringify(r, null, 2));
    } else if (cmd === 'patch') {
      const body = JSON.parse(process.argv[4] || '{}');
      const r = await req('PATCH', arg, body);
      console.log(JSON.stringify(r, null, 2));
    } else {
      console.log('Usage: node coolify.js get|post|patch|delete <url> [json-body]');
    }
  })();
}
