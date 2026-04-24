const fs = require('fs');
const path = require('path');

const ADMIN_APP_UUID = 'z1221ae58okr865xdquykps8';

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

async function main() {
  const envPath = path.join(__dirname, '..', 'migration', '.env');
  const env = readEnvFile(envPath);
  const token = env.COOLIFY_TOKEN;
  const baseUrl = env.COOLIFY_URL?.replace(/\/$/, '');
  const username =
    process.env.COOLIFY_ADMIN_BASIC_AUTH_USERNAME ||
    env.COOLIFY_ADMIN_BASIC_AUTH_USERNAME;
  const password =
    process.env.COOLIFY_ADMIN_BASIC_AUTH_PASSWORD ||
    env.COOLIFY_ADMIN_BASIC_AUTH_PASSWORD;

  if (!token || !baseUrl) {
    throw new Error('COOLIFY_URL / COOLIFY_TOKEN missing in migration/.env');
  }

  if (!username || !password) {
    throw new Error(
      'COOLIFY_ADMIN_BASIC_AUTH_USERNAME and COOLIFY_ADMIN_BASIC_AUTH_PASSWORD must be set in the environment or migration/.env',
    );
  }

  const current = await coolifyRequest(
    'GET',
    `/api/v1/applications/${ADMIN_APP_UUID}`,
    token,
    baseUrl,
  );

  const payload = {
    fqdn: current.fqdn,
    redirect: current.redirect ?? 'both',
    is_http_basic_auth_enabled: true,
    http_basic_auth_username: username,
    http_basic_auth_password: password,
  };

  const updated = await coolifyRequest(
    'PATCH',
    `/api/v1/applications/${ADMIN_APP_UUID}`,
    token,
    baseUrl,
    payload,
  );

  console.log('Coolify admin edge basic auth enabled.');
  console.log(
    JSON.stringify(
      {
        uuid: updated.uuid,
        fqdn: updated.fqdn,
        is_http_basic_auth_enabled: updated.is_http_basic_auth_enabled,
        http_basic_auth_username: updated.http_basic_auth_username,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});