const fs = require('fs');
const path = require('path');

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

async function coolifyRequest(method, apiPath, token, baseUrl, body) {
  const response = await fetch(`${baseUrl}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
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

function normalizeFqdn(value) {
  const fqdn = String(value || '').trim();
  if (!fqdn) return '';
  const items = fqdn
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  if (!items.length) return '';
  for (const item of items) {
    if (!item.startsWith('https://')) {
      throw new Error(`FQDN must start with https:// -> ${item}`);
    }
  }

  return items.join(',');
}

async function patchApp(uuid, desiredFqdn, token, baseUrl) {
  const current = await coolifyRequest(
    'GET',
    `/api/v1/applications/${uuid}`,
    token,
    baseUrl,
  );

  if (current.fqdn === desiredFqdn) {
    return {
      uuid: current.uuid,
      name: current.name,
      fqdn: current.fqdn,
      changed: false,
    };
  }

  const updated = await coolifyRequest(
    'PATCH',
    `/api/v1/applications/${uuid}`,
    token,
    baseUrl,
    {
      fqdn: desiredFqdn,
      redirect: current.redirect ?? 'both',
    },
  );

  return {
    uuid: updated.uuid,
    name: updated.name,
    fqdn: updated.fqdn,
    changed: true,
  };
}

async function main() {
  const envPath = path.join(__dirname, '..', 'migration', '.env');
  const env = readEnvFile(envPath);
  const token = env.COOLIFY_TOKEN;
  const baseUrl = env.COOLIFY_URL?.replace(/\/$/, '');

  if (!token || !baseUrl) {
    throw new Error('COOLIFY_URL / COOLIFY_TOKEN missing in migration/.env');
  }

  const appConfigs = [
    {
      key: 'admin',
      uuid: 'z1221ae58okr865xdquykps8',
      fqdn:
        process.env.COOLIFY_ADMIN_APP_FQDN || env.COOLIFY_ADMIN_APP_FQDN || '',
    },
    {
      key: 'website',
      uuid: 'qpq5eb1emz17386uh8jgj76q',
      fqdn:
        process.env.COOLIFY_WEBSITE_FQDN ||
        env.COOLIFY_WEBSITE_FQDN ||
        '',
    },
    ...(env.POCKETBASE_APP_UUID
        ? [
            {
              key: 'pocketbase',
              uuid: env.POCKETBASE_APP_UUID,
              fqdn:
                process.env.COOLIFY_POCKETBASE_FQDN ||
                env.COOLIFY_POCKETBASE_FQDN ||
                '',
            },
          ]
        : []),
  ];

  const planned = appConfigs
    .map((item) => ({ ...item, fqdn: normalizeFqdn(item.fqdn) }))
    .filter((item) => item.fqdn);

  if (!planned.length) {
    throw new Error(
      'Set at least one of COOLIFY_ADMIN_APP_FQDN, COOLIFY_WEBSITE_FQDN, COOLIFY_POCKETBASE_FQDN in migration/.env or environment variables.',
    );
  }

  for (const item of planned) {
    const result = await patchApp(item.uuid, item.fqdn, token, baseUrl);
    console.log(
      JSON.stringify(
        {
          key: item.key,
          uuid: result.uuid,
          name: result.name,
          fqdn: result.fqdn,
          changed: result.changed,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});