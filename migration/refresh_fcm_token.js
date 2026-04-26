#!/usr/bin/env node
// Refresh FCM access token in PocketBase app_config.
// Run this script every 50 minutes (Windows Task Scheduler or manually).
//
// Usage:
//   node migration/refresh_fcm_token.js
//
// Setup (one-time):
//   1. Set PB_ADMIN_EMAIL and PB_ADMIN_PASSWORD env vars (or edit defaults below)
//   2. Schedule with Windows Task Scheduler every 50 minutes

const https = require('https');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const PB_URL = process.env.POCKETBASE_URL || 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';
const PB_ADMIN_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || 'admin@qorai.local';
const PB_ADMIN_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || '';

const FIREBASE_CLIENT_ID =
  '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

// ── Helpers ───────────────────────────────────────────────────────────────────
function request(url, options, body) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https');
    const mod = isHttps ? https : http;
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    const req = mod.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ── Step 1: Get fresh Google OAuth2 access token ─────────────────────────────
async function getGoogleAccessToken() {
  // Try using stored refresh_token from firebase-tools
  const configPath = path.join(
    os.homedir(),
    '.config',
    'configstore',
    'firebase-tools.json',
  );

  if (!fs.existsSync(configPath)) {
    throw new Error(
      'firebase-tools.json not found. Run "firebase login" first.',
    );
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const refreshToken = config?.tokens?.refresh_token;
  if (!refreshToken) throw new Error('No refresh_token in firebase-tools.json');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: FIREBASE_CLIENT_ID,
    client_secret: FIREBASE_CLIENT_SECRET,
    refresh_token: refreshToken,
  }).toString();

  const resp = await request(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    body,
  );

  if (resp.status !== 200) {
    throw new Error(`Token refresh failed (${resp.status}): ${resp.body}`);
  }

  const result = JSON.parse(resp.body);
  const newAccessToken = result.access_token;

  // Persist new access_token back to firebase-tools.json
  config.tokens.access_token = newAccessToken;
  config.tokens.expires_at = Date.now() + (result.expires_in || 3600) * 1000;
  fs.writeFileSync(configPath, JSON.stringify(config, null, '\t'), 'utf8');
  console.log('[1] Google access token refreshed (expires_in:', result.expires_in, 's)');
  return newAccessToken;
}

// ── Step 2: Authenticate with PocketBase admin ────────────────────────────────
async function pbAdminLogin() {
  if (!PB_ADMIN_PASSWORD) {
    throw new Error(
      'Set PB_ADMIN_PASSWORD env var or edit the script. Example:\n' +
        '  PB_ADMIN_PASSWORD=yourpass node migration/refresh_fcm_token.js',
    );
  }

  const body = JSON.stringify({
    identity: PB_ADMIN_EMAIL,
    password: PB_ADMIN_PASSWORD,
  });

  const resp = await request(
    `${PB_URL}/api/admins/auth-with-password`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    body,
  );

  if (resp.status !== 200) {
    // Try superusers endpoint (PB v0.23+)
    const resp2 = await request(
      `${PB_URL}/api/collections/_superusers/auth-with-password`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      body,
    );
    if (resp2.status !== 200) {
      throw new Error(`PB admin login failed (${resp2.status}): ${resp2.body}`);
    }
    const d2 = JSON.parse(resp2.body);
    console.log('[2] PocketBase superuser authenticated');
    return d2.token;
  }

  const d = JSON.parse(resp.body);
  console.log('[2] PocketBase admin authenticated');
  return d.token;
}

// ── Step 3: Update app_config.fcm_access_token in PocketBase ─────────────────
async function updatePbFcmToken(pbToken, accessToken) {
  // List app_config records to find the fcm_access_token entry
  const listResp = await request(
    `${PB_URL}/api/collections/app_config/records?filter=key='fcm_access_token'&perPage=1`,
    {
      method: 'GET',
      headers: { Authorization: pbToken },
    },
  );

  if (listResp.status !== 200) {
    throw new Error(`Could not list app_config (${listResp.status}): ${listResp.body}`);
  }

  const listData = JSON.parse(listResp.body);
  const records = listData.items || [];

  if (records.length === 0) {
    // Create new record
    const body = JSON.stringify({ key: 'fcm_access_token', value: accessToken });
    const createResp = await request(
      `${PB_URL}/api/collections/app_config/records`,
      {
        method: 'POST',
        headers: {
          Authorization: pbToken,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      body,
    );
    if (createResp.status !== 200) {
      throw new Error(`Could not create app_config record: ${createResp.body}`);
    }
    console.log('[3] Created new fcm_access_token in app_config');
  } else {
    // Update existing record
    const id = records[0].id;
    const body = JSON.stringify({ value: accessToken });
    const updateResp = await request(
      `${PB_URL}/api/collections/app_config/records/${id}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: pbToken,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      body,
    );
    if (updateResp.status !== 200) {
      throw new Error(`Could not update app_config record: ${updateResp.body}`);
    }
    console.log('[3] Updated fcm_access_token in app_config (record:', id + ')');
  }
}

// ── Step 4: Ensure fcm_project_id is set ─────────────────────────────────────
async function ensureProjectId(pbToken) {
  const listResp = await request(
    `${PB_URL}/api/collections/app_config/records?filter=key='fcm_project_id'&perPage=1`,
    { method: 'GET', headers: { Authorization: pbToken } },
  );
  if (listResp.status !== 200) return;
  const data = JSON.parse(listResp.body);
  if ((data.items || []).length > 0) return; // already set

  const body = JSON.stringify({ key: 'fcm_project_id', value: 'qorai-99b6e' });
  await request(`${PB_URL}/api/collections/app_config/records`, {
    method: 'POST',
    headers: {
      Authorization: pbToken,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);
  console.log('[4] Set fcm_project_id = qorai-99b6e');
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== FCM Token Refresh ===');
  const accessToken = await getGoogleAccessToken();
  const pbToken = await pbAdminLogin();
  await updatePbFcmToken(pbToken, accessToken);
  await ensureProjectId(pbToken);
  console.log('✓ Done. Run this script every 50 minutes to keep FCM working.');
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
