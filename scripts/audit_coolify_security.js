const fs = require('fs');
const path = require('path');

const DEFAULT_APP_UUIDS = {
  admin: 'z1221ae58okr865xdquykps8',
  website: 'qpq5eb1emz17386uh8jgj76q',
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

function isIpHost(hostname) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
}

function formatRisk(level, title, detail) {
  return { level, title, detail };
}

function collectDashboardRisks(baseUrl) {
  const url = new URL(baseUrl);
  const risks = [];

  if (url.protocol !== 'https:') {
    risks.push(
      formatRisk(
        'HIGH',
        'Coolify panel HTTPS kullanmıyor',
        `Panel URL şu anda ${url.origin} olarak ayarlı. Yönetim paneli HTTP üstünden açıksa oturum ve token trafiği şifrelenmez.`,
      ),
    );
  }

  if (isIpHost(url.hostname)) {
    risks.push(
      formatRisk(
        'HIGH',
        'Coolify panel doğrudan IP üzerinden erişiliyor',
        `Panel hostname ${url.hostname}. Yönetim panelini domain + TLS arkasına almak ve doğrudan IP erişimini kapatmak daha güvenlidir.`,
      ),
    );
  }

  if (url.port === '8000') {
    risks.push(
      formatRisk(
        'HIGH',
        'Coolify panel varsayılan 8000 portunda açık',
        'Public 8000 erişimi bırakmak yerine paneli reverse proxy, VPN veya erişim kısıtı arkasına almalısın.',
      ),
    );
  }

  return risks;
}

function collectAppRisks(app, key) {
  const risks = [];
  const fqdn = app.fqdn || '';
  const lowerName = `${app.name || ''}`.toLowerCase();
  const isAdminSurface = key === 'admin' || lowerName.includes('admin');

  if (!fqdn) {
    risks.push(
      formatRisk(
        'HIGH',
        `${app.name || key} için FQDN tanımlı değil`,
        'TLS ve yönlendirme için uygulamanın FQDN alanı boş olmamalı.',
      ),
    );
    return risks;
  }

  if (!fqdn.startsWith('https://')) {
    risks.push(
      formatRisk(
        'HIGH',
        `${app.name || key} HTTPS kullanmıyor`,
        `Uygulama FQDN değeri ${fqdn}. Statik/admin yüzeylerinde HTTPS zorunlu olmalı.`,
      ),
    );
  }

  if (fqdn.includes('sslip.io')) {
    risks.push(
      formatRisk(
        isAdminSurface ? 'MEDIUM' : 'LOW',
        `${app.name || key} sslip.io üzerinde yayınlanıyor`,
        'sslip.io TLS alabilir ama üretimde panel.qorai.app, admin.qorai.app veya api.qorai.app gibi özel domainler daha doğru olur.',
      ),
    );
  }

  if (isAdminSurface && app.is_http_basic_auth_enabled === false) {
    risks.push(
      formatRisk(
        'MEDIUM',
        `${app.name || key} edge basic auth kapalı`,
        'Admin panelinde uygulama içi auth olsa da edge katmanında ek HTTP basic auth veya ağ kısıtı savunmayı güçlendirir.',
      ),
    );
  }

  if (app.redirect !== 'both') {
    risks.push(
      formatRisk(
        'LOW',
        `${app.name || key} redirect modu optimize değil`,
        `redirect alanı ${app.redirect ?? 'tanımsız'}. HTTPS yönlendirmesinin açık olması gerekir.`,
      ),
    );
  }

  return risks;
}

async function loadApplication(uuid, token, baseUrl) {
  try {
    return await coolifyRequest('GET', `/api/v1/applications/${uuid}`, token, baseUrl);
  } catch (error) {
    return { error: error.message, uuid };
  }
}

