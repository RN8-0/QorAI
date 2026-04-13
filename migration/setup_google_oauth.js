#!/usr/bin/env node
/**
 * PocketBase Google OAuth2 Setup Script
 * 
 * 1. Google Cloud'da yeni Web OAuth2 client oluşturur (PocketBase redirect URI ile)
 * 2. PocketBase'de Google provider'ı etkinleştirir
 * 
 * Kullanım: node migration/setup_google_oauth.js
 */
const { execSync } = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => {
      const [k, ...v] = l.split('=');
      return [k.trim(), v.join('=').trim()];
    })
);

const PB_URL = env.POCKETBASE_URL;
const PB_ADMIN_EMAIL = env.POCKETBASE_ADMIN_EMAIL;
const PB_ADMIN_PASSWORD = env.POCKETBASE_ADMIN_PASSWORD;
const PROJECT_NUMBER = '510980756238';
const PROJECT_ID = 'compair-99b6e';

// PB redirect URI for OAuth2:
const PB_REDIRECT = `${PB_URL}/api/oauth2-redirect`;

function httpReq(url, method, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const opts = {
      hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search, method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const req = mod.request(opts, res => {
      let b = ''; res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(b) }); }
        catch { resolve({ status: res.statusCode, data: b }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function main() {
  console.log('=== PocketBase Google OAuth2 Setup ===\n');

  // 1. GCP access token
  console.log('1. GCP access token alınıyor...');
  let gcpToken;
  try {
    gcpToken = execSync('gcloud auth print-access-token 2>nul', { encoding: 'utf8' }).trim();
    console.log('   ✓ GCP token alındı\n');
  } catch (e) {
    console.error('   ✗ gcloud auth gerekli. "gcloud auth login" çalıştırın.');
    process.exit(1);
  }

  // 2. Check existing OAuth2 clients
  console.log('2. Mevcut OAuth2 client\'lar kontrol ediliyor...');
  
  // List OAuth consent screen brands
  const brandsResp = await httpReq(
    `https://iap.googleapis.com/v1/projects/${PROJECT_NUMBER}/brands`,
    'GET', { Authorization: `Bearer ${gcpToken}` }
  );
  
  let brandName;
  if (brandsResp.data.brands && brandsResp.data.brands.length > 0) {
    brandName = brandsResp.data.brands[0].name;
    console.log(`   ✓ Brand bulundu: ${brandName}\n`);
  } else {
    console.log('   Brand bulunamadı, oluşturuluyor...');
    const createBrand = await httpReq(
      `https://iap.googleapis.com/v1/projects/${PROJECT_NUMBER}/brands`,
      'POST', { Authorization: `Bearer ${gcpToken}` },
      { applicationTitle: 'Compair', supportEmail: PB_ADMIN_EMAIL }
    );
    if (createBrand.status >= 400) {
      console.error('   ✗ Brand oluşturulamadı:', JSON.stringify(createBrand.data));
      console.log('\n   Google Cloud Console\'dan OAuth consent screen ayarlayın.');
      console.log('   → https://console.cloud.google.com/apis/credentials/consent?project=' + PROJECT_ID);
      // Continue anyway - the web client might already exist
    } else {
      brandName = createBrand.data.name;
      console.log(`   ✓ Brand oluşturuldu: ${brandName}\n`);
    }
  }

  // 3. Try to find existing web client or use the known one
  const WEB_CLIENT_ID = '510980756238-budtd0gdrlk91jmim11frucvue5muhbg.apps.googleusercontent.com';
  
  // Try to download client secret JSON from Google Cloud
  console.log('3. Web client secret alınıyor...');
  
  // The only reliable way is via the Credentials page download.
  // Try the service account approach - generate a new OAuth2 client for PB
  // OR: try the Google Cloud API to get client info
  
  let clientSecret = null;
  
  // Method 1: Try existing service accounts / clients
  const clientInfoResp = await httpReq(
    `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${gcpToken}`,
    'GET', {}
  );
  console.log('   Token info:', clientInfoResp.data.email || 'unknown');
  
  // Method 2: Try to create a new client via IAP API
  if (brandName) {
    const listClients = await httpReq(
      `https://iap.googleapis.com/v1/${brandName}/identityAwareProxyClients`,
      'GET', { Authorization: `Bearer ${gcpToken}` }
    );
    
    if (listClients.data.identityAwareProxyClients) {
      for (const c of listClients.data.identityAwareProxyClients) {
        console.log(`   Mevcut IAP client: ${c.name}`);
        if (c.secret) clientSecret = c.secret;
      }
    }
    
    if (!clientSecret) {
      console.log('   Yeni IAP client oluşturuluyor (PocketBase için)...');
      const createClient = await httpReq(
        `https://iap.googleapis.com/v1/${brandName}/identityAwareProxyClients`,
        'POST', { Authorization: `Bearer ${gcpToken}` },
        { displayName: 'PocketBase Compair' }
      );
      
      if (createClient.status < 400 && createClient.data.secret) {
        clientSecret = createClient.data.secret;
        const newClientId = createClient.data.name.split('/').pop();
        console.log(`   ✓ Yeni client oluşturuldu: ${newClientId}`);
        console.log(`   ✓ Client Secret: ${clientSecret.substring(0, 8)}...`);
      }
    }
  }
  
  // If we couldn't get the secret automatically, ask user
  if (!clientSecret) {
    console.log('\n   ⚠ Client secret otomatik alınamadı.');
    console.log('   → Google Cloud Console > APIs & Services > Credentials');
    console.log(`   → ${WEB_CLIENT_ID} client\'ını seçin`);
    console.log('   → Client secret\'ı kopyalayın');
    console.log(`   → https://console.cloud.google.com/apis/credentials?project=${PROJECT_ID}`);
    
    // Check for environment variable
    if (process.env.GOOGLE_CLIENT_SECRET) {
      clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      console.log('   ✓ GOOGLE_CLIENT_SECRET env variable bulundu.');
    } else {
      const readline = require('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      clientSecret = await new Promise(resolve => {
        rl.question('\n   Google Web Client Secret girin: ', answer => {
          rl.close();
          resolve(answer.trim());
        });
      });
    }
  }
  
  if (!clientSecret) {
    console.error('   ✗ Client secret gerekli!');
    process.exit(1);
  }

  // 4. Configure PocketBase
  console.log('\n4. PocketBase admin girişi yapılıyor...');
  const authResp = await httpReq(
    `${PB_URL}/api/collections/_superusers/auth-with-password`,
    'POST', {},
    { identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD }
  );
  
  if (authResp.status >= 400) {
    console.error('   ✗ PB admin giriş başarısız:', authResp.data);
    process.exit(1);
  }
  const pbToken = authResp.data.token;
  console.log('   ✓ PB admin girişi başarılı\n');

  // 5. Get current users collection config
  console.log('5. Users collection ayarları güncelleniyor...');
  const collResp = await httpReq(
    `${PB_URL}/api/collections/users`,
    'GET', { Authorization: pbToken }
  );
  
  if (collResp.status >= 400) {
    console.error('   ✗ Collection bilgisi alınamadı:', collResp.data);
    process.exit(1);
  }
  
  const collection = collResp.data;
  
  // Add redirect URI to Google Cloud Console
  console.log(`   PB Redirect URI: ${PB_REDIRECT}`);
  console.log(`   ⚠ Bu URI'yi Google Cloud Console'da OAuth2 client'ın`);
  console.log(`   "Authorized redirect URIs" listesine eklemeyi unutmayın!`);
  
  // Update OAuth2 settings
  collection.oauth2 = {
    enabled: true,
    providers: [
      {
        name: 'google',
        clientId: WEB_CLIENT_ID,
        clientSecret: clientSecret,
        authURL: '',
        tokenURL: '',
        userInfoURL: '',
        displayName: 'Google',
        pkce: null,
        state: '',
      }
    ],
    mappedFields: {
      id: '',
      name: 'name',
      username: '',
      avatarURL: 'avatar',
    },
  };

  const updateResp = await httpReq(
    `${PB_URL}/api/collections/users`,
    'PATCH', { Authorization: pbToken },
    collection
  );
  
  if (updateResp.status >= 400) {
    console.error('   ✗ Collection güncellenemedi:', JSON.stringify(updateResp.data));
    process.exit(1);
  }
  
  console.log('   ✓ Google OAuth2 provider etkinleştirildi!\n');

  // 6. Verify
  const verifyResp = await httpReq(
    `${PB_URL}/api/collections/users/auth-methods`,
    'GET', {}
  );
  console.log('6. Auth methods:', JSON.stringify(verifyResp.data.oauth2, null, 2));
  
  console.log('\n=== Kurulum tamamlandı! ===');
  console.log(`
Yapılması gerekenler:
1. Google Cloud Console'da this redirect URI'yi ekleyin:
   ${PB_REDIRECT}
   
   → https://console.cloud.google.com/apis/credentials/oauthclient/${WEB_CLIENT_ID}?project=${PROJECT_ID}

2. Flutter uygulamayı yeniden build edin
  `);
}

main().catch(e => { console.error('Hata:', e); process.exit(1); });
