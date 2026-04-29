/**
 * Migration: Add chatMessages (json) and banned (bool) fields to support_messages collection
 * 
 * Usage: node add_support_chat_fields.js
 * Requires: POCKETBASE_URL, POCKETBASE_EMAIL, POCKETBASE_PASSWORD env vars
 *   or edit the constants below directly.
 */

const PB_URL = process.env.POCKETBASE_URL || 'https://your-pb-instance.com';
const PB_EMAIL = process.env.POCKETBASE_EMAIL || 'admin@example.com';
const PB_PASSWORD = process.env.POCKETBASE_PASSWORD || 'yourpassword';

async function run() {
  // 1. Admin auth
  const authRes = await fetch(`${PB_URL}/api/admins/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: PB_EMAIL, password: PB_PASSWORD }),
  });
  if (!authRes.ok) {
    console.error('Auth failed:', await authRes.text());
    process.exit(1);
  }
  const { token } = await authRes.json();
  console.log('✓ Auth OK');

  // 2. Get collection schema
  const colRes = await fetch(`${PB_URL}/api/collections/support_messages`, {
    headers: { Authorization: token },
  });
  if (!colRes.ok) {
    console.error('Collection fetch failed:', await colRes.text());
    process.exit(1);
  }
  const col = await colRes.json();
  console.log('✓ Collection fetched:', col.name);

  const existingNames = col.schema.map(f => f.name);
  const newFields = [];

  if (!existingNames.includes('chatMessages')) {
    newFields.push({
      name: 'chatMessages',
      type: 'json',
      required: false,
      options: {},
    });
    console.log('  + Adding chatMessages (json)');
  } else {
    console.log('  = chatMessages already exists, skipping');
  }

  if (!existingNames.includes('banned')) {
    newFields.push({
      name: 'banned',
      type: 'bool',
      required: false,
      options: {},
    });
    console.log('  + Adding banned (bool)');
  } else {
    console.log('  = banned already exists, skipping');
  }

  if (newFields.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  // 3. Update collection
  const updRes = await fetch(`${PB_URL}/api/collections/${col.id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: token,
    },
    body: JSON.stringify({
      schema: [...col.schema, ...newFields],
    }),
  });
  if (!updRes.ok) {
    console.error('Update failed:', await updRes.text());
    process.exit(1);
  }
  console.log('✓ Migration complete!');
}

run().catch(e => { console.error(e); process.exit(1); });
