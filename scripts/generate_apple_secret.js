#!/usr/bin/env node
/**
 * Apple Sign-In Client Secret Generator for PocketBase
 *
 * Usage:
 *   node scripts/generate_apple_secret.js <path_to_.p8> <key_id> [team_id] [client_id]
 *
 * Example:
 *   node scripts/generate_apple_secret.js ./AuthKey_ABC123.p8 ABC1234DEF
 *
 * Defaults:
 *   team_id   = 8653CV8K7J
 *   client_id = com.qorai.app
 */

const fs = require('fs');
const jwt = require('jsonwebtoken');

const [,, p8Path, keyId, teamId = '8653CV8K7J', clientId = 'com.qorai.app'] = process.argv;

if (!p8Path || !keyId) {
  console.error('\n❌  Kullanım: node scripts/generate_apple_secret.js <p8_dosya_yolu> <key_id>\n');
  console.error('   Örnek:  node scripts/generate_apple_secret.js ./AuthKey_XYZ.p8 ABC1234DEF\n');
  process.exit(1);
}

if (!fs.existsSync(p8Path)) {
  console.error(`\n❌  Dosya bulunamadı: ${p8Path}\n`);
  process.exit(1);
}

const privateKey = fs.readFileSync(p8Path, 'utf8');

const now = Math.floor(Date.now() / 1000);
const payload = {
  iss: teamId,
  iat: now,
  exp: now + 15777000, // ~6 ay (Apple max)
  aud: 'https://appleid.apple.com',
  sub: clientId,
};

const secret = jwt.sign(payload, privateKey, {
  algorithm: 'ES256',
  header: { alg: 'ES256', kid: keyId },
});

console.log('\n✅  Apple Client Secret üretildi!\n');
console.log('─'.repeat(60));
console.log(secret);
console.log('─'.repeat(60));
console.log('\n📋  Bu token\'ı PocketBase Admin → users → Auth → Apple → Client Secret alanına yapıştır.');
console.log(`⏰  Geçerlilik: ~6 ay (${new Date((now + 15777000) * 1000).toLocaleDateString('tr-TR')} tarihine kadar)\n`);