async function main() {
  const envPath = path.join(__dirname, '..', 'migration', '.env');
  const env = readEnvFile(envPath);
  const token = env.COOLIFY_TOKEN;
  const baseUrl = env.COOLIFY_URL?.replace(/\/$/, '');

  if (!token || !baseUrl) {
    throw new Error('COOLIFY_URL / COOLIFY_TOKEN missing in migration/.env');
  }

  const appUuids = {
    ...DEFAULT_APP_UUIDS,
    ...(env.POCKETBASE_APP_UUID ? { pocketbase: env.POCKETBASE_APP_UUID } : {}),
  };

  const dashboardRisks = collectDashboardRisks(baseUrl);
  const applications = await Promise.all(
    Object.entries(appUuids).map(async ([key, uuid]) => [
      key,
      await loadApplication(uuid, token, baseUrl),
    ]),
  );

  const report = [];
  for (const [key, app] of applications) {
    if (app.error) {
      report.push({
        key,
        name: key,
        uuid: app.uuid,
        fqdn: '-',
        risks: [formatRisk('MEDIUM', `${key} uygulaması okunamadı`, app.error)],
      });
      continue;
    }

    report.push({
      key,
      name: app.name || key,
      uuid: app.uuid,
      fqdn: app.fqdn || '-',
      sourceType: app.source_type || '-',
      privateKeyId: app.private_key_id ?? '-',
      redirect: app.redirect ?? '-',
      httpBasicAuth: app.is_http_basic_auth_enabled === true,
      risks: collectAppRisks(app, key),
    });
  }

  const allRisks = [...dashboardRisks, ...report.flatMap((item) => item.risks)];
  const highCount = allRisks.filter((item) => item.level === 'HIGH').length;
  const mediumCount = allRisks.filter((item) => item.level === 'MEDIUM').length;
  const lowCount = allRisks.filter((item) => item.level === 'LOW').length;

  console.log('=== Coolify Security Audit ===');
  console.log(`Dashboard: ${baseUrl}`);
  console.log(`Findings => HIGH:${highCount} MEDIUM:${mediumCount} LOW:${lowCount}`);
  console.log('');

  if (dashboardRisks.length) {
    console.log('[Dashboard Risks]');
    for (const risk of dashboardRisks) {
      console.log(`- ${risk.level}: ${risk.title}`);
      console.log(`  ${risk.detail}`);
    }
    console.log('');
  }

  console.log('[Applications]');
  for (const item of report) {
    console.log(`- ${item.key}: ${item.name}`);
    console.log(`  UUID: ${item.uuid}`);
    console.log(`  FQDN: ${item.fqdn}`);
    if (item.sourceType) console.log(`  Source: ${item.sourceType}`);
    if (item.privateKeyId !== undefined) console.log(`  Private Key ID: ${item.privateKeyId}`);
    if (item.redirect !== undefined) console.log(`  Redirect: ${item.redirect}`);
    if (item.httpBasicAuth !== undefined) console.log(`  HTTP Basic Auth: ${item.httpBasicAuth ? 'enabled' : 'disabled'}`);
    if (!item.risks.length) {
      console.log('  Risks: none detected by this audit');
    } else {
      for (const risk of item.risks) {
        console.log(`  - ${risk.level}: ${risk.title}`);
        console.log(`    ${risk.detail}`);
      }
    }
  }

  console.log('');
  console.log('[Recommended Next Steps]');
  console.log('1. Coolify dashboard URL\'ini panel.qorai.app gibi HTTPS bir domain arkasına al ve public :8000 erişimini kapat.');
  console.log('2. Admin uygulamasını admin.qorai.app, website\'i qorai.app / www.qorai.app alanlarına taşı.');
  console.log('3. Dashboard erişimini firewall, VPN veya Cloudflare/Tailscale ile sınırla.');
  console.log('4. Admin surface için edge katmanında ek auth veya ağ kısıtı uygula.');
  console.log('5. Token ve admin session\'ları HTTP kullanımından sonra rotate et.');

  if (highCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});