#!/usr/bin/env node
// Firebase Management REST API - SHA-1 ekle & google-services.json indir
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROJECT_ID = 'qorai-99b6e';
const APP_ID = '1:116725106228:android:44d925a88bddccf84d2c61';
const SHA1 = '24:EE:C3:A3:EC:1D:77:F2:8F:DD:60:9F:A6:87:00:57:92:45:A2:5B';
const OUTPUT_PATH = path.join(__dirname, '..', 'android', 'app', 'google-services.json');

function getToken() {
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return config.tokens.access_token;
}

function request(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function main() {
  const token = getToken();
  console.log('Token acquired, length:', token.length);

  // 1. SHA-1 ekle
  console.log('\n[1] Adding SHA-1 fingerprint...');
  const shaBody = JSON.stringify({ shaHash: SHA1, certType: 'SHA_1' });
  const shaResp = await request({
    hostname: 'firebase.googleapis.com',
    path: `/v1beta1/projects/${PROJECT_ID}/androidApps/${APP_ID}/sha`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(shaBody),
    },
  }, shaBody);
  
  console.log('SHA add status:', shaResp.status);
  console.log('SHA add response:', shaResp.body);

  if (shaResp.status !== 200) {
    // 409 = already exists, that's fine
    if (shaResp.status === 409 || shaResp.body.includes('already exists')) {
      console.log('SHA-1 already registered, continuing...');
    } else {
      console.error('Failed to add SHA-1. Check token expiry.');
      // Continue anyway to download google-services.json
    }
  }

  // 2. google-services.json indir
  console.log('\n[2] Downloading google-services.json...');
  const dlResp = await request({
    hostname: 'firebase.googleapis.com',
    path: `/v1beta1/projects/${PROJECT_ID}/androidApps/${APP_ID}/config`,
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` },
  });
  
  console.log('Download status:', dlResp.status);
  if (dlResp.status !== 200) {
    console.error('Failed to download config:', dlResp.body);
    process.exit(1);
  }
  
  const configData = JSON.parse(dlResp.body);
  // configContents is base64 encoded
  const googleServicesContent = Buffer.from(configData.configFileContents, 'base64').toString('utf8');
  fs.writeFileSync(OUTPUT_PATH, googleServicesContent, 'utf8');
  console.log('google-services.json written to:', OUTPUT_PATH);
  
  // Verify OAuth clients
  const parsed = JSON.parse(googleServicesContent);
  const clients = parsed.client?.[0]?.oauth_client || [];
  console.log('\nOAuth clients in new google-services.json:');
  clients.forEach(c => console.log(`  - client_id: ${c.client_id}, type: ${c.client_type}`));
}

main().catch((err) => { console.error('Error:', err); process.exit(1); });
