const https = require('https');

function fetchJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = opts.body || null;
    const options = {
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
      rejectUnauthorized: false,
    };
    if (data) options.headers['Content-Length'] = Buffer.byteLength(data);
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve(body); } });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const PB = 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';

(async () => {
  const auth = await fetchJson(PB + '/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'admin@qorai.local', password: 'mx6I0zPE3HSaqbjlAY0p' }),
  });
  const token = auth.token;
  if (!token) { console.error('Auth failed:', auth); process.exit(1); }
  console.log('✓ Auth OK');

  const rules = {
    viewRule: '@request.auth.id != ""',
    updateRule: '@request.auth.id != "" && @request.auth.id = userId',
    createRule: '@request.auth.id != ""',
  };

  const r = await fetchJson(PB + '/api/collections/support_messages', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify(rules),
  });

  if (r.updateRule !== undefined) {
    console.log('✓ Rules updated');
    console.log('  viewRule:', r.viewRule);
    console.log('  updateRule:', r.updateRule);
    console.log('  createRule:', r.createRule);
  } else {
    console.error('Failed:', JSON.stringify(r));
  }
})();
