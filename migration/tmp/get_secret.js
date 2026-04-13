const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');

const token = execSync('gcloud auth print-access-token 2>nul', { encoding: 'utf8' }).trim();

https.get({
  hostname: 'identitytoolkit.googleapis.com',
  path: '/v2/projects/compair-99b6e/defaultSupportedIdpConfigs/google.com',
  headers: {
    'Authorization': 'Bearer ' + token,
    'x-goog-user-project': 'compair-99b6e'
  }
}, res => {
  let b = '';
  res.on('data', c => b += c);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    if (res.statusCode === 200) {
      const j = JSON.parse(b);
      console.log('clientId:', j.clientId);
      console.log('clientSecret:', j.clientSecret);
      fs.writeFileSync('migration/tmp/google_secret.txt', j.clientSecret);
      console.log('Saved!');
    } else {
      try { console.log(JSON.parse(b).error.message); } catch { console.log(b.substring(0, 500)); }
    }
  });
}).on('error', e => console.log(e.message));
