const fs = require('fs');
const path = require('path');

const APP_UUIDS = {
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
