const https = require('https');
const { execSync } = require('child_process');

const token = execSync('gcloud auth print-access-token 2>nul', { encoding: 'utf8' }).trim();

function get(hostname, path) {
  return new Promise((resolve) => {
    https.get({ hostname, path, headers: { Authorization: `Bearer ${token}` } }, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve({ code: res.statusCode, body: b }));
    }).on('error', e => resolve({ code: 0, body: e.message }));
  });
}

async function main() {
  // Firebase Identity Toolkit API - get Google IdP config (has clientSecret)
  const r = await get(
    'identitytoolkit.googleapis.com',
    '/v2/projects/compair-99b6e/defaultSupportedIdpConfigs/google.com'
  );
  console.log(`Status: ${r.code}`);
  if (r.code === 200) {
    try {
      const j = JSON.parse(r.body);
      console.log('clientId:', j.clientId);
      console.log('clientSecret:', j.clientSecret);
      // Save it
      const fs = require('fs');
      fs.writeFileSync('migration/tmp/google_secret.txt', j.clientSecret);
      console.log('Secret saved to migration/tmp/google_secret.txt');
    } catch (e) {
      console.log(r.body.substring(0, 500));
    }
  } else {
    try {
      const j = JSON.parse(r.body);
      console.log('Error:', j.error?.message || r.body.substring(0, 300));
    } catch {
      console.log(r.body.substring(0, 300));
    }
    
    // Fallback: try v1 API
    const r2 = await get(
      'identitytoolkit.googleapis.com',
      '/v1/projects/compair-99b6e/defaultSupportedIdpConfigs/google.com'
    );
    console.log(`\nV1 Status: ${r2.code}`);
    try {
      const j = JSON.parse(r2.body);
      if (j.clientId) {
        console.log('clientId:', j.clientId);
        console.log('clientSecret:', j.clientSecret);
        const fs = require('fs');
        fs.writeFileSync('migration/tmp/google_secret.txt', j.clientSecret);
      } else {
        console.log('Error:', j.error?.message || r2.body.substring(0, 300));
      }
    } catch {
      console.log(r2.body.substring(0, 300));
    }
  }
}

main();
