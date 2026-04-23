#!/usr/bin/env node
/**
 * Refresh FCM v1 access token and store it in PocketBase app_config/fcm_access_token.
 *
 * Run via systemd timer every 50 minutes (FCM tokens last 60min):
 *   /etc/systemd/system/qorai-fcm.service
 *   /etc/systemd/system/qorai-fcm.timer
 *
 * Required env (in same folder, .env or exported):
 *   FCM_SERVICE_ACCOUNT_PATH  - path to Firebase service-account JSON
 *   PB_URL                    - PocketBase base URL (e.g. http://localhost:8090)
 *   PB_ADMIN_EMAIL            - PocketBase superuser email
 *   PB_ADMIN_PASSWORD         - PocketBase superuser password
 *
 * Dependencies: google-auth-library, dotenv
 *   npm i google-auth-library dotenv node-fetch
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const fs = require('fs');
const { GoogleAuth } = require('google-auth-library');

const SERVICE_ACCOUNT_PATH = process.env.FCM_SERVICE_ACCOUNT_PATH;
const PB_URL = process.env.PB_URL || 'http://127.0.0.1:8090';
const PB_ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL;
const PB_ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD;

if (!SERVICE_ACCOUNT_PATH || !fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('[fcm] FCM_SERVICE_ACCOUNT_PATH not set or file missing:', SERVICE_ACCOUNT_PATH);
  process.exit(1);
}
if (!PB_ADMIN_EMAIL || !PB_ADMIN_PASSWORD) {
  console.error('[fcm] PB_ADMIN_EMAIL / PB_ADMIN_PASSWORD must be set');
  process.exit(1);
}

const fetch = (...a) => import('node-fetch').then(({ default: f }) => f(...a));

async function getAccessToken() {
  const auth = new GoogleAuth({
    keyFilename: SERVICE_ACCOUNT_PATH,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });
  const client = await auth.getClient();
  const tk = await client.getAccessToken();
  if (!tk || !tk.token) throw new Error('Empty access token from Google');
  const sa = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
  return { token: tk.token, projectId: sa.project_id };
}

async function pbAuth() {
  const r = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity: PB_ADMIN_EMAIL, password: PB_ADMIN_PASSWORD }),
  });
  if (!r.ok) throw new Error(`PB auth failed ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return j.token;
}

async function pbUpsertConfig(authToken, key, value) {
  const headers = { 'content-type': 'application/json', authorization: authToken };
  const findRes = await fetch(`${PB_URL}/api/collections/app_config/records?filter=${encodeURIComponent(`key="${key}"`)}`, { headers });
  if (!findRes.ok) throw new Error(`PB find failed ${findRes.status}: ${await findRes.text()}`);
  const found = await findRes.json();
  const body = JSON.stringify({ key, value });
  if (found.items && found.items.length) {
    const id = found.items[0].id;
    const r = await fetch(`${PB_URL}/api/collections/app_config/records/${id}`, { method: 'PATCH', headers, body });
    if (!r.ok) throw new Error(`PB patch failed ${r.status}: ${await r.text()}`);
  } else {
    const r = await fetch(`${PB_URL}/api/collections/app_config/records`, { method: 'POST', headers, body });
    if (!r.ok) throw new Error(`PB create failed ${r.status}: ${await r.text()}`);
  }
}

(async () => {
  try {
    const { token, projectId } = await getAccessToken();
    console.log('[fcm] Got access token, length:', token.length, 'project:', projectId);
    const authToken = await pbAuth();
    await pbUpsertConfig(authToken, 'fcm_access_token', token);
    await pbUpsertConfig(authToken, 'fcm_project_id', projectId);
    console.log('[fcm] Stored token + projectId in app_config');
    process.exit(0);
  } catch (e) {
    console.error('[fcm] FAILED:', e.message);
    process.exit(1);
  }
})();
