const https = require('https');
const { execSync } = require('child_process');

const token = execSync('gcloud auth print-access-token 2>nul', { encoding: 'utf8' }).trim();
const PROJECT_ID = 'compair-99b6e';
const CLIENT_ID = '510980756238-budtd0gdrlk91jmim11frucvue5muhbg.apps.googleusercontent.com';
const PB_REDIRECT = 'http://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io/api/oauth2-redirect';

// First, get the current client configuration
function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'oauth2.googleapis.com',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-goog-user-project': PROJECT_ID,
      },
    };
    const req = https.request(opts, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(b) }); }
        catch { resolve({ status: res.statusCode, data: b }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  // The Google Cloud Console Credentials API doesn't have a direct REST endpoint
  // for updating OAuth2 clients' redirect URIs.
  // We need to use the Google API services config or handle it manually.
  
  // Alternative: Use the iamcredentials or cloud resource manager approach
  // Actually, there's no public REST API for this. Must use console or gcloud.
  
  // Let's try to add via the Google Cloud API
  // ...nope, this isn't publicly available. Print instructions instead.
  
  console.log('\n=== Google Cloud Console Redirect URI Ekleme ===\n');
  console.log('PocketBase OAuth2 çalışması için şu URI\'yi Google Cloud Console\'da ekleyin:\n');
  console.log(`  Redirect URI: ${PB_REDIRECT}\n`);
  console.log('Adımlar:');
  console.log(`1. https://console.cloud.google.com/apis/credentials?project=${PROJECT_ID} adresine gidin`);
  console.log(`2. "${CLIENT_ID}" client'ına tıklayın (Web client)`);
  console.log(`3. "Authorized redirect URIs" bölümüne bu URI'yi ekleyin:`);
  console.log(`   ${PB_REDIRECT}`);
  console.log('4. Save\'e tıklayın\n');
  
  // Actually, let's try using the Admin SDK approach
  // Firebase Auth'daki authorized domains listesine PB domainini de ekleyelim
  const domainResp = await apiRequest('GET',
    ''); // No good endpoint
  
  console.log('Not: Bu işlem sadece Google Cloud Console\'dan yapılabilir.');
  console.log('REST API ile redirect URI güncelleme desteklenmiyor.\n');
}

main();
