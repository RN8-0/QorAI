const http = require('http');
const fs = require('fs');
const path = require('path');

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => {
      const [k, ...v] = l.split('=');
      return [k.trim(), v.join('=').trim()];
    })
);

const PB_URL = env.POCKETBASE_URL;
const clientSecret = fs.readFileSync(path.join(__dirname, 'google_secret.txt'), 'utf8').trim();
const WEB_CLIENT_ID = '510980756238-budtd0gdrlk91jmim11frucvue5muhbg.apps.googleusercontent.com';

function httpReq(urlStr, method, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const opts = {
      hostname: u.hostname, port: u.port || 80,
      path: u.pathname + u.search, method,
      headers: { 'Content-Type': 'application/json', ...headers },
    };
    const req = http.request(opts, res => {
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
  console.log('=== PocketBase Google OAuth2 Kurulumu ===\n');

  // 1. Admin auth
  console.log('1. PB admin girişi...');
  const auth = await httpReq(
    `${PB_URL}/api/collections/_superusers/auth-with-password`,
    'POST', {},
    { identity: env.POCKETBASE_ADMIN_EMAIL, password: env.POCKETBASE_ADMIN_PASSWORD }
  );
  if (auth.status >= 400) { console.error('Auth failed:', auth.data); process.exit(1); }
  const token = auth.data.token;
  console.log('   ✓ Giriş başarılı\n');

  // 2. Get users collection
  console.log('2. Users collection alınıyor...');
  const coll = await httpReq(`${PB_URL}/api/collections/users`, 'GET', { Authorization: token });
  if (coll.status >= 400) { console.error('Collection fetch failed:', coll.data); process.exit(1); }
  
  const collection = coll.data;
  console.log('   ✓ Collection alındı (id:', collection.id, ')\n');

  // 3. Update OAuth2 settings
  console.log('3. Google OAuth2 provider ekleniyor...');
  console.log('   Client ID:', WEB_CLIENT_ID);
  console.log('   Client Secret:', clientSecret.substring(0, 10) + '...');
  
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
      }
    ],
    mappedFields: {
      id: '',
      name: 'name',
      username: '',
      avatarURL: 'avatar',
    },
  };

  const update = await httpReq(
    `${PB_URL}/api/collections/users`,
    'PATCH', { Authorization: token },
    collection
  );
  
  if (update.status >= 400) {
    console.error('   ✗ Güncelleme başarısız:', JSON.stringify(update.data));
    process.exit(1);
  }
  console.log('   ✓ Google OAuth2 provider etkinleştirildi!\n');

  // 4. Verify
  console.log('4. Doğrulama...');
  const verify = await httpReq(`${PB_URL}/api/collections/users/auth-methods`, 'GET', {});
  console.log('   OAuth2 enabled:', verify.data.oauth2?.enabled);
  console.log('   Providers:', verify.data.oauth2?.providers?.map(p => p.name).join(', ') || 'none');
  
  console.log('\n=== ✓ Kurulum tamamlandı! ===');
  console.log(`\n⚠ Google Cloud Console'da Authorized redirect URI ekleyin:`);
  console.log(`  ${PB_URL}/api/oauth2-redirect`);
  console.log(`  → https://console.cloud.google.com/apis/credentials?project=compair-99b6e`);
}

main().catch(e => { console.error('Hata:', e); process.exit(1); });
