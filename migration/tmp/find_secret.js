const https = require('https');
const { execSync } = require('child_process');

const token = execSync('gcloud auth print-access-token 2>nul', { encoding: 'utf8' }).trim();
const clientId = '510980756238-budtd0gdrlk91jmim11frucvue5muhbg.apps.googleusercontent.com';

// Try multiple GCP endpoints to find the client secret
const endpoints = [
  `/v1/projects/compair-99b6e/oauthIdpConfigs`,
  `/v1beta1/projects/compair-99b6e/oauthIdpConfigs`,
  // Try Firebase Auth API  
  `/v1/projects/compair-99b6e/config`,
  `/v1/projects/compair-99b6e/defaultSupportedIdpConfigs/google.com`,
  `/v1beta1/projects/compair-99b6e/defaultSupportedIdpConfigs/google.com`,
];

let done = 0;
for (const ep of endpoints) {
  const hostname = ep.includes('defaultSupported') || ep.includes('config')
    ? 'identitytoolkit.googleapis.com'
    : 'www.googleapis.com';
  
  https.get({
    hostname,
    path: ep,
    headers: { Authorization: `Bearer ${token}` }
  }, res => {
    let b = '';
    res.on('data', c => b += c);
    res.on('end', () => {
      console.log(`\n=== ${hostname}${ep} (${res.statusCode}) ===`);
      if (res.statusCode === 200) {
        console.log(b.substring(0, 2000));
      } else {
        const j = JSON.parse(b);
        console.log(j.error?.message || b.substring(0, 200));
      }
      done++;
      if (done === endpoints.length) process.exit(0);
    });
  }).on('error', e => { console.log(e.message); done++; });
}
