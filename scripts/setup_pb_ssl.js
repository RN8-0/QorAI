/**
 * Coolify + PB SSL + Google OAuth full setup script
 * 1. Coolify'da PB uygulamasına SSL (Let's Encrypt) ekle
 * 2. PB URL'sini HTTPS olarak güncelle  
 * 3. Google Cloud Console'a redirect URI ekle (manual step)
 * 4. Flutter uygulamadaki PB URL'yi HTTPS'e çevir
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '..', 'migration', '.env'), 'utf8')
    .split('\n').filter(l => l.includes('=')).map(l => {
      const [k, ...v] = l.split('=');
      return [k.trim(), v.join('=').trim()];
    })
);

const COOLIFY_URL = env.COOLIFY_URL;
const COOLIFY_TOKEN = env.COOLIFY_TOKEN;
const PB_UUID = env.POCKETBASE_APP_UUID;

function coolifyReq(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(COOLIFY_URL + apiPath);
    const opts = {
      hostname: u.hostname, port: u.port || 80,
      path: u.pathname + u.search, method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${COOLIFY_TOKEN}`,
        'Accept': 'application/json',
      },
    };
    const req = http.request(opts, res => {
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
  console.log('=== PocketBase HTTPS Kurulumu (Coolify) ===\n');

  // 1. Get PB application details
  console.log('1. PB uygulama bilgisini alınıyor...');
  const appResp = await coolifyReq('GET', `/api/v1/applications/${PB_UUID}`);
  if (appResp.status >= 400) {
    console.error('   ✗ Uygulama bulunamadı:', appResp.status, JSON.stringify(appResp.data).substring(0, 200));
    
    // Try listing all applications
    console.log('\n   Tüm uygulamalar listeleniyor...');
    const allApps = await coolifyReq('GET', '/api/v1/applications');
    if (allApps.status === 200) {
      const apps = Array.isArray(allApps.data) ? allApps.data : [];
      apps.forEach(a => console.log(`   - ${a.uuid}: ${a.name} (${a.fqdn || 'no domain'})`));
    } else {
      // Try resources
      const resources = await coolifyReq('GET', '/api/v1/resources');
      console.log('   Resources status:', resources.status);
      if (resources.status === 200 && Array.isArray(resources.data)) {
        resources.data.forEach(r => console.log(`   - ${r.uuid || r.id}: ${r.name} type=${r.type}`));
      } else {
        console.log('   Data:', JSON.stringify(resources.data).substring(0, 500));
      }
    }
    return;
  }

  const app = appResp.data;
  console.log(`   ✓ App: ${app.name} (${app.fqdn || app.domains})`);
  console.log(`   SSL cert: ${app.ssl_cert || 'none'}`);
  console.log(`   Full data keys:`, Object.keys(app).join(', '));
  
  // 2. Try to enable SSL
  console.log('\n2. SSL etkinleştiriliyor...');
  
  // Coolify v4 uses FQDN with https:// prefix for SSL
  const currentFqdn = app.fqdn || '';
  const httpsFqdn = currentFqdn.replace('http://', 'https://');
  
  console.log(`   Current FQDN: ${currentFqdn}`);
  console.log(`   Target FQDN:  ${httpsFqdn}`);
  
  const updateResp = await coolifyReq('PATCH', `/api/v1/applications/${PB_UUID}`, {
    fqdn: httpsFqdn,
  });
  
  console.log(`   Update status: ${updateResp.status}`);
  if (updateResp.status < 400) {
    console.log('   ✓ FQDN HTTPS olarak güncellendi');
  } else {
    console.log('   ✗ Güncelleme başarısız:', JSON.stringify(updateResp.data).substring(0, 300));
  }
}

main().catch(e => console.error('Hata:', e));
