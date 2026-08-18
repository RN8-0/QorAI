const fs = require('fs');
const path = require('path');

const APP_UUIDS = {
  admin: 'z1221ae58okr865xdquykps8',
  website: 'z12jcqfpvl0m7l3nv9t6l5jl',
};

function readEnvFile(filePath) {
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
}

async function coolifyRequest(method, apiPath, token, baseUrl) {
  const response = await fetch(`${baseUrl}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    throw new Error(
      `Coolify request failed (${response.status}) ${apiPath}: ${
        typeof data === 'string' ? data : JSON.stringify(data)
      }`,
    );
  }

  return data;
}

async function deployApp(target, token, baseUrl) {
  const uuid = APP_UUIDS[target];
  if (!uuid) {
    throw new Error(`Unknown deploy target: ${target}`);
  }

  const deployment = await coolifyRequest(
    'GET',
    `/api/v1/deploy?uuid=${uuid}&force=false`,
    token,
    baseUrl,
  );

  console.log(`[coolify] ${target} deployment requested`, deployment);

  // ── HER DEPLOY'DA PURGE ETMEK ZORUNDA DEGILSIN ────────────────────────────
  // 2026-08-16'da `qorai.net/*` icin bir PAGE RULE eklendi:
  // Cache Everything + Edge Cache TTL = 2 saat. Bu, HTML'i edge'de tutarak
  // TTFB'yi dusuruyor AMA origin'in kendi talimatini EZIYOR.
  //
  // OLCULDU (2026-08-18, canli):
  //   origin basligi : Cache-Control: max-age=120   (yani "beni 2 dk tut")
  //   edge davranisi : Age 220 sn'de hala HIT       (yani 2 saat tutuyor)
  // Purge zorunlulugunun TEK sebebi bu ezme.
  //
  // TEK SEFERLIK COZUM (dashboard, ~30 sn) — bundan sonra purge GEREKMEZ:
  //   Cloudflare > qorai.net > Rules > Page Rules > `qorai.net/*` > Edit
  //   "Edge Cache TTL" ayarini KALDIR ya da "Respect existing headers" yap.
  //   ("Cache Everything" KALSIN — hiz avantaji ondan geliyor.)
  //   DIKKAT: bu ayar Caching > Cache Rules sayfasinda DEGIL (orasi bos
  //   gorunuyor); LEGACY Page Rules altinda.
  // Sonuc: yeni HTML en gec 2 DAKIKADA kendiliginden yayilir.
  //
  // Alternatif (tam otomatik purge): `Cache Purge` izinli bir Cloudflare API
  // token'i uret ve .env'ye CF_API_TOKEN olarak koy — scripts/_cf.mjs `purge`
  // komutu hazir, tek eksik o.
  if (target === 'website' || target === 'all') {
    console.log('');
    console.log('[cloudflare] HTML edge onbellekte. Yeni surumun ne kadar surede');
    console.log('[cloudflare] yayilacagi Page Rule icindeki "Edge Cache TTL"e bagli.');
    console.log('[cloudflare] Purge zorunlulugunu TEK SEFERDE kaldirmak icin:');
    console.log('[cloudflare]   Rules > Page Rules > qorai.net/* > Edge Cache TTL');
    console.log('[cloudflare]   -> "Respect existing headers" (origin zaten max-age=120 diyor)');
    console.log('[cloudflare]   https://dash.cloudflare.com/?to=/:account/qorai.net/rules');
    console.log('[cloudflare] Simdilik hemen gormek istersen elle temizle:');
    console.log('[cloudflare]   https://dash.cloudflare.com/?to=/:account/qorai.net/caching/configuration');
  }
}

async function main() {
  const target = process.argv[2] || 'all';
  const envPath = path.join(__dirname, '..', 'migration', '.env');
  const env = readEnvFile(envPath);
  const token = env.COOLIFY_TOKEN;
  const baseUrl = env.COOLIFY_URL.replace(/\/$/, '');

  if (!token || !baseUrl) {
    throw new Error('COOLIFY_URL / COOLIFY_TOKEN missing in migration/.env');
  }

  const targets = target === 'all' ? ['admin', 'website'] : [target];
  for (const item of targets) {
    await deployApp(item, token, baseUrl);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
