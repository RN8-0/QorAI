#!/usr/bin/env node
/**
 * migration/add_apple_id_field.js
 *
 * Adds `appleId` (text) field to PocketBase users collection.
 * Required for native Sign In with Apple — stores Apple's stable `sub` identifier.
 *
 * Run once on the server:
 *   PB_EMAIL=admin@qorai.net PB_PASSWORD=xxx node migration/add_apple_id_field.js
 */

import PocketBase from 'pocketbase';

const PB_URL      = process.env.PB_URL      || 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';
const PB_EMAIL    = process.env.PB_EMAIL;
const PB_PASSWORD = process.env.PB_PASSWORD;

if (!PB_EMAIL || !PB_PASSWORD) {
  console.error('❌  Set PB_EMAIL and PB_PASSWORD env vars');
  process.exit(1);
}

const pb = new PocketBase(PB_URL);
await pb.admins.authWithPassword(PB_EMAIL, PB_PASSWORD);
console.log('✓ Authenticated as admin');

const usersCol = await pb.collections.getOne('users');
const schema   = usersCol.schema || [];

if (schema.find(f => f.name === 'appleId')) {
  console.log('ℹ  appleId field already exists — nothing to do.');
  process.exit(0);
}

const newField = {
  name:     'appleId',
  type:     'text',
  required: false,
  options:  { min: null, max: 200, pattern: '' },
};

await pb.collections.update('users', {
  schema: [...schema, newField],
});

console.log('✅  appleId field added to users collection.');
