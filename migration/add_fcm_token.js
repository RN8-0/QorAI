#!/usr/bin/env node
/**
 * migration/add_fcm_token.js
 * Adds fcmToken field to PocketBase users collection.
 * Run: node add_fcm_token.js
 */

import PocketBase from 'pocketbase';

const PB_URL = process.env.PB_URL || 'https://yv5z6sfeiogrv3jn4djss832.46.225.95.201.sslip.io';
const PB_EMAIL = process.env.PB_EMAIL;
const PB_PASSWORD = process.env.PB_PASSWORD;

if (!PB_EMAIL || !PB_PASSWORD) {
  console.error('Set PB_EMAIL and PB_PASSWORD env vars');
  process.exit(1);
}

const pb = new PocketBase(PB_URL);
await pb.admins.authWithPassword(PB_EMAIL, PB_PASSWORD);
console.log('Authenticated as admin');

// Get users collection schema
const usersCol = await pb.collections.getOne('users');
const schema = usersCol.schema || [];

// Check if fcmToken already exists
if (schema.find(f => f.name === 'fcmToken')) {
  console.log('fcmToken field already exists');
  process.exit(0);
}

// Add fcmToken field
const newField = {
  name: 'fcmToken',
  type: 'text',
  required: false,
  options: { min: null, max: null, pattern: '' },
};

await pb.collections.update('users', {
  schema: [...schema, newField],
});

console.log('✅ fcmToken field added to users collection');
