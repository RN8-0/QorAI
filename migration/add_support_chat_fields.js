/**
 * Migration: bring `support_messages` up to what the app + admin actually read.
 *
 * The collection was created with only
 *   id, userId, displayName, email, message, status, adminReply, repliedAt
 * while three writers assume more:
 *   - pb_hooks/notify_fcm.pb.js  (POST /api/support/contact) sets `chatMessages`
 *   - admin/js/support.js        reads `chatMessages` + writes `banned`
 *   - admin/js/support.js        sorts by `-created`
 * PocketBase silently drops `set()` calls for fields that do not exist, so the
 * whole conversation thread was thrown away on every write, `banned` never
 * stuck, and `sort=-created` answered 400 (no such column).
 *
 * Adds: chatMessages (json), banned (bool), created/updated (autodate)
 * Backfills chatMessages from message + adminReply for existing rows.
 *
 * The previous version of this file targeted the PocketBase <= 0.22 API
 * (`/api/admins/auth-with-password`, `collection.schema`); the live server is
 * 0.23+, where those are `/api/collections/_superusers/auth-with-password` and
 * `collection.fields` — which is why it never ran.
 *
 * Usage: node migration/add_support_chat_fields.js
 * Credentials come from migration/.env (POCKETBASE_URL / _ADMIN_EMAIL / _ADMIN_PASSWORD).
 */

const fs = require('fs');
const path = require('path');

const env = Object.fromEntries(
  fs.readFileSync(path.join(__dirname, '.env'), 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && line.includes('=') && !line.trim().startsWith('#'))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const PB_URL = process.env.POCKETBASE_URL || env.POCKETBASE_URL;
const PB_EMAIL = process.env.POCKETBASE_ADMIN_EMAIL || env.POCKETBASE_ADMIN_EMAIL;
const PB_PASSWORD = process.env.POCKETBASE_ADMIN_PASSWORD || env.POCKETBASE_ADMIN_PASSWORD;

const NEW_FIELDS = {
  chatMessages: {
    name: 'chatMessages',
    type: 'json',
    required: false,
    hidden: false,
    presentable: false,
    system: false,
    maxSize: 0,
  },
  banned: {
    name: 'banned',
    type: 'bool',
    required: false,
    hidden: false,
    presentable: false,
    system: false,
  },
  created: {
    name: 'created',
    type: 'autodate',
    onCreate: true,
    onUpdate: false,
    hidden: false,
    presentable: false,
    system: false,
  },
  updated: {
    name: 'updated',
    type: 'autodate',
    onCreate: true,
    onUpdate: true,
    hidden: false,
    presentable: false,
    system: false,
  },
};

const CREATED_INDEX = 'CREATE INDEX `idx_support_messages_created` ON `support_messages` (`created`)';

async function api(token, pathname, init = {}) {
  const res = await fetch(`${PB_URL}${pathname}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  let body = text;
  try { body = JSON.parse(text); } catch (_) {}
  if (!res.ok) {
    throw new Error(`${init.method || 'GET'} ${pathname} → ${res.status} ${text.slice(0, 500)}`);
  }
  return body;
}

function threadFrom(record) {
  const thread = [];
  const message = String(record.message || '').trim();
  const reply = String(record.adminReply || '').trim();
  if (message) {
    thread.push({
      role: record.status === 'admin_message' ? 'admin' : 'user',
      text: message,
      ts: record.created || record.repliedAt || '',
    });
  }
  if (reply) {
    thread.push({ role: 'admin', text: reply, ts: record.repliedAt || record.updated || '' });
  }
  return thread;
}

async function run() {
  if (!PB_URL || !PB_EMAIL || !PB_PASSWORD) {
    throw new Error('POCKETBASE_URL / POCKETBASE_ADMIN_EMAIL / POCKETBASE_ADMIN_PASSWORD missing');
  }

  const auth = await api(null, '/api/collections/_superusers/auth-with-password', {
    method: 'POST',
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASSWORD }),
  });
  const token = auth.token;
  if (!token) throw new Error('auth returned no token');
  console.log('✓ Auth OK');

  const col = await api(token, '/api/collections/support_messages');
  const fields = Array.isArray(col.fields) ? col.fields : [];
  const existing = new Set(fields.map((f) => f.name));
  console.log('✓ Collection fetched:', col.name, '— fields:', [...existing].join(', '));

  const missing = Object.values(NEW_FIELDS).filter((f) => !existing.has(f.name));
  const indexes = Array.isArray(col.indexes) ? [...col.indexes] : [];
  const needsIndex = !indexes.some((sql) => /idx_support_messages_created/.test(sql));

  if (missing.length) {
    for (const f of missing) console.log(`  + ${f.name} (${f.type})`);
    const payload = { fields: [...fields, ...missing] };
    if (needsIndex) payload.indexes = [...indexes, CREATED_INDEX];
    await api(token, `/api/collections/${col.id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    console.log('✓ Schema updated');
  } else {
    console.log('  = all fields already present');
    if (needsIndex) {
      await api(token, `/api/collections/${col.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ indexes: [...indexes, CREATED_INDEX] }),
      });
      console.log('✓ created index added');
    }
  }

  // Backfill: rebuild the thread for rows written before chatMessages existed.
  const list = await api(token, '/api/collections/support_messages/records?perPage=500');
  let patched = 0;
  for (const record of list.items || []) {
    const current = Array.isArray(record.chatMessages) ? record.chatMessages : [];
    const body = {};
    if (!current.length) {
      const thread = threadFrom(record);
      if (thread.length) body.chatMessages = thread;
    }
    if (record.banned !== true && record.banned !== false) body.banned = false;
    if (!Object.keys(body).length) continue;
    await api(token, `/api/collections/support_messages/records/${record.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    patched += 1;
  }
  console.log(`✓ Backfilled ${patched}/${(list.items || []).length} records`);

  // Prove the two calls the admin inbox actually makes now work.
  const sorted = await api(token, '/api/collections/support_messages/records?perPage=5&sort=-created');
  console.log(`✓ sort=-created OK — ${sorted.totalItems} records`);
  const first = (sorted.items || [])[0];
  if (first) {
    console.log('  sample:', JSON.stringify({
      id: first.id,
      displayName: first.displayName,
      status: first.status,
      banned: first.banned,
      chatMessages: first.chatMessages,
      created: first.created,
    }));
  }
}

run().catch((e) => { console.error(String(e)); process.exit(1); });
