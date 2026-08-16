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

  // 2026-08-16: qorai.net'in HTML'i artik Cloudflare EDGE'inde onbellekleniyor
  // (Page Rule: `qorai.net/*` -> Cache Everything, Edge TTL 2 saat). Olculdu:
  // `cf-cache-status` DYNAMIC -> HIT, yani her sayfa istegi artik origin'e
  // gitmiyor. Bunun bedeli su: deploy edilen yeni HTML, edge'deki eski kopya
  // dusene kadar gorunmez.
  // Otomatik purge icin `Cache Purge` izinli bir Cloudflare API token'i gerekir
  // (scripts/_cf.mjs `purge` komutu hazir, tek eksik token). O yoksa asagidaki
  // adres elle tiklanir.
  if (target === 'website' || target === 'all') {
    console.log('');
    console.log('[cloudflare] HTML edge onbellekte (Edge TTL 2 saat).');
    console.log('[cloudflare] Degisikligi HEMEN gormek icin onbellegi temizle:');
    console.log('[cloudflare]   https://dash.cloudflare.com/?to=/:account/qorai.net/caching/configuration');
    console.log('[cloudflare] Temizlemezsen en gec 2 saatte kendiliginden tazelenir.');
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
